import uuid
import pytest
from httpx import AsyncClient
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.assessment import Assessment
from app.models.attempt import Attempt
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_apply_assessment_ban_endpoint(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(
        id=uuid.uuid4(),
        name="Teacher Ban Test",
        email=f"teacher_{uuid.uuid4().hex[:6]}@school.com",
        password_hash="hash",
        role="teacher",
        created_at=now
    )
    student = User(
        id=uuid.uuid4(),
        name="Student Ban Test",
        email=f"student_{uuid.uuid4().hex[:6]}@school.com",
        password_hash="hash",
        role="student",
        created_at=now
    )
    db_session.add_all([teacher, student])
    await db_session.flush()

    assessment = Assessment(
        id=uuid.uuid4(),
        teacher_id=teacher.id,
        title="Ban Test Assessment",
        time_limit_seconds=600,
        max_violations=3,
        created_at=now
    )
    db_session.add(assessment)
    await db_session.flush()

    attempt = Attempt(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        student_id=student.id,
        started_at=now,
        consent_ack_at=now,
        status="in_progress",
        active_device_id="dev-1"
    )
    db_session.add(attempt)
    await db_session.commit()

    token = create_access_token(data={"sub": str(teacher.id), "role": "teacher", "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        f"/api/teacher/assessments/{assessment.id}/bans/{student.id}?reason=Window%20switching",
        headers=headers
    )
    assert resp.status_code == 200, f"Error {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data["assessment_id"] == str(assessment.id)
    assert data["student_id"] == str(student.id)
    assert data["ban_source"] == "manual_teacher"
    assert data["reason"] == "Window switching"
