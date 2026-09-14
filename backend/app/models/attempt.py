import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Integer, Float, Boolean,
    CheckConstraint, UniqueConstraint, Index
)
from app.database import Base
from app.models.user import GUID, TZDateTime

ALLOWED_COMPLETION_REASONS = (
    "'student_submitted'",
    "'time_expired'",
    "'violation_threshold'",
    "'no_questions_remaining'",
    "'max_questions_reached'",
    "'teacher_terminated'",
    "'banned'",
    "'system_error'",
    "'disconnect_timeout'"
)
COMPLETION_REASON_SQL = f"completion_reason IS NULL OR completion_reason IN ({', '.join(ALLOWED_COMPLETION_REASONS)})"


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    assessment_id = Column(GUID(), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    last_heartbeat_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    submitted_at = Column(TZDateTime(), nullable=True)
    final_score = Column(Float, nullable=False, default=0.0)
    highest_difficulty_reached = Column(String(16), nullable=False, default="easy")
    status = Column(String(32), nullable=False, default="in_progress")  # 'in_progress', 'submitted', 'terminated', 'disconnected'
    completion_reason = Column(String(64), nullable=True)
    consent_ack_at = Column(TZDateTime(), nullable=False)
    active_device_id = Column(String(255), nullable=False)
    promotion_counter = Column(Integer, nullable=False, default=0)
    demotion_counter = Column(Integer, nullable=False, default=0)
    current_question_id = Column(GUID(), ForeignKey("questions.id"), nullable=True)
    current_question_started_at = Column(TZDateTime(), nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('in_progress', 'submitted', 'terminated', 'disconnected')", name="ck_attempt_status"),
        CheckConstraint(COMPLETION_REASON_SQL, name="ck_attempt_completion_reason"),
        Index("idx_attempts_assessment", "assessment_id"),
        Index("idx_attempts_student", "student_id"),
        Index("idx_attempts_status", "status"),
        Index("idx_attempts_lookup", "assessment_id", "student_id", "status"),
    )

    def __repr__(self):
        return f"<Attempt id={self.id} student={self.student_id} status={self.status} score={self.final_score}>"


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(GUID(), ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(GUID(), ForeignKey("questions.id"), nullable=False)
    selected_option_index = Column(Integer, nullable=True)  # NULL if timed out
    is_correct = Column(Boolean, nullable=False, default=False)
    response_time_ms = Column(Integer, nullable=False)
    difficulty_at_time = Column(String(16), nullable=False)
    submitted_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_attempt_answer_question"),
        Index("idx_attempt_answers_attempt", "attempt_id"),
    )

    def __repr__(self):
        return f"<AttemptAnswer id={self.id} attempt={self.attempt_id} question={self.question_id} correct={self.is_correct}>"
