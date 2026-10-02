import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Float
from app.database import Base
from app.models.user import GUID, TZDateTime


class CourseMaterial(Base):
    __tablename__ = "course_materials"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(512), nullable=False)
    uploaded_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    detected_subject = Column(String(255), nullable=True)
    detected_category = Column(String(255), nullable=True)
    detected_topics = Column(Text, nullable=True)
    document_summary = Column(Text, nullable=True)
    confidence_score = Column(Float, nullable=True)

    def __repr__(self):
        return f"<CourseMaterial id={self.id} filename={self.filename} subject={self.detected_subject}>"

