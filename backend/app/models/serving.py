import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, CheckConstraint, UniqueConstraint, Index
)
from app.database import Base
from app.models.user import GUID, TZDateTime


class AttemptQuestionServing(Base):
    """
    Append-only, immutable forensic audit table of every question served to an attempt.
    No UPDATE or DELETE statements should ever be issued on this table.
    """
    __tablename__ = "attempt_question_servings"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(GUID(), ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(GUID(), ForeignKey("questions.id"), nullable=False)
    served_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    sequence_number = Column(Integer, nullable=False)

    __table_args__ = (
        CheckConstraint("sequence_number >= 1", name="ck_serving_sequence_positive"),
        UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question_serving"),
        UniqueConstraint("attempt_id", "sequence_number", name="uq_attempt_sequence_serving"),
        Index("idx_servings_attempt", "attempt_id"),
        Index("idx_servings_question", "question_id"),
    )

    def __repr__(self):
        return f"<AttemptQuestionServing attempt={self.attempt_id} seq={self.sequence_number} q={self.question_id}>"
