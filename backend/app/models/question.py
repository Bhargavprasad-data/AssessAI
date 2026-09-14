import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer, Boolean, JSON
from app.database import Base
from app.models.user import GUID


class Question(Base):
    __tablename__ = "questions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    material_id = Column(GUID(), ForeignKey("course_materials.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(GUID(), nullable=True, index=True)
    text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # List of 4 strings
    correct_option_index = Column(Integer, nullable=False)  # 0..3
    difficulty = Column(String(16), nullable=False)  # 'easy', 'medium', 'hard' (canonical)
    source_chunk_ref = Column(String(255), nullable=False)
    is_duplicate_flag = Column(Boolean, default=False, nullable=False)
    retired_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete marker

    def __repr__(self):
        return f"<Question id={self.id} difficulty={self.difficulty} retired={self.retired_at is not None}>"
