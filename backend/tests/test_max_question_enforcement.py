import uuid
import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.course_material import CourseMaterial
from app.models.question import Question
from app.models.assessment import Assessment, AssessmentQuestion
from app.models.attempt import Attempt
from app.models.serving import AttemptQuestionServing
from app.services.submission_service import submit_answer_atomically


@pytest.mark.asyncio
async def test_atomic_max_question_count_enforcement(db_session: AsyncSession):
    now = datetime.now(timezone.utc)

    # 1. Create Teacher & Student
    teacher = User(id=uuid.uuid4(), name="Teacher", email="t@test.com", password_hash="hash", role="teacher", created_at=now)
    student = User(id=uuid.uuid4(), name="Student", email="s@test.com", password_hash="hash", role="student", created_at=now)
    db_session.add_all([teacher, student])
    await db_session.flush()

    # 2. Create Material & Questions
    mat = CourseMaterial(id=uuid.uuid4(), teacher_id=teacher.id, filename="mat.pdf", storage_path="/tmp/mat.pdf", uploaded_at=now)
    db_session.add(mat)
    await db_session.flush()

    questions = []
    for i in range(5):
        q = Question(
            id=uuid.uuid4(),
            material_id=mat.id,
            text=f"Question {i+1}?",
            options=["A", "B", "C", "D"],
            correct_option_index=0,
            difficulty="easy",
            source_chunk_ref="Chunk 1"
        )
        questions.append(q)
        db_session.add(q)
    await db_session.flush()

    # 3. Create Assessment with max_question_count = 2
    assessment = Assessment(
        id=uuid.uuid4(),
        teacher_id=teacher.id,
        title="Test 2 Questions",
        time_limit_seconds=600,
        per_question_time_limit_seconds=60,
        max_question_count=2,  # EXACTLY 2 QUESTIONS MAX
        promotion_threshold=2,
        demotion_threshold=2,
        max_violations=3,
        status="published",
        created_at=now
    )
    db_session.add(assessment)
    await db_session.flush()

    for q in questions:
        db_session.add(AssessmentQuestion(assessment_id=assessment.id, question_id=q.id, difficulty=q.difficulty))
    await db_session.flush()

    # 4. Create Attempt starting with Question 1
    attempt = Attempt(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        student_id=student.id,
        started_at=now,
        last_heartbeat_at=now,
        status="in_progress",
        consent_ack_at=now,
        active_device_id="device1",
        current_question_id=questions[0].id,
        current_question_started_at=now
    )
    db_session.add(attempt)
    db_session.add(AttemptQuestionServing(
        id=uuid.uuid4(),
        attempt_id=attempt.id,
        question_id=questions[0].id,
        served_at=now,
        sequence_number=1
    ))
    await db_session.commit()

    # Submit Answer 1 (Count becomes 1, < max_question_count 2)
    att1, next_q1, res1 = await submit_answer_atomically(
        session=db_session,
        attempt_id=attempt.id,
        student_id=student.id,
        question_id=questions[0].id,
        selected_option_index=0
    )
    assert att1.status == "in_progress"
    assert next_q1 is not None
    assert att1.current_question_id == next_q1.id
    assert res1["status"] == "in_progress"

    # Submit Answer 2 (Count becomes 2, >= max_question_count 2)
    att2, next_q2, res2 = await submit_answer_atomically(
        session=db_session,
        attempt_id=attempt.id,
        student_id=student.id,
        question_id=next_q1.id,
        selected_option_index=0
    )

    # STRICT INVARIANTS:
    # 1. Status is submitted
    assert att2.status == "submitted"
    # 2. Completion reason is strictly max_questions_reached
    assert att2.completion_reason == "max_questions_reached"
    # 3. current_question_id is NULL
    assert att2.current_question_id is None
    # 4. current_question_started_at is NULL
    assert att2.current_question_started_at is None
    # 5. No next question is served
    assert next_q2 is None
    # 6. Final score is computed
    assert att2.final_score > 0
