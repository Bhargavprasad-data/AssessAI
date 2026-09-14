import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, JSON, CheckConstraint, Index
)
from app.database import Base
from app.models.user import GUID, TZDateTime

ALLOWED_VIOLATION_TYPES = (
    "'tab_switch'",
    "'window_blur'",
    "'copy'",
    "'paste'",
    "'cut'",
    "'screenshot_attempt'",
    "'device_switch'",
    "'mobile_detected'",
    "'unauthorized_object'",
    "'multiple_faces'",
    "'no_face'",
    "'looking_away'",
    "'audio_spike'",
    "'webcam_disconnected'",
    "'mic_disabled'",
    "'screen_share_stopped'"
)
VIOLATION_TYPE_SQL = f"type IN ({', '.join(ALLOWED_VIOLATION_TYPES)})"


class Violation(Base):
    __tablename__ = "violations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(GUID(), ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(32), nullable=False)
    occurred_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    metadata_json = Column("metadata", JSON, nullable=True)

    __table_args__ = (
        CheckConstraint(VIOLATION_TYPE_SQL, name="ck_violation_type"),
        Index("idx_violations_attempt", "attempt_id"),
        Index("idx_violations_occurred_at", "occurred_at"),
    )

    def __repr__(self):
        return f"<Violation id={self.id} attempt={self.attempt_id} type={self.type}>"


class DeviceSwitchLog(Base):
    __tablename__ = "device_switch_log"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(GUID(), ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    previous_device_id = Column(String(255), nullable=False)
    new_device_id = Column(String(255), nullable=False)
    occurred_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("idx_device_switch_attempt", "attempt_id"),
    )

    def __repr__(self):
        return f"<DeviceSwitchLog attempt={self.attempt_id} prev={self.previous_device_id} new={self.new_device_id}>"
