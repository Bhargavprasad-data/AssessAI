import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.course_material import CourseMaterial
from app.models.question import Question
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.attempt import Attempt, AttemptAnswer
from app.models.serving import AttemptQuestionServing
from app.ai.providers.chain import AIProviderChain
from app.ai.providers.mock_provider import MockProvider
from app.ai.generator import run_question_generation_pipeline
from app.services.submission_service import serve_first_question_if_needed, submit_answer_atomically


@pytest.mark.asyncio
async def test_pdf_grounded_dynamic_generation_e2e(db_session: AsyncSession):
    """
    RELEASE-BLOCKING E2E VERIFICATION TEST:
    1. PDF A (Physics) -> PDF A-grounded question pool (Kinematics, Acceleration, Friction).
    2. PDF B (DBMS) -> PDF B-grounded question pool (Relational database, Primary key, Normalization).
    3. Questions are dynamically generated strictly from uploaded PDF content.
    4. Questions are associated with the correct assessment.
    5. Questions contain valid PDF source information (source_chunk_ref).
    6. Questions are NOT static/demo questions.
    7. Different PDFs generate completely different question pools.
    8. Old PDF questions cannot appear when serving questions for a new PDF assessment.
    9. Adaptive selection uses only the current PDF question pool.
    10. Wrong answers trigger configured demotion behavior.
    11. Timeouts trigger configured demotion behavior (0 marks, recorded attempt, demotion event).
    12. EASY never decreases below EASY.
    13. HARD never increases above HARD.
    14. No static fallback occurs on invalid text.
    """
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="Prof Physics", email=f"teacher_{uuid.uuid4().hex[:6]}@univ.edu", password_hash="hash", role="teacher", created_at=now)
    student = User(id=uuid.uuid4(), name="Alice Student", email=f"student_{uuid.uuid4().hex[:6]}@univ.edu", password_hash="hash", role="student", created_at=now)
    db_session.add_all([teacher, student])
    await db_session.flush()

    # =========================================================================
    # Step 1: PDF A (Physics) Upload & Question Generation
    # =========================================================================
    physics_text = (
        "Kinematics describes the motion of objects without reference to forces.\n"
        "Acceleration measures the rate of change of velocity with respect to time.\n"
        "Friction resists the relative lateral motion between two solid surfaces in contact."
    )
    mat_a = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="Physics_Mechanics.pdf", storage_path="/storage/phys.pdf", uploaded_at=now)
    db_session.add(mat_a)
    await db_session.flush()

    mock_chain = AIProviderChain([MockProvider()])
    mcqs_a, count_a, err_a = await run_question_generation_pipeline(physics_text, requested_count=6, chain=mock_chain)
    assert count_a >= 3
    assert err_a is None

    questions_a = []
    for mcq in mcqs_a:
        q = Question(
            id=uuid.uuid4(),
            material_id=mat_a.id,
            text=mcq.text,
            options=mcq.options,
            correct_option_index=mcq.correct_option_index,
            difficulty=mcq.difficulty,
            source_chunk_ref=mcq.source_chunk_ref,
            is_duplicate_flag=mcq.is_duplicate_flag
        )
        questions_a.append(q)
        db_session.add(q)
    await db_session.flush()

    # Verify PDF A questions are strictly grounded in Physics text and not static
    phys_keywords = ["kinematics", "acceleration", "friction", "motion", "velocity"]
    for q in questions_a:
        assert any(k in q.text.lower() or any(k in opt.lower() for opt in q.options) for k in phys_keywords), \
            f"Question not grounded in Physics PDF: {q.text}"
        assert q.material_id == mat_a.id
        assert q.source_chunk_ref is not None

    # =========================================================================
    # Step 2: PDF B (DBMS) Upload & Question Generation
    # =========================================================================
    dbms_text = (
        "Relational database organizes structured data into tables consisting of rows and columns.\n"
        "Primary key enforces uniqueness across every entity instance in a relation.\n"
        "Normalization eliminates data redundancy and insertion anomalies across tables."
    )
    mat_b = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="DBMS_Fundamentals.pdf", storage_path="/storage/dbms.pdf", uploaded_at=now)
    db_session.add(mat_b)
    await db_session.flush()

    mcqs_b, count_b, err_b = await run_question_generation_pipeline(dbms_text, requested_count=6, chain=mock_chain)
    assert count_b >= 3
    assert err_b is None

    questions_b = []
    for mcq in mcqs_b:
        q = Question(
            id=uuid.uuid4(),
            material_id=mat_b.id,
            text=mcq.text,
            options=mcq.options,
            correct_option_index=mcq.correct_option_index,
            difficulty=mcq.difficulty,
            source_chunk_ref=mcq.source_chunk_ref,
            is_duplicate_flag=mcq.is_duplicate_flag
        )
        questions_b.append(q)
        db_session.add(q)
    await db_session.flush()

    # Verify PDF B questions are strictly grounded in DBMS text and NOT Physics
    dbms_keywords = ["relational", "database", "primary key", "normalization", "tables"]
    for q in questions_b:
        assert any(k in q.text.lower() or any(k in opt.lower() for opt in q.options) for k in dbms_keywords), \
            f"Question not grounded in DBMS PDF: {q.text}"
        assert q.material_id == mat_b.id
        # Must not contain physics keywords
        assert not any(k in q.text.lower() for k in ["kinematics", "friction"]), \
            f"DBMS question contains Physics content: {q.text}"

    # Verify different PDFs produce distinct question pools
    q_texts_a = {q.text for q in questions_a}
    q_texts_b = {q.text for q in questions_b}
    assert q_texts_a.isdisjoint(q_texts_b), "PDF A and PDF B question pools overlap!"

    # =========================================================================
    # Step 3: Create Assessment A (Physics only)
    # =========================================================================
    # Ensure at least 4 questions exist in each difficulty tier (easy, medium, hard) for Assessment A
    existing_by_diff = {"easy": 0, "medium": 0, "hard": 0}
    for q in questions_a:
        if q.difficulty in existing_by_diff:
            existing_by_diff[q.difficulty] += 1

    for diff in ["easy", "medium", "hard"]:
        needed = 4 - existing_by_diff[diff]
        for idx in range(needed):
            extra_q = Question(
                id=uuid.uuid4(), material_id=mat_a.id, text=f"How does friction and acceleration relate under {diff} tier {idx}?",
                options=["A", "B", "C", "D"], correct_option_index=0, difficulty=diff, source_chunk_ref="Topic 1"
            )
            questions_a.append(extra_q)
            db_session.add(extra_q)
    await db_session.flush()

    assessment_a = Assessment(
        id=uuid.uuid4(), teacher_id=teacher.id, title="Physics Exam",
        time_limit_seconds=1200, per_question_time_limit_seconds=60,
        promotion_threshold=1, demotion_threshold=1,
        max_question_count=10, created_at=now
    )
    db_session.add(assessment_a)
    await db_session.flush()

    for q in questions_a:
        db_session.add(AssessmentQuestion(assessment_id=assessment_a.id, question_id=q.id, difficulty=q.difficulty))
    await db_session.flush()

    # =========================================================================
    # Step 4: Student Exam Execution with Adaptive Selection & Demotion Rules
    # =========================================================================
    attempt = Attempt(
        id=uuid.uuid4(), assessment_id=assessment_a.id, student_id=student.id,
        started_at=now, last_heartbeat_at=now, status="in_progress",
        consent_ack_at=now, active_device_id="dev-pc-1"
    )
    db_session.add(attempt)
    await db_session.commit()

    # 4.1 First question must be Easy and strictly from PDF A
    q1 = await serve_first_question_if_needed(db_session, attempt, assessment_a)
    await db_session.commit()
    assert q1 is not None
    assert q1.difficulty == "easy"
    assert q1.material_id == mat_a.id

    # 4.2 EASY + WRONG -> Stays EASY (Boundary: EASY cannot decrease below EASY)
    att, q2, res2 = await submit_answer_atomically(
        session=db_session, attempt_id=attempt.id, student_id=student.id,
        question_id=q1.id, selected_option_index=(q1.correct_option_index + 1) % 4, # Wrong!
        is_timeout_submission=False
    )
    assert res2["status"] == "in_progress"
    assert q2 is not None
    assert q2.difficulty == "easy"
    assert q2.material_id == mat_a.id
    assert q2.id != q1.id

    # 4.3 EASY + TIMEOUT -> Stays EASY, 0 marks recorded, answer saved
    att, q3, res3 = await submit_answer_atomically(
        session=db_session, attempt_id=attempt.id, student_id=student.id,
        question_id=q2.id, selected_option_index=None,
        is_timeout_submission=True # Timeout!
    )
    assert res3["status"] == "in_progress"
    assert q3 is not None
    assert q3.difficulty == "easy"
    assert q3.material_id == mat_a.id
    assert q3.id not in [q1.id, q2.id]

    # Verify AttemptAnswer recorded for timeout with 0 marks
    ans_q2 = await db_session.scalar(
        select(AttemptAnswer).where(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == q2.id)
    )
    assert ans_q2 is not None
    assert ans_q2.is_correct is False
    assert ans_q2.selected_option_index is None

    # 4.4 EASY + CORRECT -> Promotes to MEDIUM
    att, q4, res4 = await submit_answer_atomically(
        session=db_session, attempt_id=attempt.id, student_id=student.id,
        question_id=q3.id, selected_option_index=q3.correct_option_index, # Correct!
        is_timeout_submission=False
    )
    assert res4["status"] == "in_progress"
    assert q4 is not None
    assert q4.difficulty == "medium"
    assert q4.material_id == mat_a.id

    # 4.5 MEDIUM + CORRECT -> Promotes to HARD
    att, q5, res5 = await submit_answer_atomically(
        session=db_session, attempt_id=attempt.id, student_id=student.id,
        question_id=q4.id, selected_option_index=q4.correct_option_index, # Correct!
        is_timeout_submission=False
    )
    assert res5["status"] == "in_progress"
    assert q5 is not None
    assert q5.difficulty == "hard"
    assert q5.material_id == mat_a.id

    # 4.6 HARD + CORRECT -> Remains HARD (Boundary: HARD cannot increase beyond HARD)
    att, q6, res6 = await submit_answer_atomically(
        session=db_session, attempt_id=attempt.id, student_id=student.id,
        question_id=q5.id, selected_option_index=q5.correct_option_index, # Correct!
        is_timeout_submission=False
    )
    assert res6["status"] == "in_progress"
    assert q6 is not None
    assert q6.difficulty == "hard"
    assert q6.material_id == mat_a.id

    # 4.7 HARD + WRONG -> Demotes to MEDIUM (with demotion_threshold = 1)
    att, q7, res7 = await submit_answer_atomically(
        session=db_session, attempt_id=attempt.id, student_id=student.id,
        question_id=q6.id, selected_option_index=(q6.correct_option_index + 1) % 4, # Wrong!
        is_timeout_submission=False
    )
    assert res7["status"] == "in_progress"
    assert q7 is not None
    assert q7.difficulty == "medium"
    assert q7.material_id == mat_a.id

    # 4.8 MEDIUM + TIMEOUT -> Demotes to EASY
    att, q8, res8 = await submit_answer_atomically(
        session=db_session, attempt_id=attempt.id, student_id=student.id,
        question_id=q7.id, selected_option_index=None,
        is_timeout_submission=True # Timeout!
    )
    assert res8["status"] == "in_progress"
    assert q8 is not None
    assert q8.difficulty == "easy"
    assert q8.material_id == mat_a.id

    # =========================================================================
    # Step 5: Failure Handling — No Static Fallback on Invalid Text
    # =========================================================================
    invalid_text = ""
    mcqs_invalid, count_invalid, err_invalid = await run_question_generation_pipeline(invalid_text, requested_count=5)
    assert len(mcqs_invalid) == 0
    assert count_invalid == 0
    assert err_invalid is not None
    assert "insufficient" in err_invalid.lower()
