from typing import Optional, List, Tuple
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.question import Question
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.serving import AttemptQuestionServing
from app.models.attempt import Attempt

DIFFICULTY_LEVELS = ["easy", "medium", "hard"]
DIFFICULTY_INDEX = {"easy": 0, "medium": 1, "hard": 2}


def is_response_fast(
    response_time_ms: int,
    per_question_time_limit_seconds: Optional[int],
    fast_response_threshold_seconds: int = 30
) -> bool:
    """
    Server-authoritative fast-response check:
    If per_question_time_limit_seconds is configured: response_time <= 50% of per-q limit
    Else: response_time <= fast_response_threshold_seconds
    """
    response_time_sec = response_time_ms / 1000.0
    if per_question_time_limit_seconds and per_question_time_limit_seconds > 0:
        threshold = per_question_time_limit_seconds * 0.5
    else:
        threshold = float(fast_response_threshold_seconds)
    return response_time_sec <= threshold


def update_adaptive_counters(
    current_difficulty: str,
    promotion_counter: int,
    demotion_counter: int,
    is_correct: bool,
    is_fast: bool = True,
    enable_speed_adaptive: bool = False,
    promotion_threshold: int = 1,
    demotion_threshold: int = 2,
    is_timeout: bool = False
) -> Tuple[str, int, int]:
    """
    Adaptive difficulty evaluation strictly enforcing rules and boundaries:
    
    EASY Level:
    - EASY + CORRECT -> Promotion event (promote to MEDIUM when promotion_threshold reached, else stay EASY).
    - EASY + WRONG -> Stay EASY (resets promotion streak; demotion counter stays 0 because EASY is minimum).
    - EASY + TIMEOUT -> Stay EASY (resets promotion streak; demotion counter stays 0 because EASY is minimum).
    - Bound: EASY cannot decrease below EASY.

    MEDIUM Level:
    - MEDIUM + CORRECT (+ FAST if speed-adaptive) -> Promotion event (promote to HARD when promotion_threshold reached, else stay MEDIUM).
    - MEDIUM + WRONG -> Demotion event (demote to EASY when demotion_threshold reached, else stay MEDIUM).
    - MEDIUM + TIMEOUT -> Demotion event (demote to EASY when demotion_threshold reached, else stay MEDIUM).
    - In speed-adaptive mode: MEDIUM + CORRECT (slow) -> Demotion event (demote to EASY when demotion_threshold reached).

    HARD Level:
    - HARD + CORRECT (+ FAST if speed-adaptive) -> Remain HARD (HARD is maximum limit, stays HARD).
    - HARD + WRONG -> Demotion event (demote to MEDIUM when demotion_threshold reached, else stay HARD).
    - HARD + TIMEOUT -> Demotion event (demote to MEDIUM when demotion_threshold reached, else stay HARD).
    - In speed-adaptive mode: HARD + CORRECT (slow) -> Demotion event (demote to MEDIUM when demotion_threshold reached).

    Boundary Invariants:
    - EASY: cannot decrease below easy.
    - MEDIUM: can increase to hard or decrease to easy.
    - HARD: cannot increase above hard.
    """
    curr_diff = current_difficulty.lower()
    if curr_diff not in DIFFICULTY_INDEX:
        curr_diff = "easy"

    prom_th = max(1, promotion_threshold)
    dem_th = max(1, demotion_threshold)

    # 1. EASY Level
    if curr_diff == "easy":
        if is_timeout or not is_correct:
            # EASY + WRONG or EASY + TIMEOUT -> Stay EASY, reset counters
            return "easy", 0, 0
        else:
            # EASY + CORRECT -> Promotion event
            new_prom = promotion_counter + 1
            if new_prom >= prom_th:
                return "medium", 0, 0
            return "easy", new_prom, 0

    # 2. MEDIUM Level
    elif curr_diff == "medium":
        if is_timeout or not is_correct:
            # MEDIUM + WRONG or MEDIUM + TIMEOUT -> Demotion event
            new_dem = demotion_counter + 1
            if new_dem >= dem_th:
                return "easy", 0, 0
            return "medium", 0, new_dem
        else:
            # is_correct == True
            if enable_speed_adaptive and not is_fast:
                # Speed-adaptive slow correct answer -> Demotion event
                new_dem = demotion_counter + 1
                if new_dem >= dem_th:
                    return "easy", 0, 0
                return "medium", 0, new_dem
            else:
                # Correct (+ Fast if speed-adaptive) -> Promotion event
                new_prom = promotion_counter + 1
                if new_prom >= prom_th:
                    return "hard", 0, 0
                return "medium", new_prom, 0

    # 3. HARD Level
    else:  # curr_diff == "hard"
        if is_timeout or not is_correct:
            # HARD + WRONG or HARD + TIMEOUT -> Demotion event
            new_dem = demotion_counter + 1
            if new_dem >= dem_th:
                return "medium", 0, 0
            return "hard", 0, new_dem
        else:
            # is_correct == True
            if enable_speed_adaptive and not is_fast:
                # Speed-adaptive slow correct answer -> Demotion event
                new_dem = demotion_counter + 1
                if new_dem >= dem_th:
                    return "medium", 0, 0
                return "hard", 0, new_dem
            else:
                # HARD + CORRECT (+ FAST) -> Remain HARD (maximum)
                return "hard", 0, 0


async def get_served_question_ids(session: AsyncSession, attempt_id) -> List:
    """
    Authoritative query: Gets ALL question IDs ever served to this attempt
    strictly from attempt_question_servings.
    """
    stmt = select(AttemptQuestionServing.question_id).where(
        AttemptQuestionServing.attempt_id == attempt_id
    )
    result = await session.scalars(stmt)
    return list(result.all())


async def select_next_adaptive_question(
    session: AsyncSession,
    attempt: Attempt,
    assessment: Assessment,
    target_difficulty: str
) -> Optional[Question]:
    """
    Selects the next eligible question for the attempt:
    1. Query served question IDs from attempt_question_servings.
    2. Try unused non-retired question at target difficulty (randomized order).
    3. Fall back to nearest available difficulty (randomized order).
    4. Never repeat a served question.
    5. Return None if pool is exhausted.
    """
    served_ids = await get_served_question_ids(session, attempt.id)

    target_idx = DIFFICULTY_INDEX.get(target_difficulty.lower(), 0)
    # Search priority: target, then adjacent by distance
    search_order: List[str] = [target_difficulty.lower()]
    for distance in [1, 2]:
        for step in [-distance, distance]:
            idx = target_idx + step
            if 0 <= idx < len(DIFFICULTY_LEVELS):
                diff = DIFFICULTY_LEVELS[idx]
                if diff not in search_order:
                    search_order.append(diff)

    for diff in search_order:
        stmt = (
            select(Question)
            .join(AssessmentQuestion, AssessmentQuestion.question_id == Question.id)
            .where(
                AssessmentQuestion.assessment_id == assessment.id,
                func.lower(AssessmentQuestion.difficulty) == diff.lower(),
                Question.retired_at.is_(None)
            )
        )
        if served_ids:
            stmt = stmt.where(Question.id.not_in(served_ids))
        
        # Random distribution across available eligible questions in this difficulty tier
        stmt = stmt.order_by(func.random()).limit(1)
        candidate = (await session.execute(stmt)).scalar_one_or_none()
        if candidate:
            return candidate

    return None
