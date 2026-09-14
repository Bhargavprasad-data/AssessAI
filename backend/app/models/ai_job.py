import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Text, Integer, CheckConstraint, Index
)
from app.database import Base
from app.models.user import GUID, TZDateTime


class AIGenerationJob(Base):
    __tablename__ = "ai_generation_jobs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    material_id = Column(GUID(), ForeignKey("course_materials.id", ondelete="CASCADE"), nullable=False)
    requested_count = Column(Integer, nullable=False)
    valid_count = Column(Integer, nullable=False, default=0)
    status = Column(String(32), nullable=False, default="queued")  # 'queued', 'processing', 'completed', 'failed'
    failure_reason = Column(Text, nullable=True)
    created_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('queued', 'processing', 'completed', 'failed')", name="ck_ai_job_status"),
        Index("idx_ai_jobs_material", "material_id"),
        Index("idx_ai_jobs_status", "status"),
    )

    def __repr__(self):
        return f"<AIGenerationJob id={self.id} status={self.status} valid={self.valid_count}/{self.requested_count}>"
