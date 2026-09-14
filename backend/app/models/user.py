import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import TypeDecorator, CHAR, DateTime as SADateTime
from app.database import Base


# Universal UUID type for PostgreSQL and SQLite compatibility
class GUID(TypeDecorator):
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return str(uuid.UUID(value))
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                value = uuid.UUID(value)
            return value


# Timezone-aware DateTime type for SQLite/PostgreSQL compatibility.
# SQLite stores datetimes as naive strings; this decorator ensures that
# any datetime read back from the DB is always UTC-aware, preventing
# "can't subtract offset-naive and offset-aware datetimes" errors.
class TZDateTime(TypeDecorator):
    impl = SADateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Strip tzinfo before storing (SQLite stores plain ISO strings)."""
        if value is not None and hasattr(value, 'tzinfo') and value.tzinfo is not None:
            # Normalise to UTC then strip tzinfo so SQLite stores a clean string
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        """Always attach UTC when reading a naive datetime from the DB."""
        if value is not None and isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
        return value


class User(Base):
    __tablename__ = "users"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False)  # 'admin', 'teacher', 'student'
    created_at = Column(TZDateTime(), default=lambda: datetime.now(timezone.utc), nullable=False)
    
    # Global platform-wide ban (Admin-applied only)
    is_banned = Column(Boolean, default=False, nullable=False)
    banned_at = Column(TZDateTime(), nullable=True)
    banned_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    ban_reason = Column(Text, nullable=True)

    def __repr__(self):
        return f"<User id={self.id} email={self.email} role={self.role}>"
