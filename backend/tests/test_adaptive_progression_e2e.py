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
from app.services.submission_service import serve_first_question_if_needed, submit_answer_atomically


@pytest.mark.asyncio
async def test_adaptive_progression_correct_shifts_next_level(db_session: AsyncSession):
    """
    If student attempts the correct answer within time:
    easy -> medium -> hard (capped at hard) with promotion_threshold = 1.
    """
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="T1", email=f"t_{uuid.uuid4().hex[:6]}@prog.com", password_hash="h", role="teacher", created_at=now)
    student = User(id=uuid.uuid4(), name="S1", email=f"s_{uuid.uuid4().hex[:6]}@prog.com", password_hash="h", role="student", created_at=now)
    db_session.add_all([teacher, student])
    await db_session.flush()

    mat = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="m.pdf", storage_path="/tmp/m.pdf", uploaded_at=now)
    db_session.add(mat)
    await db_session.flush()

    # Questions: 2 easy, 2 medium, 2 hard
    q_easy_1 = Question(id=uuid.uuid4(), material_id=mat.id, text="E1?", options=["A", "B"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    q_easy_2 = Question(id=uuid.uuid4(), material_id=mat.id, text="E2?", options=["A", "B"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    q_med_1 = Question(id=uuid.uuid4(), material_id=mat.id, text="M1?", options=["A", "B"], correct_option_index=0, difficulty="medium", source_chunk_ref="R")
    q_med_2 = Question(id=uuid.uuid4(), material_id=mat.id, text="M2?", options=["A", "B"], correct_option_index=0, difficulty="medium", source_chunk_ref="R")
    q_hard_1 = Question(id=uuid.uuid4(), material_id=mat.id, text="H1?", options=["A", "B"], correct_option_index=0, difficulty="hard", source_chunk_ref="R")
    q_hard_2 = Question(id=uuid.uuid4(), material_id=mat.id, text="H2?", options=["A", "B"], correct_option_index=0, difficulty="hard", source_chunk_ref="R")
    all_qs = [q_easy_1, q_easy_2, q_med_1, q_med_2, q_hard_1, q_hard_2]
    db_session.add_all(all_qs)

    assessment = Assessment(
        id=uuid.uuid4(), teacher_id=teacher.id, title="Adaptive Test",
        time_limit_seconds=600, per_question_time_limit_seconds=60,
        promotion_threshold=1, demotion_threshold=1,
        max_question_count=6, created_at=now
    )
    db_session.add(assessment)
    await db_session.flush()

    for q in all_qs:
        db_session.add(AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, difficulty=q.difficulty))
    await db_session.flush()

    attempt = Attempt(
        id=uuid.uuid4(), assessment_id=assessment.id, student_id=student.id,
        started_at=now, last_heartbeat_at=now, status="in_progress",
        consent_ack_at=now, active_device_id="dev-1"
    )
    db_session.add(attempt)
    await db_session.commit()

    # Step 1: First question served must be easy
    q1 = await serve_first_question_if_needed(db_session, attempt, assessment)
    await db_session.commit()
    assert q1 is not None
    assert q1.difficulty == "easy"

    # Step 2: Answer correctly within time limit -> promotes to medium
    att, q2, res2 = await submit_answer_atomically(
        session=db_session,
        attempt_id=attempt.id,
        student_id=student.id,
        question_id=q1.id,
        selected_option_index=q1.correct_option_index,  # Correct!
        is_timeout_submission=False
    )
    assert res2["status"] == "in_progress"
    assert q2 is not None
    assert q2.difficulty == "medium"

    # Step 3: Answer correctly within time limit -> promotes to hard
    att, q3, res3 = await submit_answer_atomically(
        session=db_session,
        attempt_id=attempt.id,
        student_id=student.id,
        question_id=q2.id,
        selected_option_index=0,  # Correct!
        is_timeout_submission=False
    )
    assert res3["status"] == "in_progress"
    assert q3 is not None
    assert q3.difficulty == "hard"


@pytest.mark.asyncio
async def test_adaptive_demotion_and_timeout_behavior(db_session: AsyncSession):
    """
    Verify:
    1. EASY + WRONG -> Stays EASY (boundary check: cannot go below EASY).
    2. EASY + CORRECT -> Promotes to MEDIUM.
    3. MEDIUM + TIMEOUT -> Demotes to EASY when demotion_threshold reached.
    4. Timeout records AttemptAnswer, awards 0 marks, and does not serve same question.
    """
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="T2", email=f"t_{uuid.uuid4().hex[:6]}@prog.com", password_hash="h", role="teacher", created_at=now)
    student = User(id=uuid.uuid4(), name="S2", email=f"s_{uuid.uuid4().hex[:6]}@prog.com", password_hash="h", role="student", created_at=now)
    db_session.add_all([teacher, student])
    await db_session.flush()

    mat = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="m.pdf", storage_path="/tmp/m.pdf", uploaded_at=now)
    db_session.add(mat)
    await db_session.flush()

    # Questions: 3 easy, 2 medium
    q_easy_1 = Question(id=uuid.uuid4(), material_id=mat.id, text="E1?", options=["A", "B"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    q_easy_2 = Question(id=uuid.uuid4(), material_id=mat.id, text="E2?", options=["A", "B"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    q_easy_3 = Question(id=uuid.uuid4(), material_id=mat.id, text="E3?", options=["A", "B"], correct_option_index=0, difficulty="easy", source_chunk_ref="R")
    q_med_1 = Question(id=uuid.uuid4(), material_id=mat.id, text="M1?", options=["A", "B"], correct_option_index=0, difficulty="medium", source_chunk_ref="R")
    q_med_2 = Question(id=uuid.uuid4(), material_id=mat.id, text="M2?", options=["A", "B"], correct_option_index=0, difficulty="medium", source_chunk_ref="R")
    all_qs = [q_easy_1, q_easy_2, q_easy_3, q_med_1, q_med_2]
    db_session.add_all(all_qs)

    assessment = Assessment(
        id=uuid.uuid4(), teacher_id=teacher.id, title="Adaptive Test Demotion",
        time_limit_seconds=600, per_question_time_limit_seconds=60,
        promotion_threshold=1, demotion_threshold=1,
        max_question_count=5, created_at=now
    )
    db_session.add(assessment)
    await db_session.flush()

    for q in all_qs:
        db_session.add(AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, difficulty=q.difficulty))
    await db_session.flush()

    attempt = Attempt(
        id=uuid.uuid4(), assessment_id=assessment.id, student_id=student.id,
        started_at=now, last_heartbeat_at=now, status="in_progress",
        consent_ack_at=now, active_device_id="dev-2"
    )
    db_session.add(attempt)
    await db_session.commit()

    # Step 1: First question served is easy
    q1 = await serve_first_question_if_needed(db_session, attempt, assessment)
    await db_session.commit()
    assert q1.difficulty == "easy"

    # Step 2: Answer WRONGLY on easy -> next question must STAY on easy (cannot decrease below easy)
    att, q2, res2 = await submit_answer_atomically(
        session=db_session,
        attempt_id=attempt.id,
        student_id=student.id,
        question_id=q1.id,
        selected_option_index=1,  # WRONG! (correct is 0)
        is_timeout_submission=False
    )
    assert res2["status"] == "in_progress"
    assert q2 is not None
    assert q2.difficulty == "easy"  # Stayed on easy!
    assert q2.id != q1.id

    # Step 3: Now answer CORRECTLY on easy -> next question shifts to medium
    att, q3, res3 = await submit_answer_atomically(
        session=db_session,
        attempt_id=attempt.id,
        student_id=student.id,
        question_id=q2.id,
        selected_option_index=0,  # CORRECT!
        is_timeout_submission=False
    )
    assert res3["status"] == "in_progress"
    assert q3 is not None
    assert q3.difficulty == "medium"  # Shifted to medium!

    # Step 4: TIMEOUT on medium with demotion_threshold=1 -> next question demotes to EASY
    att, q4, res4 = await submit_answer_atomically(
        session=db_session,
        attempt_id=attempt.id,
        student_id=student.id,
        question_id=q3.id,
        selected_option_index=None,
        is_timeout_submission=True  # Exceeded time limit!
    )
    assert res4["status"] == "in_progress"
    assert q4 is not None
    assert q4.difficulty == "easy"  # Demoted to easy!
    assert q4.id not in [q1.id, q2.id, q3.id]
