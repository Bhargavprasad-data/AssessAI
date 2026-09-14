import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.course_material import CourseMaterial
from app.models.question import Question
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.attempt import Attempt
from app.services.submission_service import serve_first_question_if_needed
from app.services.adaptive_engine import select_next_adaptive_question


@pytest.mark.asyncio
async def test_random_question_distribution(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="Teacher", email="teacher_rand@example.com", password_hash="h", role="teacher", created_at=now)
    students = [
        User(id=uuid.uuid4(), name=f"Student {i}", email=f"student_{i}@example.com", password_hash="h", role="student", created_at=now)
        for i in range(10)
    ]
    db_session.add(teacher)
    db_session.add_all(students)
    await db_session.flush()

    mat = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="material.pdf", storage_path="/tmp/mat.pdf", uploaded_at=now)
    db_session.add(mat)
    await db_session.flush()

    # Create a pool of 15 easy questions
    questions = [
        Question(id=uuid.uuid4(), material_id=mat.id, text=f"Question {i}?", options=["A", "B", "C", "D"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
        for i in range(15)
    ]
    db_session.add_all(questions)
    await db_session.flush()

    assessment = Assessment(
        id=uuid.uuid4(), teacher_id=teacher.id, title="Random Distribution Test",
        time_limit_seconds=600, max_question_count=5, created_at=now
    )
    db_session.add(assessment)
    await db_session.flush()

    for q in questions:
        db_session.add(AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, difficulty=q.difficulty))
    await db_session.flush()

    served_first_questions = set()
    for s in students:
        attempt = Attempt(
            id=uuid.uuid4(), assessment_id=assessment.id, student_id=s.id,
            started_at=now, last_heartbeat_at=now, status="in_progress",
            consent_ack_at=now, active_device_id="dev1"
        )
        db_session.add(attempt)
        await db_session.flush()

        served_q = await serve_first_question_if_needed(db_session, attempt, assessment)
        assert served_q is not None
        served_first_questions.add(served_q.id)

    # With 10 students and 15 questions, random selection will hit multiple different questions (not all same)
    assert len(served_first_questions) > 1
