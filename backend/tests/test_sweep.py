import uuid
import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.assessment import Assessment
from app.models.attempt import Attempt
from app.services.sweep_service import run_timer_expiry_sweep


@pytest.mark.asyncio
async def test_sweep_finalizes_as_submitted_never_terminated(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="T", email="t@sw.com", password_hash="h", role="teacher", created_at=now)
    student1 = User(id=uuid.uuid4(), name="S1", email="s1@sw.com", password_hash="h", role="student", created_at=now)
    student2 = User(id=uuid.uuid4(), name="S2", email="s2@sw.com", password_hash="h", role="student", created_at=now)
    student3 = User(id=uuid.uuid4(), name="S3", email="s3@sw.com", password_hash="h", role="student", created_at=now)
    db_session.add_all([teacher, student1, student2, student3])
    await db_session.flush()

    # Assessment with 2-hour limit (7200 seconds)
    assessment = Assessment(
        id=uuid.uuid4(), teacher_id=teacher.id, title="Sweep Test",
        time_limit_seconds=7200,
        max_question_count=5, created_at=now
    )
    # Assessment with 30-minute limit (1800 seconds)
    assessment_short = Assessment(
        id=uuid.uuid4(), teacher_id=teacher.id, title="Short Sweep Test",
        time_limit_seconds=1800,
        max_question_count=5, created_at=now
    )
    db_session.add_all([assessment, assessment_short])
    await db_session.flush()

    # Attempt 1: Started 35 minutes ago on 30-min exam -> exam timer expired!
    att1 = Attempt(
        id=uuid.uuid4(), assessment_id=assessment_short.id, student_id=student1.id,
        started_at=now - timedelta(minutes=35), last_heartbeat_at=now - timedelta(minutes=1),
        status="in_progress", consent_ack_at=now, active_device_id="d1"
    )

    # Attempt 2: Started 40 minutes ago on 2-hour exam (time_limit not expired), but disconnected 35 min ago (>= 30 min cap)
    att2 = Attempt(
        id=uuid.uuid4(), assessment_id=assessment.id, student_id=student2.id,
        started_at=now - timedelta(minutes=40), last_heartbeat_at=now - timedelta(minutes=35),
        status="disconnected", consent_ack_at=now, active_device_id="d2"
    )

    # Attempt 3: In progress, idle 6 minutes ago (>= 5 min idle threshold)
    att3 = Attempt(
        id=uuid.uuid4(), assessment_id=assessment.id, student_id=student3.id,
        started_at=now - timedelta(minutes=10), last_heartbeat_at=now - timedelta(minutes=6),
        status="in_progress", consent_ack_at=now, active_device_id="d3"
    )

    db_session.add_all([att1, att2, att3])
    await db_session.commit()

    # Run sweep job
    finalized = await run_timer_expiry_sweep(db_session)
    assert finalized == 2

    await db_session.refresh(att1)
    await db_session.refresh(att2)
    await db_session.refresh(att3)

    # Invariant checks:
    # Attempt 1 -> SUBMITTED with time_expired
    assert att1.status == "submitted"
    assert att1.completion_reason == "time_expired"

    # Attempt 2 -> SUBMITTED with disconnect_timeout
    assert att2.status == "submitted"
    assert att2.completion_reason == "disconnect_timeout"

    # Attempt 3 -> Transitioned to DISCONNECTED
    assert att3.status == "disconnected"

    # Verify sweep NEVER sets terminated
    assert att1.status != "terminated"
    assert att2.status != "terminated"
    assert att3.status != "terminated"
