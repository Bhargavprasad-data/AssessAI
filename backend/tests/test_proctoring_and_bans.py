import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.assessment import Assessment, AssessmentBan
from app.models.attempt import Attempt
from app.models.proctoring import Violation
from app.services.proctoring_service import record_violation_signal


@pytest.mark.asyncio
async def test_violation_debounce_dedup_and_configurable_threshold(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="T", email="t@v.com", password_hash="h", role="teacher", created_at=now)
    student = User(id=uuid.uuid4(), name="S", email="s@v.com", password_hash="h", role="student", created_at=now)
    db_session.add_all([teacher, student])
    await db_session.flush()

    # Configure assessment with max_violations = 2
    assessment = Assessment(
        id=uuid.uuid4(), teacher_id=teacher.id, title="Proctor Test",
        time_limit_seconds=600, max_violations=2, ban_on_violation_breach=True, created_at=now
    )
    db_session.add(assessment)
    await db_session.flush()

    attempt = Attempt(
        id=uuid.uuid4(), assessment_id=assessment.id, student_id=student.id, started_at=now,
        last_heartbeat_at=now, status="in_progress", consent_ack_at=now, active_device_id="d1"
    )
    db_session.add(attempt)
    await db_session.commit()

    # 1. First violation (tab_switch)
    rec1, count1, max_v, term1 = await record_violation_signal(
        session=db_session,
        attempt_id=attempt.id,
        violation_type="tab_switch"
    )
    assert rec1 is True
    assert count1 == 1
    assert max_v == 2
    assert term1 is False

    # 2. Immediate second violation of SAME type (within 2s debounce window)
    rec2, count2, _, term2 = await record_violation_signal(
        session=db_session,
        attempt_id=attempt.id,
        violation_type="tab_switch"
    )
    # Must be debounced
    assert rec2 is False
    assert count2 == 1
    assert term2 is False

    # 3. Violation of DIFFERENT type (e.g. copy) occurs in the same window -> counts separately!
    rec3, count3, _, term3 = await record_violation_signal(
        session=db_session,
        attempt_id=attempt.id,
        violation_type="copy"
    )
    assert rec3 is True
    assert count3 == 2
    # Threshold 2 is reached -> must terminate synchronously!
    assert term3 is True

    # Verify attempt row updated
    await db_session.refresh(attempt)
    assert attempt.status == "terminated"
    assert attempt.completion_reason == "violation_threshold"
    assert attempt.current_question_id is None

    # Verify assessment-specific ban row created with system actor
    ban = await db_session.scalar(
        select(AssessmentBan).where(
            AssessmentBan.assessment_id == assessment.id,
            AssessmentBan.student_id == student.id,
            AssessmentBan.revoked_at.is_(None)
        )
    )
    assert ban is not None
    assert ban.banned_by is None  # System automated ban
    assert ban.ban_source == "system_violation_threshold"
