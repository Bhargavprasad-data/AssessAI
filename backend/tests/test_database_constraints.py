import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import insert

from app.models.user import User
from app.models.course_material import CourseMaterial
from app.models.question import Question
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.attempt import Attempt
from app.models.serving import AttemptQuestionServing


@pytest.mark.asyncio
async def test_assessment_questions_primary_key_prevents_duplicates(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="Teacher", email="t@c.com", password_hash="h", role="teacher", created_at=now)
    db_session.add(teacher)
    await db_session.flush()

    mat = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="m.pdf", storage_path="/tmp/m.pdf", uploaded_at=now)
    db_session.add(mat)
    await db_session.flush()

    q = Question(
        id=uuid.uuid4(), material_id=mat.id, text="Q1?", options=["A", "B", "C", "D"],
        correct_option_index=0, difficulty="easy", source_chunk_ref="Ref"
    )
    db_session.add(q)

    a1 = Assessment(id=uuid.uuid4(), teacher_id=teacher.id, title="A1", time_limit_seconds=60, max_question_count=5, created_at=now)
    a2 = Assessment(id=uuid.uuid4(), teacher_id=teacher.id, title="A2", time_limit_seconds=60, max_question_count=5, created_at=now)
    db_session.add_all([a1, a2])
    await db_session.flush()

    a1_id = a1.id
    a2_id = a2.id
    q_id = q.id
    diff = q.difficulty

    # 1. First assignment to Assessment 1 succeeds
    await db_session.execute(
        insert(AssessmentQuestion).values(assessment_id=a1_id, question_id=q_id, difficulty=diff)
    )
    await db_session.commit()

    # 2. Re-assigning same question to Assessment 1 must raise IntegrityError at DB level
    with pytest.raises(IntegrityError):
        await db_session.execute(
            insert(AssessmentQuestion).values(assessment_id=a1_id, question_id=q_id, difficulty=diff)
        )
        await db_session.commit()
    await db_session.rollback()

    # 3. Assigning the SAME question to a DIFFERENT assessment (A2) must succeed!
    await db_session.execute(
        insert(AssessmentQuestion).values(assessment_id=a2_id, question_id=q_id, difficulty=diff)
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_attempt_question_servings_dual_uniqueness(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="Teacher", email="t2@c.com", password_hash="h", role="teacher", created_at=now)
    student = User(id=uuid.uuid4(), name="Student", email="s2@c.com", password_hash="h", role="student", created_at=now)
    db_session.add_all([teacher, student])
    await db_session.flush()

    mat = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="m.pdf", storage_path="/tmp/m.pdf", uploaded_at=now)
    db_session.add(mat)
    await db_session.flush()

    q1 = Question(id=uuid.uuid4(), material_id=mat.id, text="Q1?", options=["A", "B", "C", "D"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    q2 = Question(id=uuid.uuid4(), material_id=mat.id, text="Q2?", options=["A", "B", "C", "D"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    db_session.add_all([q1, q2])

    a = Assessment(id=uuid.uuid4(), teacher_id=teacher.id, title="A", time_limit_seconds=60, max_question_count=5, created_at=now)
    db_session.add(a)
    await db_session.flush()

    attempt = Attempt(
        id=uuid.uuid4(), assessment_id=a.id, student_id=student.id, started_at=now,
        last_heartbeat_at=now, status="in_progress", consent_ack_at=now, active_device_id="d1"
    )
    db_session.add(attempt)
    await db_session.commit()

    attempt_id = attempt.id
    q1_id = q1.id
    q2_id = q2.id

    # Serving 1: Q1 at sequence 1
    await db_session.execute(
        insert(AttemptQuestionServing).values(
            id=uuid.uuid4(), attempt_id=attempt_id, question_id=q1_id, served_at=now, sequence_number=1
        )
    )
    await db_session.commit()

    # Attempt to re-serve Q1 at sequence 2 (duplicate question violation)
    with pytest.raises(IntegrityError):
        await db_session.execute(
            insert(AttemptQuestionServing).values(
                id=uuid.uuid4(), attempt_id=attempt_id, question_id=q1_id, served_at=now, sequence_number=2
            )
        )
        await db_session.commit()
    await db_session.rollback()

    # Attempt to serve Q2 at sequence 1 (duplicate sequence violation)
    with pytest.raises(IntegrityError):
        await db_session.execute(
            insert(AttemptQuestionServing).values(
                id=uuid.uuid4(), attempt_id=attempt_id, question_id=q2_id, served_at=now, sequence_number=1
            )
        )
        await db_session.commit()
    await db_session.rollback()
