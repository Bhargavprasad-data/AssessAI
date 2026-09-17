import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Text, Integer, Boolean, JSON,
    CheckConstraint, PrimaryKeyConstraint, Index
)
from app.database import Base
from app.models.user import GUID, TZDateTime


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    time_limit_seconds = Column(Integer, nullable=False)
    per_question_time_limit_seconds = Column(Integer, nullable=True)
    fast_response_threshold_seconds = Column(Integer, nullable=False, default=30)
    enable_speed_adaptive = Column(Boolean, nullable=False, default=True)
    max_question_count = Column(Integer, nullable=False, default=15)
    promotion_threshold = Column(Integer, nullable=False, default=2)
    demotion_threshold = Column(Integer, nullable=False, default=2)
    max_violations = Column(Integer, nullable=False, default=3)
    scoring_weights = Column(JSON, nullable=False, default=lambda: {"easy": 1, "medium": 2, "hard": 3})
    promotion_rules = Column(JSON, nullable=False, default=lambda: {"promotion_threshold": 2, "demotion_threshold": 2})
    ban_on_violation_breach = Column(Boolean, nullable=False, default=True)
    device_switch_as_violation = Column(Boolean, nullable=False, default=False)
    status = Column(String(32), nullable=False, default="draft")  # 'draft', 'published', 'closed'
    created_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    config_locked = Column(Boolean, nullable=False, default=False)
    scheduled_start_at = Column(TZDateTime(), nullable=True)  # When the exam opens
    scheduled_end_at = Column(TZDateTime(), nullable=True)    # When the exam window closes / deadline

    __table_args__ = (
        CheckConstraint("time_limit_seconds >= 1", name="ck_assessment_time_limit"),
        CheckConstraint("per_question_time_limit_seconds IS NULL OR per_question_time_limit_seconds >= 1", name="ck_assessment_per_q_limit"),
        CheckConstraint("fast_response_threshold_seconds >= 1", name="ck_assessment_fast_response_threshold"),
        CheckConstraint("max_question_count >= 1", name="ck_assessment_max_question_count"),
        CheckConstraint("promotion_threshold >= 1", name="ck_assessment_promotion_threshold"),
        CheckConstraint("demotion_threshold >= 1", name="ck_assessment_demotion_threshold"),
        CheckConstraint("max_violations >= 1", name="ck_assessment_max_violations"),
        CheckConstraint("status IN ('draft', 'published', 'closed')", name="ck_assessment_status"),
    )

    def __repr__(self):
        return f"<Assessment id={self.id} title={self.title} status={self.status}>"


class AssessmentQuestion(Base):
    __tablename__ = "assessment_questions"

    assessment_id = Column(GUID(), ForeignKey("assessments.id", ondelete="CASCADE"), primary_key=True)
    question_id = Column(GUID(), ForeignKey("questions.id"), primary_key=True)
    difficulty = Column(String(16), nullable=False)  # Snapshot difficulty copied from Question.difficulty

    __table_args__ = (
        PrimaryKeyConstraint("assessment_id", "question_id", name="pk_assessment_questions"),
        Index("idx_assessment_questions_aid", "assessment_id"),
        Index("idx_assessment_questions_qid", "question_id"),
        Index("idx_assessment_questions_diff", "assessment_id", "difficulty"),
    )

    def __repr__(self):
        return f"<AssessmentQuestion assessment={self.assessment_id} question={self.question_id} diff={self.difficulty}>"


class AssessmentBan(Base):
    __tablename__ = "assessment_bans"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    assessment_id = Column(GUID(), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    banned_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    banned_by = Column(GUID(), ForeignKey("users.id"), nullable=True)  # Nullable for automated system bans
    ban_source = Column(String(64), nullable=False, default="system_violation_threshold")
    reason = Column(Text, nullable=False)
    revoked_at = Column(TZDateTime(), nullable=True)
    revoked_by = Column(GUID(), ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        Index("idx_assessment_bans_lookup", "assessment_id", "student_id"),
        Index(
            "uq_active_assessment_ban",
            "assessment_id",
            "student_id",
            unique=True,
            postgresql_where=(revoked_at == None),
            sqlite_where=(revoked_at == None),
        ),
    )

    def __repr__(self):
        return f"<AssessmentBan assessment={self.assessment_id} student={self.student_id} active={self.revoked_at is None}>"
