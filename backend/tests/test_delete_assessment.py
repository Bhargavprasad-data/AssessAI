import pytest
import uuid
from httpx import AsyncClient
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.course_material import CourseMaterial
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.attempt import Attempt
from app.models.question import Question
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_teacher_and_admin_delete_assessments(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="Prof X", email="profx@test.com", password_hash="hash", role="teacher", created_at=now)
    admin = User(id=uuid.uuid4(), name="Admin Super", email="admin@test.com", password_hash="hash", role="admin", created_at=now)
    student = User(id=uuid.uuid4(), name="Student Y", email="studenty@test.com", password_hash="hash", role="student", created_at=now)
    db_session.add_all([teacher, admin, student])
    await db_session.commit()

    mat = CourseMaterial(
        id=uuid.uuid4(),
        teacher_id=teacher.id,
        filename="notes.pdf",
        storage_path="materials/notes.pdf",
        uploaded_at=now
    )
    db_session.add(mat)
    await db_session.commit()

    # Create questions
    q1 = Question(
        id=uuid.uuid4(),
        material_id=mat.id,
        text="What is 2+2?",
        options=["1", "2", "3", "4"],
        correct_option_index=3,
        difficulty="easy",
        source_chunk_ref="chunk_0"
    )
    db_session.add(q1)
    await db_session.commit()

    # Create published assessment with an attempt
    assessment1 = Assessment(
        id=uuid.uuid4(),
        teacher_id=teacher.id,
        title="Midterm Exam to Delete",
        time_limit_seconds=3600,
        status="published",
        created_at=now
    )
    db_session.add(assessment1)
    await db_session.flush()

    aq = AssessmentQuestion(assessment_id=assessment1.id, question_id=q1.id, difficulty="easy")
    db_session.add(aq)

    attempt = Attempt(
        id=uuid.uuid4(),
        assessment_id=assessment1.id,
        student_id=student.id,
        status="submitted",
        consent_ack_at=now,
        active_device_id="dev-123",
        final_score=10.0,
        started_at=now,
        last_heartbeat_at=now
    )
    db_session.add(attempt)
    await db_session.commit()

    teacher_token = create_access_token({"sub": str(teacher.id), "role": "teacher"})
    admin_token = create_access_token({"sub": str(admin.id), "role": "admin"})

    # Teacher deletes their own published assessment with attempts
    res = await client.delete(
        f"/api/teacher/assessments/{assessment1.id}",
        cookies={"access_token": teacher_token}
    )
    assert res.status_code == 200
    assert "deleted successfully" in res.json()["message"]

    # Verify assessment is gone from DB
    deleted = await db_session.get(Assessment, assessment1.id)
    assert deleted is None

    # Verify attempt is gone from DB
    deleted_attempt = await db_session.get(Attempt, attempt.id)
    assert deleted_attempt is None

    # Now create another assessment for Admin deletion test (Past / Closed)
    assessment2 = Assessment(
        id=uuid.uuid4(),
        teacher_id=teacher.id,
        title="Admin Target Closed Exam",
        time_limit_seconds=1800,
        status="closed",
        created_at=now
    )
    db_session.add(assessment2)
    await db_session.commit()

    # Admin lists assessments
    res_list = await client.get(
        "/api/admin/assessments",
        cookies={"access_token": admin_token}
    )
    assert res_list.status_code == 200
    assert any(a["id"] == str(assessment2.id) for a in res_list.json())

    # Admin deletes the assessment
    res_del = await client.delete(
        f"/api/admin/assessments/{assessment2.id}",
        cookies={"access_token": admin_token}
    )
    assert res_del.status_code == 200
    assert "deleted successfully by administrator" in res_del.json()["message"]

    # Verify it is deleted
    deleted2 = await db_session.get(Assessment, assessment2.id)
    assert deleted2 is None
