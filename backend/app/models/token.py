import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Boolean, Index
)
from app.database import Base
from app.models.user import GUID, TZDateTime


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_id = Column(String(255), unique=True, index=True, nullable=False)
    issued_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("idx_refresh_tokens_user", "user_id"),
    )

    def __repr__(self):
        return f"<RefreshToken id={self.id} user={self.user_id} revoked={self.revoked}>"
