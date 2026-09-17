import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.attempt import Attempt, AttemptAnswer
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.question import Question
from app.models.serving import AttemptQuestionServing
from app.services.adaptive_engine import (
    is_response_fast, update_adaptive_counters, select_next_adaptive_question
)


async def calculate_final_score(session: AsyncSession, attempt: Attempt, assessment: Assessment) -> float:
    """
    Computes final score purely server-side from recorded attempt answers
    evaluated against snapshot difficulty weights.
    """
    stmt = select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id)
    answers = (await session.scalars(stmt)).all()
    
    weights = assessment.scoring_weights or {"easy": 1, "medium": 2, "hard": 3}
    total_score = 0.0
    for ans in answers:
        if ans.is_correct:
            diff = ans.difficulty_at_time.lower()
            total_score += float(weights.get(diff, 1.0))
    return total_score


async def serve_first_question_if_needed(
    session: AsyncSession,
    attempt: Attempt,
    assessment: Assessment
) -> Optional[Question]:
    """
    Assigns the first question to an attempt if not already assigned.
    Enforces the atomic question assignment invariant:
    1. Insert into attempt_question_servings.
    2. Set current_question_id.
    3. Set current_question_started_at.
    """
    if attempt.current_question_id:
        return await session.get(Question, attempt.current_question_id)

    # Check for any previously served question for this attempt that was not yet answered
    stmt = (
        select(AttemptQuestionServing)
        .where(
            AttemptQuestionServing.attempt_id == attempt.id,
            AttemptQuestionServing.question_id.not_in(
                select(AttemptAnswer.question_id).where(AttemptAnswer.attempt_id == attempt.id)
            )
        )
        .order_by(AttemptQuestionServing.sequence_number.desc())
        .limit(1)
    )
    unanswered_serving = (await session.execute(stmt)).scalar_one_or_none()
    if unanswered_serving:
        q = await session.get(Question, unanswered_serving.question_id)
        if q:
            attempt.current_question_id = q.id
            attempt.current_question_started_at = datetime.now(timezone.utc)
            return q

    first_q = await select_next_adaptive_question(
        session=session,
        attempt=attempt,
        assessment=assessment,
        target_difficulty="easy"
    )
    if not first_q:
        return None

    now = datetime.now(timezone.utc)
    serving = AttemptQuestionServing(
        id=uuid.uuid4(),
        attempt_id=attempt.id,
        question_id=first_q.id,
        served_at=now,
        sequence_number=1
    )
    session.add(serving)
    attempt.current_question_id = first_q.id
    attempt.current_question_started_at = now
    return first_q


async def submit_answer_atomically(
    session: AsyncSession,
    attempt_id: uuid.UUID,
    student_id: uuid.UUID,
    question_id: uuid.UUID,
    selected_option_index: Optional[int],
    is_timeout_submission: bool = False
) -> Tuple[Attempt, Optional[Question], Dict[str, Any]]:
    """
    Single atomic database transaction handling answer submission,
    counter evaluation, max_question_count check, and next-question serving.
    """
    # 1. Lock attempt row with row-level locking FOR UPDATE
    stmt = select(Attempt).where(Attempt.id == attempt_id).with_for_update()
    attempt = (await session.execute(stmt)).scalar_one_or_none()

    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    if attempt.student_id != student_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized access to attempt")

    if attempt.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit answer: Attempt is already {attempt.status} ({attempt.completion_reason})"
        )

    # 2. Fetch assessment
    assessment = await session.get(Assessment, attempt.assessment_id)
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    now = datetime.now(timezone.utc)

    # 3. Check exam-level timer
    started_at = attempt.started_at
    if started_at and started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    exam_elapsed_seconds = (now - started_at).total_seconds() if started_at else 0
    if exam_elapsed_seconds >= assessment.time_limit_seconds:
        attempt.status = "submitted"
        attempt.completion_reason = "time_expired"
        attempt.submitted_at = now
        attempt.current_question_id = None
        attempt.current_question_started_at = None
        attempt.final_score = await calculate_final_score(session, attempt, assessment)
        await session.commit()
        return attempt, None, {"status": "submitted", "reason": "time_expired"}

    # 4. Verify question being answered is current_question_id
    if attempt.current_question_id != question_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submitted question does not match the currently active question for this attempt"
        )

    # Fetch question and snapshot difficulty
    current_q = await session.get(Question, question_id)
    if not current_q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    aq_stmt = select(AssessmentQuestion).where(
        AssessmentQuestion.assessment_id == assessment.id,
        AssessmentQuestion.question_id == question_id
    )
    aq = (await session.execute(aq_stmt)).scalar_one_or_none()
    snapshot_diff = aq.difficulty if aq else current_q.difficulty

    # 5. Check per-question timeout
    q_started_at = attempt.current_question_started_at or now
    if q_started_at and q_started_at.tzinfo is None:
        q_started_at = q_started_at.replace(tzinfo=timezone.utc)
    q_elapsed_seconds = (now - q_started_at).total_seconds()
    per_q_limit = assessment.per_question_time_limit_seconds

    is_per_q_timed_out = is_timeout_submission or (per_q_limit is not None and q_elapsed_seconds >= per_q_limit)

    if is_per_q_timed_out:
        # Per-question timeout behavior:
        # 1. Unanswered (selected_option_index=None), 0 marks (is_correct=False)
        # 2. Treat the timeout as an adaptive demotion event
        is_correct = False
        final_selected_index = None
        response_time_ms = int(per_q_limit * 1000) if per_q_limit else int(q_elapsed_seconds * 1000)
        is_fast = False

        target_diff, new_prom, new_dem = update_adaptive_counters(
            current_difficulty=snapshot_diff,
            promotion_counter=attempt.promotion_counter,
            demotion_counter=attempt.demotion_counter,
            is_correct=False,
            is_fast=False,
            enable_speed_adaptive=assessment.enable_speed_adaptive,
            promotion_threshold=assessment.promotion_threshold,
            demotion_threshold=assessment.demotion_threshold,
            is_timeout=True
        )
        attempt.promotion_counter = new_prom
        attempt.demotion_counter = new_dem
    else:
        # Normal submission
        if selected_option_index is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="selected_option_index is required")
        
        response_time_ms = int(q_elapsed_seconds * 1000)
        is_correct = (selected_option_index == current_q.correct_option_index)
        is_fast = is_response_fast(
            response_time_ms=response_time_ms,
            per_question_time_limit_seconds=per_q_limit,
            fast_response_threshold_seconds=assessment.fast_response_threshold_seconds
        )

        target_diff, new_prom, new_dem = update_adaptive_counters(
            current_difficulty=snapshot_diff,
            promotion_counter=attempt.promotion_counter,
            demotion_counter=attempt.demotion_counter,
            is_correct=is_correct,
            is_fast=is_fast,
            enable_speed_adaptive=assessment.enable_speed_adaptive,
            promotion_threshold=assessment.promotion_threshold,
            demotion_threshold=assessment.demotion_threshold,
            is_timeout=False
        )
        attempt.promotion_counter = new_prom
        attempt.demotion_counter = new_dem
        final_selected_index = selected_option_index

    # Update highest difficulty reached
    diff_order = {"easy": 0, "medium": 1, "hard": 2}
    if diff_order.get(target_diff, 0) > diff_order.get(attempt.highest_difficulty_reached, 0):
        attempt.highest_difficulty_reached = target_diff

    # 6. Record AttemptAnswer row
    answer_row = AttemptAnswer(
        id=uuid.uuid4(),
        attempt_id=attempt.id,
        question_id=question_id,
        selected_option_index=final_selected_index,
        is_correct=is_correct,
        response_time_ms=response_time_ms,
        difficulty_at_time=snapshot_diff,
        submitted_at=now
    )
    session.add(answer_row)

    # 7. EXPLICIT FLUSH: Ensure row is counted in transaction
    await session.flush()

    # 8. Count submitted answers
    answers_count = await session.scalar(
        select(func.count(AttemptAnswer.id)).where(AttemptAnswer.attempt_id == attempt.id)
    )

    next_question: Optional[Question] = None

    # 9. Atomic Max Question Enforcement
    if answers_count >= assessment.max_question_count:
        attempt.status = "submitted"
        attempt.completion_reason = "max_questions_reached"
        attempt.submitted_at = now
        attempt.current_question_id = None
        attempt.current_question_started_at = None
        attempt.final_score = await calculate_final_score(session, attempt, assessment)
        action_result = {"status": "submitted", "reason": "max_questions_reached"}
    else:
        # Select next question
        next_question = await select_next_adaptive_question(
            session=session,
            attempt=attempt,
            assessment=assessment,
            target_difficulty=target_diff
        )

        if not next_question:
            # Pool exhausted
            attempt.status = "submitted"
            attempt.completion_reason = "no_questions_remaining"
            attempt.submitted_at = now
            attempt.current_question_id = None
            attempt.current_question_started_at = None
            attempt.final_score = await calculate_final_score(session, attempt, assessment)
            action_result = {"status": "submitted", "reason": "no_questions_remaining"}
        else:
            # 4-STEP ATOMIC INVARIANT: Serving record + current question pointers
            next_seq = answers_count + 1
            serving = AttemptQuestionServing(
                id=uuid.uuid4(),
                attempt_id=attempt.id,
                question_id=next_question.id,
                served_at=now,
                sequence_number=next_seq
            )
            session.add(serving)
            attempt.current_question_id = next_question.id
            attempt.current_question_started_at = now
            action_result = {
                "status": "in_progress",
                "question_sequence": next_seq,
                "difficulty": target_diff
            }

    await session.commit()
    return attempt, next_question, action_result
