import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, JSON, Index
)
from app.database import Base
from app.models.user import GUID, TZDateTime


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    actor_user_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(64), nullable=False)
    target_type = Column(String(64), nullable=False)
    target_id = Column(GUID(), nullable=False)
    timestamp = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    metadata_json = Column("metadata", JSON, nullable=True)

    __table_args__ = (
        Index("idx_audit_actor", "actor_user_id"),
        Index("idx_audit_timestamp", "timestamp"),
        Index("idx_audit_action", "action"),
    )

    def __repr__(self):
        return f"<AuditLog id={self.id} actor={self.actor_user_id} action={self.action} target={self.target_type}:{self.target_id}>"
