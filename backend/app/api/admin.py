import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.attempt import Attempt
from app.models.assessment import Assessment, AssessmentBan
from app.models.audit import AuditLog
from app.schemas.auth import UserOut, AdminCreateUser, AdminUpdateUser
from app.api.deps import require_admin
from app.core.security import get_password_hash
from app.services.audit_service import record_audit_event
from app.services.submission_service import calculate_final_score

router = APIRouter(prefix="/admin", tags=["Admin Management"], dependencies=[Depends(require_admin)])


@router.get("/users", response_model=List[UserOut])
async def list_users(
    role: Optional[str] = None,
    is_banned: Optional[bool] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).order_by(desc(User.created_at))
    if role:
        stmt = stmt.where(User.role == role)
    if is_banned is not None:
        stmt = stmt.where(User.is_banned == is_banned)
    users = (await db.scalars(stmt)).all()
    return [UserOut.model_validate(u) for u in users]


@router.post("/users/admin", response_model=UserOut)
async def create_admin_user(
    user_in: AdminCreateUser,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Protected Admin creation workflow: Can only be called by an existing authenticated Admin.
    """
    existing = await db.scalar(select(User).where(User.email == user_in.email.lower()))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered.")

    new_user = User(
        id=uuid.uuid4(),
        name=user_in.name.strip(),
        email=user_in.email.lower(),
        password_hash=get_password_hash(user_in.password),
        role=user_in.role,
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_user)
    await db.commit()

    await record_audit_event(
        session=db,
        actor_user_id=current_admin.id,
        action="admin_account_created",
        target_type="user",
        target_id=new_user.id,
        metadata={"role": user_in.role, "email": user_in.email}
    )
    await db.commit()

    return UserOut.model_validate(new_user)


@router.post("/users/{user_id}/ban", response_model=UserOut)
async def apply_global_ban(
    user_id: uuid.UUID,
    reason: str,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Applies a GLOBAL platform-wide ban to a user.
    CRITICAL BEHAVIOR: Immediately force-terminates any of that student's currently
    IN_PROGRESS or DISCONNECTED attempts across all assessments (completion_reason = 'banned').
    """
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if target_user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot ban yourself.")

    now = datetime.now(timezone.utc)
    target_user.is_banned = True
    target_user.banned_at = now
    target_user.banned_by = current_admin.id
    target_user.ban_reason = reason

    # Force-terminate all active/disconnected attempts across ALL assessments
    attempts_stmt = select(Attempt).where(
        Attempt.student_id == target_user.id,
        Attempt.status.in_(["in_progress", "disconnected"])
    )
    active_attempts = (await db.scalars(attempts_stmt)).all()

    for attempt in active_attempts:
        assessment = await db.get(Assessment, attempt.assessment_id)
        attempt.status = "terminated"
        attempt.completion_reason = "banned"
        attempt.submitted_at = now
        attempt.current_question_id = None
        attempt.current_question_started_at = None
        if assessment:
            attempt.final_score = await calculate_final_score(db, attempt, assessment)

    await db.commit()

    await record_audit_event(
        session=db,
        actor_user_id=current_admin.id,
        action="global_ban_applied",
        target_type="user",
        target_id=target_user.id,
        metadata={"reason": reason, "force_terminated_attempts": len(active_attempts)}
    )
    await db.commit()

    return UserOut.model_validate(target_user)


@router.post("/users/{user_id}/unban", response_model=UserOut)
async def revoke_global_ban(
    user_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    target_user.is_banned = False
    target_user.banned_at = None
    target_user.banned_by = None
    target_user.ban_reason = None
    await db.commit()

    await record_audit_event(
        session=db,
        actor_user_id=current_admin.id,
        action="global_ban_revoked",
        target_type="user",
        target_id=target_user.id,
        metadata={"unbanned_email": target_user.email}
    )
    await db.commit()

    return UserOut.model_validate(target_user)


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    user_in: AdminUpdateUser,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    
    # Check email uniqueness if email is changed
    if user_in.email and user_in.email.lower() != target_user.email.lower():
        existing = await db.scalar(select(User).where(User.email == user_in.email.lower()))
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered by another account.")
        target_user.email = user_in.email.lower()

    if user_in.name is not None and user_in.name.strip():
        target_user.name = user_in.name.strip()
    
    if user_in.role is not None:
        if target_user.id == current_admin.id and user_in.role != "admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot demote your own administrator account.")
        target_user.role = user_in.role
    
    if user_in.password:
        target_user.password_hash = get_password_hash(user_in.password)

    await db.commit()
    await db.refresh(target_user)

    await record_audit_event(
        session=db,
        actor_user_id=current_admin.id,
        action="user_updated",
        target_type="user",
        target_id=target_user.id,
        metadata={"updated_user": target_user.email, "role": target_user.role}
    )
    await db.commit()

    return UserOut.model_validate(target_user)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    
    if target_user.id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own administrator account.")

    # Nullify any foreign key references where target_user was banned_by or revoked_by
    await db.execute(update(User).where(User.banned_by == user_id).values(banned_by=None))
    await db.execute(update(AssessmentBan).where(AssessmentBan.banned_by == user_id).values(banned_by=None))
    await db.execute(update(AssessmentBan).where(AssessmentBan.revoked_by == user_id).values(revoked_by=None))

    user_email = target_user.email
    user_role = target_user.role
    await db.delete(target_user)
    await db.commit()

    await record_audit_event(
        session=db,
        actor_user_id=current_admin.id,
        action="user_deleted",
        target_type="user",
        target_id=user_id,
        metadata={"deleted_email": user_email, "role": user_role}
    )
    await db.commit()

    return {"message": "User deleted successfully", "deleted_user_id": str(user_id)}


@router.get("/audit-logs")
async def get_audit_logs(
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)
    
    logs = (await db.scalars(stmt)).all()
    return [
        {
            "id": str(log.id),
            "actor_user_id": str(log.actor_user_id) if log.actor_user_id else None,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": str(log.target_id),
            "timestamp": log.timestamp.isoformat(),
            "metadata": log.metadata_json
        }
        for log in logs
    ]


@router.delete("/audit-logs/{log_id}")
async def delete_audit_log(
    log_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    log = await db.scalar(select(AuditLog).where(AuditLog.id == log_id))
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log record not found.")
    await db.delete(log)
    await db.commit()
    return {"message": "Audit log deleted successfully", "deleted_log_id": str(log_id)}


@router.delete("/audit-logs")
async def clear_all_audit_logs(
    db: AsyncSession = Depends(get_db)
):
    await db.execute(delete(AuditLog))
    await db.commit()
    return {"message": "All audit logs cleared successfully"}

