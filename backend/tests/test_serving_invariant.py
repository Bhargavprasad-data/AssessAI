import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.course_material import CourseMaterial
from app.models.question import Question
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.attempt import Attempt
from app.models.serving import AttemptQuestionServing
from app.services.submission_service import serve_first_question_if_needed
from app.services.adaptive_engine import select_next_adaptive_question


@pytest.mark.asyncio
async def test_serving_invariant_and_candidate_exclusion(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="T", email="t@inv.com", password_hash="h", role="teacher", created_at=now)
    student = User(id=uuid.uuid4(), name="S", email="s@inv.com", password_hash="h", role="student", created_at=now)
    db_session.add_all([teacher, student])
    await db_session.flush()

    mat = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="m.pdf", storage_path="/tmp/m.pdf", uploaded_at=now)
    db_session.add(mat)
    await db_session.flush()

    q1 = Question(id=uuid.uuid4(), material_id=mat.id, text="Q1?", options=["A", "B", "C", "D"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    q2 = Question(id=uuid.uuid4(), material_id=mat.id, text="Q2?", options=["A", "B", "C", "D"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    db_session.add_all([q1, q2])

    assessment = Assessment(
        id=uuid.uuid4(), teacher_id=teacher.id, title="Invariant Test",
        time_limit_seconds=600, max_question_count=5, created_at=now
    )
    db_session.add(assessment)
    await db_session.flush()

    db_session.add(AssessmentQuestion(assessment_id=assessment.id, question_id=q1.id, difficulty=q1.difficulty))
    db_session.add(AssessmentQuestion(assessment_id=assessment.id, question_id=q2.id, difficulty=q2.difficulty))
    await db_session.flush()

    attempt = Attempt(
        id=uuid.uuid4(), assessment_id=assessment.id, student_id=student.id,
        started_at=now, last_heartbeat_at=now, status="in_progress",
        consent_ack_at=now, active_device_id="d1"
    )
    db_session.add(attempt)
    await db_session.commit()

    # 1. First question assignment
    served_q = await serve_first_question_if_needed(db_session, attempt, assessment)
    await db_session.commit()

    assert served_q is not None
    assert attempt.current_question_id == served_q.id
    assert attempt.current_question_started_at is not None

    # INVARIANT: attempt_question_servings MUST contain a record for this served question
    serving_rec = await db_session.scalar(
        select(AttemptQuestionServing).where(
            AttemptQuestionServing.attempt_id == attempt.id,
            AttemptQuestionServing.question_id == served_q.id
        )
    )
    assert serving_rec is not None
    assert serving_rec.sequence_number == 1

    # 2. Next question selection MUST exclude based on attempt_question_servings
    # Even without ANY row in attempt_answers!
    next_candidate = await select_next_adaptive_question(
        session=db_session,
        attempt=attempt,
        assessment=assessment,
        target_difficulty="easy"
    )
    assert next_candidate is not None
    # Cannot be the already served question!
    assert next_candidate.id != served_q.id
    assert next_candidate.id in (q1.id, q2.id)
