import logging
from datetime import datetime, timezone
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.attempt import Attempt
from app.models.assessment import Assessment
from app.services.submission_service import calculate_final_score

logger = logging.getLogger(__name__)


async def run_timer_expiry_sweep(session: AsyncSession) -> int:
    """
    Periodic sweep job (runs every 60s):
    - Identifies IN_PROGRESS and DISCONNECTED attempts.
    - Transitions idle IN_PROGRESS to DISCONNECTED if no heartbeat for 5 min.
    - Finalizes attempts as SUBMITTED if exam time_limit has elapsed (time_expired).
    - Finalizes DISCONNECTED attempts as SUBMITTED if disconnect cap elapsed (disconnect_timeout).
    - STRICT INVARIANT: Only produces SUBMITTED, NEVER TERMINATED.
    """
    now = datetime.now(timezone.utc)
    
    stmt = (
        select(Attempt)
        .where(Attempt.status.in_(["in_progress", "disconnected"]))
    )
    attempts = (await session.scalars(stmt)).all()
    
    finalized_count = 0
    has_changes = False

    for attempt in attempts:
        assessment = await session.get(Assessment, attempt.assessment_id)
        if not assessment:
            continue

        started_at = attempt.started_at
        if started_at and started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        last_heartbeat = attempt.last_heartbeat_at or started_at
        if last_heartbeat and last_heartbeat.tzinfo is None:
            last_heartbeat = last_heartbeat.replace(tzinfo=timezone.utc)

        exam_elapsed = (now - started_at).total_seconds() if started_at else 0
        idle_elapsed = (now - last_heartbeat).total_seconds() if last_heartbeat else 0

        # 1. Check overall exam timer expiry
        if exam_elapsed >= assessment.time_limit_seconds:
            logger.info(f"Sweep finalization: Attempt {attempt.id} exam timer expired ({exam_elapsed}s >= {assessment.time_limit_seconds}s).")
            attempt.status = "submitted"
            attempt.completion_reason = "time_expired"
            attempt.submitted_at = now
            attempt.current_question_id = None
            attempt.current_question_started_at = None
            attempt.final_score = await calculate_final_score(session, attempt, assessment)
            finalized_count += 1
            has_changes = True
            continue

        # 2. Check disconnect timeout cap (default 30 min)
        if attempt.status == "disconnected" and idle_elapsed >= settings.DISCONNECT_TIMEOUT_SECONDS:
            logger.info(f"Sweep finalization: Attempt {attempt.id} disconnected past timeout cap ({idle_elapsed}s >= {settings.DISCONNECT_TIMEOUT_SECONDS}s).")
            attempt.status = "submitted"
            attempt.completion_reason = "disconnect_timeout"
            attempt.submitted_at = now
            attempt.current_question_id = None
            attempt.current_question_started_at = None
            attempt.final_score = await calculate_final_score(session, attempt, assessment)
            finalized_count += 1
            has_changes = True
            continue

        # 3. Transition idle attempt to DISCONNECTED (if 5 minutes without heartbeat)
        if attempt.status == "in_progress" and idle_elapsed >= settings.DISCONNECT_IDLE_SECONDS:
            logger.info(f"Sweep update: Attempt {attempt.id} idle for {idle_elapsed}s -> moving to DISCONNECTED.")
            attempt.status = "disconnected"
            has_changes = True

    if has_changes:
        await session.commit()
    return finalized_count
