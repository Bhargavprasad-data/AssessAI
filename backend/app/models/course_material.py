import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey
from app.database import Base
from app.models.user import GUID, TZDateTime


class CourseMaterial(Base):
    __tablename__ = "course_materials"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    teacher_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(512), nullable=False)
    uploaded_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)

    def __repr__(self):
        return f"<CourseMaterial id={self.id} filename={self.filename}>"
