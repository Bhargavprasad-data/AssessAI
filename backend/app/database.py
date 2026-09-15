from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from app.config import settings

from sqlalchemy import event

# Sanitize and normalize database URL
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://") and "+asyncpg" not in db_url:
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Engine configuration
connect_args = {}
engine_kwargs = {
    "echo": False,
    "future": True,
    "pool_pre_ping": True,
}
if "sqlite" in db_url:
    connect_args["check_same_thread"] = False
    connect_args["timeout"] = 30
    engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(
    db_url,
    connect_args=connect_args,
    **engine_kwargs
)

if "sqlite" in db_url:
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=60000")   # 60s — was 30s
        cursor.execute("PRAGMA wal_autocheckpoint=100")  # Checkpoint every 100 pages
        cursor.execute("PRAGMA cache_size=-32000")    # 32MB cache
        cursor.close()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    import app.models  # noqa: F401
    from sqlalchemy import text, inspect, select
    import logging
    import uuid
    from datetime import datetime, timezone
    from app.models.user import User
    from app.core.security import get_password_hash
    logger = logging.getLogger(__name__)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        def sync_missing_columns(sync_conn):
            inspector = inspect(sync_conn)
            table_names = inspector.get_table_names()
            for table_name, table in Base.metadata.tables.items():
                if table_name in table_names:
                    existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
                    for col in table.columns:
                        if col.name not in existing_cols:
                            try:
                                col_type = col.type.compile(sync_conn.dialect)
                                logger.info(f"Auto-migrating: Adding missing column '{col.name}' ({col_type}) to table '{table_name}'")
                                sync_conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}"))
                            except Exception as e:
                                logger.warning(f"Could not auto-add column {col.name} to {table_name}: {e}")

        await conn.run_sync(sync_missing_columns)

    # Ensure authoritative admin accounts exist and credentials are valid
    async with AsyncSessionLocal() as session:
        try:
            now = datetime.now(timezone.utc)
            admin1 = await session.scalar(select(User).where(User.email == "bhargavvana80@gmail.com"))
            if not admin1:
                admin1 = User(
                    id=uuid.uuid4(),
                    name="Bhargav Admin",
                    email="bhargavvana80@gmail.com",
                    password_hash=get_password_hash("Bhargav11@prasad"),
                    role="admin",
                    is_banned=False,
                    created_at=now
                )
                session.add(admin1)
                logger.info("Initialized default primary admin: bhargavvana80@gmail.com")
            else:
                admin1.password_hash = get_password_hash("Bhargav11@prasad")
                admin1.role = "admin"
                admin1.is_banned = False

            admin2 = await session.scalar(select(User).where(User.email == "admin@proctor.ai"))
            if not admin2:
                admin2 = User(
                    id=uuid.uuid4(),
                    name="Dr. System Administrator",
                    email="admin@proctor.ai",
                    password_hash=get_password_hash("AdminDemo2026!"),
                    role="admin",
                    is_banned=False,
                    created_at=now
                )
                session.add(admin2)
                logger.info("Initialized default demo admin: admin@proctor.ai")
            else:
                admin2.role = "admin"
                admin2.is_banned = False

            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.warning(f"Auto-seeding default admin accounts encountered error: {e}")

