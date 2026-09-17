import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, and_, desc, case, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.assessment import Assessment, AssessmentQuestion, AssessmentBan
from app.models.attempt import Attempt, AttemptAnswer
from app.models.question import Question
from app.models.serving import AttemptQuestionServing
from app.models.proctoring import Violation
from app.schemas.assessment import AssessmentOut
from app.schemas.attempt import (
    AttemptJoinRequest, CurrentQuestionOut, AnswerSubmitRequest,
    AnswerSubmitResponse, AttemptResultsOut, AnswerReviewItem
)
from app.api.deps import require_student
from app.ai.cleaner import clean_question_text
from app.services.submission_service import (
    submit_answer_atomically, serve_first_question_if_needed
)
from app.services.proctoring_service import record_device_switch

router = APIRouter(prefix="/student", tags=["Student Exam Flow"], dependencies=[Depends(require_student)])


def build_current_question_payload(
    attempt: Attempt,
    assessment: Assessment,
    question: Question,
    snapshot_diff: str,
    question_number: int
) -> CurrentQuestionOut:
    now = datetime.now(timezone.utc)
    started_at = attempt.started_at
    if started_at and started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    exam_elapsed = (now - started_at).total_seconds() if started_at else 0
    exam_remaining = max(0, int(assessment.time_limit_seconds - exam_elapsed))

    per_q_remaining: Optional[int] = None
    if assessment.per_question_time_limit_seconds:
        q_start = attempt.current_question_started_at or now
        if q_start and q_start.tzinfo is None:
            q_start = q_start.replace(tzinfo=timezone.utc)
        q_elapsed = (now - q_start).total_seconds()
        per_q_remaining = max(0, int(assessment.per_question_time_limit_seconds - q_elapsed))

    return CurrentQuestionOut(
        attempt_id=attempt.id,
        question_id=question.id,
        text=clean_question_text(question.text),
        options=question.options,
        difficulty=snapshot_diff,
        question_number=question_number,
        max_questions=assessment.max_question_count,
        time_remaining_seconds=exam_remaining,
        per_question_time_remaining_seconds=per_q_remaining
    )


@router.get("/assessments")
@router.get("/assessments/available")
async def list_available_assessments(
    current_student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(Assessment)
        .join(User, Assessment.teacher_id == User.id)
        .where(
            Assessment.status == "published",
            User.role == "teacher"
        )
        .order_by(desc(Assessment.created_at))
    )
    assessments = (await db.scalars(stmt)).all()

    results = []
    for a in assessments:
        # Check if student holds active ban
        ban = await db.scalar(
            select(AssessmentBan).where(
                AssessmentBan.assessment_id == a.id,
                AssessmentBan.student_id == current_student.id,
                AssessmentBan.revoked_at.is_(None)
            )
        )
        # Check if student already completed or has active attempt
        existing_attempt = await db.scalar(
            select(Attempt).where(
                Attempt.assessment_id == a.id,
                Attempt.student_id == current_student.id
            ).order_by(desc(Attempt.started_at)).limit(1)
        )

        existing_status = existing_attempt.status if existing_attempt else None
        existing_id = str(existing_attempt.id) if existing_attempt else None

        if existing_attempt and existing_attempt.status == "terminated" and ban is None:
            # Student is unbanned/eligible to resume
            existing_status = "in_progress"

        now_check = datetime.now(timezone.utc)
        is_upcoming = False
        is_expired = False
        if a.scheduled_start_at:
            st = a.scheduled_start_at
            if st.tzinfo is None:
                st = st.replace(tzinfo=timezone.utc)
            if now_check < st:
                is_upcoming = True

        if a.scheduled_end_at:
            et = a.scheduled_end_at
            if et.tzinfo is None:
                et = et.replace(tzinfo=timezone.utc)
            if now_check > et:
                is_expired = True

        results.append({
            "id": str(a.id),
            "title": a.title,
            "time_limit_seconds": a.time_limit_seconds,
            "per_question_time_limit_seconds": a.per_question_time_limit_seconds,
            "max_question_count": a.max_question_count,
            "is_banned": ban is not None,
            "ban_reason": ban.reason if ban else None,
            "existing_attempt_status": existing_status,
            "existing_attempt_id": existing_id,
            "scheduled_start_at": a.scheduled_start_at.isoformat() if a.scheduled_start_at else None,
            "scheduled_end_at": a.scheduled_end_at.isoformat() if a.scheduled_end_at else None,
            "is_upcoming": is_upcoming,
            "is_expired": is_expired,
            "can_attempt": not is_upcoming and not is_expired and not ban
        })
    return results


@router.post("/assessments/{assessment_id}/join")
async def join_assessment(
    assessment_id: uuid.UUID,
    data: AttemptJoinRequest,
    current_student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db)
):
    if not data.consent_ack:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Consent acknowledgement is strictly required before starting the assessment."
        )

    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.status != "published":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment is not published or unavailable.")

    # Ban check
    ban = await db.scalar(
        select(AssessmentBan).where(
            AssessmentBan.assessment_id == assessment.id,
            AssessmentBan.student_id == current_student.id,
            AssessmentBan.revoked_at.is_(None)
        )
    )
    if ban:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You are barred from this assessment due to a prior proctoring violation. Reason: {ban.reason}"
        )

    # Pre-check: Ensure assessment has active questions in its pool before proceeding
    active_q_count = await db.scalar(
        select(func.count(AssessmentQuestion.question_id))
        .join(Question, Question.id == AssessmentQuestion.question_id)
        .where(
            AssessmentQuestion.assessment_id == assessment.id,
            Question.retired_at.is_(None)
        )
    ) or 0
    if active_q_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment question pool has no available questions. Please contact your instructor."
        )

    now = datetime.now(timezone.utc)

    # Schedule Window Verification: Students can only attempt within the scheduled window
    if assessment.scheduled_start_at:
        st = assessment.scheduled_start_at
        if st.tzinfo is None:
            st = st.replace(tzinfo=timezone.utc)
        if now < st:
            formatted_st = st.strftime("%b %d, %Y %I:%M %p UTC")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This exam has not started yet. It will open on {formatted_st}."
            )

    if assessment.scheduled_end_at:
        et = assessment.scheduled_end_at
        if et.tzinfo is None:
            et = et.replace(tzinfo=timezone.utc)
        if now > et:
            formatted_et = et.strftime("%b %d, %Y %I:%M %p UTC")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This exam window has closed. The deadline was {formatted_et}."
            )

    # Reconnect / Resume check
    existing_attempt = await db.scalar(
        select(Attempt).where(
            Attempt.assessment_id == assessment.id,
            Attempt.student_id == current_student.id,
            Attempt.status.in_(["in_progress", "disconnected", "terminated"])
        ).order_by(desc(Attempt.started_at)).limit(1).with_for_update()
    )

    if existing_attempt:
        # If attempt was terminated but ban is now revoked, reinstate it
        if existing_attempt.status == "terminated":
            existing_attempt.status = "in_progress"
            existing_attempt.completion_reason = None
            existing_attempt.submitted_at = None
            # If exam time elapsed while banned/terminated, refresh started_at so student has time to complete
            if existing_attempt.started_at:
                st = existing_attempt.started_at
                if st.tzinfo is None:
                    st = st.replace(tzinfo=timezone.utc)
                if (now - st).total_seconds() >= assessment.time_limit_seconds:
                    existing_attempt.started_at = now
            await db.execute(delete(Violation).where(Violation.attempt_id == existing_attempt.id))

        # Check if exam timer has expired in the meantime
        started_at = existing_attempt.started_at
        if started_at and started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        elapsed = (now - started_at).total_seconds() if started_at else 0
        if elapsed >= assessment.time_limit_seconds:
            # Check if student actually answered any question
            existing_answers_count = await db.scalar(
                select(func.count(AttemptAnswer.id)).where(AttemptAnswer.attempt_id == existing_attempt.id)
            ) or 0
            if existing_answers_count == 0:
                # Student never answered any questions (e.g. stale/unattempted session opened earlier)
                # Remove unattempted phantom session and allow student to start fresh!
                await db.delete(existing_attempt)
                await db.flush()
                existing_attempt = None
            else:
                existing_attempt.status = "submitted"
                existing_attempt.completion_reason = "time_expired"
                existing_attempt.submitted_at = now
                existing_attempt.current_question_id = None
                existing_attempt.current_question_started_at = None
                existing_attempt.final_score = await calculate_final_score(db, existing_attempt, assessment)
                await db.commit()
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam time has expired.")

    if existing_attempt:
        # Handle device switch if reconnecting from new device
        if existing_attempt.active_device_id != data.device_id:
            await record_device_switch(db, existing_attempt, assessment, data.device_id)

        existing_attempt.status = "in_progress"
        existing_attempt.last_heartbeat_at = now

        # Ensure current question is valid and assigned
        current_q = None
        if existing_attempt.current_question_id:
            current_q = await db.get(Question, existing_attempt.current_question_id)
        
        if not current_q:
            current_q = await serve_first_question_if_needed(db, existing_attempt, assessment)

        if not current_q:
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No questions available in pool.")

        aq = await db.scalar(
            select(AssessmentQuestion).where(
                AssessmentQuestion.assessment_id == assessment.id,
                AssessmentQuestion.question_id == current_q.id
            )
        )
        answers_count = await db.scalar(
            select(func.count(AttemptAnswer.id)).where(AttemptAnswer.attempt_id == existing_attempt.id)
        )
        await db.commit()

        return {
            "attempt_id": str(existing_attempt.id),
            "status": "in_progress",
            "is_resumed": True,
            "current_question": build_current_question_payload(
                existing_attempt, assessment, current_q, aq.difficulty if aq else current_q.difficulty, (answers_count or 0) + 1
            )
        }

    # Verify student does not have an existing submitted attempt (with actual answers)
    completed_attempts = (await db.scalars(
        select(Attempt).where(
            Attempt.assessment_id == assessment.id,
            Attempt.student_id == current_student.id,
            Attempt.status == "submitted"
        ).order_by(desc(Attempt.started_at))
    )).all()

    for comp in completed_attempts:
        comp_answers_count = await db.scalar(
            select(func.count(AttemptAnswer.id)).where(AttemptAnswer.attempt_id == comp.id)
        ) or 0
        if comp_answers_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have already completed or finalized this assessment."
            )
        else:
            # Student never answered any question (e.g. empty pool error or unattempted phantom session):
            # Clean up empty 0-answer attempt and let them take the exam!
            await db.delete(comp)
            await db.flush()

    # Initialize new attempt
    new_attempt = Attempt(
        id=uuid.uuid4(),
        assessment_id=assessment.id,
        student_id=current_student.id,
        started_at=now,
        last_heartbeat_at=now,
        status="in_progress",
        consent_ack_at=now,
        active_device_id=data.device_id,
        promotion_counter=0,
        demotion_counter=0
    )
    db.add(new_attempt)
    # Lock assessment config now that an attempt is in progress
    assessment.config_locked = True
    await db.flush()

    # Serve first question using atomic invariant
    first_q = await serve_first_question_if_needed(db, new_attempt, assessment)
    if not first_q:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assessment question pool has no available questions.")

    aq = await db.scalar(
        select(AssessmentQuestion).where(
            AssessmentQuestion.assessment_id == assessment.id,
            AssessmentQuestion.question_id == first_q.id
        )
    )
    await db.commit()

    return {
        "attempt_id": str(new_attempt.id),
        "status": "in_progress",
        "is_resumed": False,
        "current_question": build_current_question_payload(
            new_attempt, assessment, first_q, aq.difficulty if aq else first_q.difficulty, 1
        )
    }


@router.get("/attempts/{attempt_id}/current-question", response_model=CurrentQuestionOut)
async def get_current_question(
    attempt_id: uuid.UUID,
    current_student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db)
):
    attempt = await db.get(Attempt, attempt_id)
    if not attempt or attempt.student_id != current_student.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    if attempt.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No active question: Attempt is {attempt.status} ({attempt.completion_reason})."
        )

    assessment = await db.get(Assessment, attempt.assessment_id)
    if not attempt.current_question_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No current question assigned.")

    question = await db.get(Question, attempt.current_question_id)
    aq = await db.scalar(
        select(AssessmentQuestion).where(
            AssessmentQuestion.assessment_id == assessment.id,
            AssessmentQuestion.question_id == question.id
        )
    )
    answers_count = await db.scalar(
        select(func.count(AttemptAnswer.id)).where(AttemptAnswer.attempt_id == attempt.id)
    ) or 0

    return build_current_question_payload(
        attempt, assessment, question, aq.difficulty if aq else question.difficulty, answers_count + 1
    )


@router.post("/attempts/{attempt_id}/submit-answer", response_model=AnswerSubmitResponse)
async def submit_answer(
    attempt_id: uuid.UUID,
    payload: AnswerSubmitRequest,
    current_student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db)
):
    attempt, next_q, action_result = await submit_answer_atomically(
        session=db,
        attempt_id=attempt_id,
        student_id=current_student.id,
        question_id=payload.question_id,
        selected_option_index=payload.selected_option_index,
        is_timeout_submission=payload.is_timeout
    )

    assessment = await db.get(Assessment, attempt.assessment_id)
    next_payload = None
    if next_q and attempt.status == "in_progress":
        aq = await db.scalar(
            select(AssessmentQuestion).where(
                AssessmentQuestion.assessment_id == assessment.id,
                AssessmentQuestion.question_id == next_q.id
            )
        )
        seq = action_result.get("question_sequence", 1)
        next_payload = build_current_question_payload(
            attempt, assessment, next_q, aq.difficulty if aq else next_q.difficulty, seq
        )

    return AnswerSubmitResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        completion_reason=attempt.completion_reason,
        question_sequence=action_result.get("question_sequence"),
        next_question=next_payload,
        final_score=attempt.final_score if attempt.status != "in_progress" else None
    )


@router.post("/attempts/{attempt_id}/heartbeat")
async def send_heartbeat(
    attempt_id: uuid.UUID,
    device_id: str,
    current_student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db)
):
    attempt = await db.get(Attempt, attempt_id)
    if not attempt or attempt.student_id != current_student.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    now = datetime.now(timezone.utc)
    attempt.last_heartbeat_at = now

    assessment = await db.get(Assessment, attempt.assessment_id)
    if attempt.active_device_id != device_id:
        await record_device_switch(db, attempt, assessment, device_id)
    else:
        await db.commit()

    return {"status": attempt.status, "last_heartbeat_at": attempt.last_heartbeat_at.isoformat()}


@router.get("/attempts")
async def list_student_attempts(
    current_student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(Attempt, Assessment)
        .join(Assessment, Assessment.id == Attempt.assessment_id)
        .where(Attempt.student_id == current_student.id)
        .order_by(desc(Attempt.started_at))
    )
    records = (await db.execute(stmt)).all()

    results = []
    for attempt, assessment in records:
        ans_stats = (await db.execute(
            select(
                func.count(AttemptAnswer.id),
                func.sum(case((AttemptAnswer.is_correct == True, 1), else_=0))
            ).where(AttemptAnswer.attempt_id == attempt.id)
        )).one()

        total_answers = ans_stats[0] or 0
        correct_answers = int(ans_stats[1] or 0)
        accuracy_pct = round((correct_answers / total_answers * 100)) if total_answers > 0 else 0

        results.append({
            "id": str(attempt.id),
            "assessment_id": str(assessment.id),
            "assessment_title": assessment.title,
            "status": attempt.status,
            "completion_reason": attempt.completion_reason,
            "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
            "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "final_score": attempt.final_score,
            "highest_difficulty_reached": attempt.highest_difficulty_reached,
            "total_answers": total_answers,
            "correct_answers": correct_answers,
            "accuracy_pct": accuracy_pct
        })
    return results


@router.get("/attempts/{attempt_id}/results", response_model=AttemptResultsOut)
async def get_attempt_results(
    attempt_id: uuid.UUID,
    current_student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db)
):
    attempt = await db.get(Attempt, attempt_id)
    if not attempt or attempt.student_id != current_student.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    assessment = await db.get(Assessment, attempt.assessment_id)

    answers_stmt = (
        select(AttemptAnswer, Question)
        .join(Question, Question.id == AttemptAnswer.question_id)
        .where(AttemptAnswer.attempt_id == attempt.id)
        .order_by(AttemptAnswer.submitted_at.asc())
    )
    records = (await db.execute(answers_stmt)).all()

    total_answers = len(records)
    correct_count = sum(1 for ans, q in records if ans.is_correct)

    breakdown = []
    for ans, q in records:
        breakdown.append(AnswerReviewItem(
            question_id=q.id,
            question_text=clean_question_text(q.text),
            options=q.options,
            selected_option_index=ans.selected_option_index,
            correct_option_index=q.correct_option_index,
            is_correct=ans.is_correct,
            difficulty=ans.difficulty_at_time,
            response_time_ms=ans.response_time_ms
        ))

    return AttemptResultsOut(
        attempt_id=attempt.id,
        assessment_id=assessment.id if assessment else attempt.assessment_id,
        assessment_title=assessment.title if assessment else "Adaptive Assessment",
        status=attempt.status,
        completion_reason=attempt.completion_reason,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        final_score=attempt.final_score,
        highest_difficulty_reached=attempt.highest_difficulty_reached,
        total_answers=total_answers,
        correct_answers=correct_count,
        answers_breakdown=breakdown
    )
