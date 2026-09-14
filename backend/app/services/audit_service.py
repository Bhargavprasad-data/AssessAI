import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog


async def record_audit_event(
    session: AsyncSession,
    actor_user_id: Optional[uuid.UUID],
    action: str,
    target_type: str,
    target_id: uuid.UUID,
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """
    Records an immutable audit event without logging credentials or unnecessary PII.
    Actions: assessment created/updated/published/unpublished/config-changed,
             question created/edited/retired/regenerated,
             assessment_ban_applied/revoked, global_ban_applied/revoked,
             admin_account_created, attempt terminated-by-teacher/reviewed.

    NOTE: This function does NOT commit the session. The caller is responsible for
    committing the transaction. This prevents double-commit errors when called after
    the caller has already performed writes in the same session.
    """
    log_entry = AuditLog(
        id=uuid.uuid4(),
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        timestamp=datetime.now(timezone.utc),
        metadata_json=metadata or {}
    )
    session.add(log_entry)
    await session.flush()  # Flush to DB buffer but do NOT commit — caller owns the transaction
    return log_entry

