import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.config import settings
from app.models.attempt import Attempt
from app.models.assessment import Assessment, AssessmentBan
from app.models.proctoring import Violation, DeviceSwitchLog
from app.services.submission_service import calculate_final_score


async def record_violation_signal(
    session: AsyncSession,
    attempt_id: uuid.UUID,
    violation_type: str,
    metadata: Optional[Dict[str, Any]] = None
) -> Tuple[bool, int, int, bool]:
    """
    Records a proctoring signal with:
    - 2-second per-type debounce
    - await session.flush()
    - synchronous termination when count >= assessment.max_violations
    - atomic assessment-specific ban creation
    Returns: (is_recorded, total_violations, max_violations, is_terminated)
    """
    now = datetime.now(timezone.utc)

    # 1. Lock attempt row with FOR UPDATE
    stmt = select(Attempt).where(Attempt.id == attempt_id).with_for_update()
    attempt = (await session.execute(stmt)).scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    if attempt.status != "in_progress":
        return False, 0, 0, False

    assessment = await session.get(Assessment, attempt.assessment_id)
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # 2. Debounce check: recent violation of SAME type within 2 seconds
    debounce_window = timedelta(seconds=settings.VIOLATION_DEBOUNCE_SECONDS)
    window_start = now - debounce_window
    recent_stmt = (
        select(Violation)
        .where(
            Violation.attempt_id == attempt_id,
            Violation.type == violation_type,
            Violation.occurred_at >= window_start
        )
        .order_by(desc(Violation.occurred_at))
        .limit(1)
    )
    recent_violation = (await session.execute(recent_stmt)).scalar_one_or_none()

    if recent_violation:
        # Debounced: Skip recording duplicate event
        current_count = await session.scalar(
            select(func.count(Violation.id)).where(Violation.attempt_id == attempt_id)
        )
        return False, current_count or 0, assessment.max_violations, False

    # 3. Add Violation row
    new_violation = Violation(
        id=uuid.uuid4(),
        attempt_id=attempt_id,
        type=violation_type,
        occurred_at=now,
        metadata_json=metadata
    )
    session.add(new_violation)

    # 4. EXPLICIT FLUSH: Ensure row is counted in transaction buffer
    await session.flush()

    # 5. Count total violations for this attempt
    total_violations = await session.scalar(
        select(func.count(Violation.id)).where(Violation.attempt_id == attempt_id)
    )
    total_violations = total_violations or 0

    is_terminated = False

    # 6. Check configurable threshold
    if total_violations >= assessment.max_violations:
        is_terminated = True
        attempt.status = "terminated"
        attempt.completion_reason = "violation_threshold"
        attempt.submitted_at = now
        attempt.current_question_id = None
        attempt.current_question_started_at = None
        attempt.final_score = await calculate_final_score(session, attempt, assessment)

        # Apply assessment-specific ban atomically if configured
        if assessment.ban_on_violation_breach:
            existing_ban = await session.scalar(
                select(AssessmentBan).where(
                    AssessmentBan.assessment_id == assessment.id,
                    AssessmentBan.student_id == attempt.student_id,
                    AssessmentBan.revoked_at.is_(None)
                )
            )
            if not existing_ban:
                ban = AssessmentBan(
                    id=uuid.uuid4(),
                    assessment_id=assessment.id,
                    student_id=attempt.student_id,
                    banned_at=now,
                    banned_by=None,  # System automated ban
                    ban_source="system_violation_threshold",
                    reason=f"Automated: Exceeded violation threshold ({assessment.max_violations} violations)"
                )
                session.add(ban)

    await session.commit()
    return True, total_violations, assessment.max_violations, is_terminated


async def record_device_switch(
    session: AsyncSession,
    attempt: Attempt,
    assessment: Assessment,
    new_device_id: str
) -> bool:
    """
    Logs device switch in device_switch_log.
    If assessment.device_switch_as_violation is enabled, also triggers a violation.
    """
    if attempt.active_device_id == new_device_id:
        return False

    now = datetime.now(timezone.utc)
    log_entry = DeviceSwitchLog(
        id=uuid.uuid4(),
        attempt_id=attempt.id,
        previous_device_id=attempt.active_device_id,
        new_device_id=new_device_id,
        occurred_at=now
    )
    session.add(log_entry)
    attempt.active_device_id = new_device_id

    if assessment.device_switch_as_violation and attempt.status == "in_progress":
        await record_violation_signal(
            session=session,
            attempt_id=attempt.id,
            violation_type="device_switch",
            metadata={"previous_device": log_entry.previous_device_id, "new_device": new_device_id}
        )
    else:
        await session.commit()

    return True
