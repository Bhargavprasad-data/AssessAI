import uuid
import pytest
from httpx import AsyncClient
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User
from app.models.assessment import Assessment
from app.models.attempt import Attempt
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_registration_ignores_client_role_and_blocks_admin(client: AsyncClient, db_session: AsyncSession):
    # Attempt to register with client-sent role 'admin' in request body
    payload = {
        "name": "Hacker",
        "email": "hacker@test.com",
        "password": "Password123!",
        "role": "admin"  # Injected body role
    }
    # Public registration only determines role via query param; body role is ignored (defaults to 'student')
    response = await client.post("/api/auth/register", json=payload)
    assert response.status_code == 200
    data = response.json()
    # Role must be 'student', NOT injected body 'admin'
    assert data["user"]["role"] == "student"

    # Explicit registration as admin via query parameter (for Admin portal port 3002)
    response_admin = await client.post("/api/auth/register?role=admin", json={
        "name": "Admin User",
        "email": "admin_registered@test.com",
        "password": "Password123!"
    })
    assert response_admin.status_code == 200
    assert response_admin.json()["user"]["role"] == "admin"

    # Attempt to register with invalid role query param
    response_invalid = await client.post("/api/auth/register?role=superhacker", json={
        "name": "Hacker2",
        "email": "hacker2@test.com",
        "password": "Password123!"
    })
    # FastAPI schema validation rejects role outside 'teacher' | 'student' | 'admin'
    assert response_invalid.status_code == 422


@pytest.mark.asyncio
async def test_global_ban_force_terminates_in_progress_attempts(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    admin = User(id=uuid.uuid4(), name="Admin", email="a@g.com", password_hash="h", role="admin", created_at=now)
    teacher = User(id=uuid.uuid4(), name="Teacher", email="t@g.com", password_hash="h", role="teacher", created_at=now)
    student = User(id=uuid.uuid4(), name="Student", email="s@g.com", password_hash="h", role="student", created_at=now)
    db_session.add_all([admin, teacher, student])
    await db_session.flush()

    a1 = Assessment(id=uuid.uuid4(), teacher_id=teacher.id, title="Exam 1", time_limit_seconds=600, max_question_count=5, created_at=now)
    a2 = Assessment(id=uuid.uuid4(), teacher_id=teacher.id, title="Exam 2", time_limit_seconds=600, max_question_count=5, created_at=now)
    db_session.add_all([a1, a2])
    await db_session.flush()

    # Active attempt in Exam 1
    att1 = Attempt(
        id=uuid.uuid4(), assessment_id=a1.id, student_id=student.id, started_at=now,
        last_heartbeat_at=now, status="in_progress", consent_ack_at=now, active_device_id="d1"
    )
    # Disconnected attempt in Exam 2
    att2 = Attempt(
        id=uuid.uuid4(), assessment_id=a2.id, student_id=student.id, started_at=now,
        last_heartbeat_at=now, status="disconnected", consent_ack_at=now, active_device_id="d2"
    )
    db_session.add_all([att1, att2])
    await db_session.commit()

    # Admin applies global ban
    admin_token = create_access_token({"sub": str(admin.id), "role": "admin"})
    response = await client.post(
        f"/api/admin/users/{student.id}/ban?reason=Academic+integrity+breach",
        cookies={"access_token": admin_token}
    )
    assert response.status_code == 200
    assert response.json()["is_banned"] is True

    # Check that ALL student attempts across all assessments are force-terminated!
    await db_session.refresh(att1)
    await db_session.refresh(att2)

    assert att1.status == "terminated"
    assert att1.completion_reason == "banned"

    assert att2.status == "terminated"
    assert att2.completion_reason == "banned"
