import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.attempt import Attempt, AttemptAnswer
from app.models.serving import AttemptQuestionServing
from app.models.proctoring import Violation
from app.models.assessment import Assessment, AssessmentQuestion, AssessmentBan
from app.models.audit import AuditLog
from app.schemas.auth import UserOut, AdminCreateUser, AdminUpdateUser
from app.schemas.assessment import AssessmentOut
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


@router.get("/assessments", response_model=List[AssessmentOut])
async def list_admin_assessments(
    status_filter: Optional[str] = None,
    teacher_id: Optional[uuid.UUID] = None,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Assessment).order_by(desc(Assessment.created_at))
    if status_filter:
        stmt = stmt.where(Assessment.status == status_filter)
    if teacher_id:
        stmt = stmt.where(Assessment.teacher_id == teacher_id)

    assessments = (await db.scalars(stmt)).all()
    
    # Pre-fetch teachers for quick lookup
    teacher_ids = list({a.teacher_id for a in assessments})
    teachers = {}
    if teacher_ids:
        t_users = (await db.scalars(select(User).where(User.id.in_(teacher_ids)))).all()
        teachers = {u.id: u for u in t_users}

    results = []
    for a in assessments:
        q_count = await db.scalar(
            select(func.count(AssessmentQuestion.question_id)).where(AssessmentQuestion.assessment_id == a.id)
        )
        total_attempts = await db.scalar(
            select(func.count(Attempt.id)).where(Attempt.assessment_id == a.id)
        ) or 0
        active_attempts = await db.scalar(
            select(func.count(Attempt.id)).where(
                Attempt.assessment_id == a.id,
                Attempt.status.in_(["in_progress", "disconnected"])
            )
        ) or 0
        completed_attempts = await db.scalar(
            select(func.count(Attempt.id)).where(
                Attempt.assessment_id == a.id,
                Attempt.status.in_(["submitted", "terminated"])
            )
        ) or 0

        teacher = teachers.get(a.teacher_id)
        out = AssessmentOut.model_validate(a)
        out.question_count = q_count or 0
        out.config_locked = active_attempts > 0
        out.attempts_count = total_attempts
        out.active_attempts_count = active_attempts
        out.completed_attempts_count = completed_attempts
        out.teacher_name = teacher.name if teacher else None
        out.teacher_email = teacher.email if teacher else None
        results.append(out)

    return results


@router.delete("/assessments/{assessment_id}")
async def delete_admin_assessment(
    assessment_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Administrator destructive deletion:
    Allows admin to delete any assessment (Current, Future, Past) across the entire platform,
    cleaning up all associated questions, attempts, answers, proctoring violations,
    and bans.
    """
    assessment = await db.get(Assessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    # Get all attempt IDs for this assessment
    attempt_ids = (await db.scalars(
        select(Attempt.id).where(Attempt.assessment_id == assessment.id)
    )).all()

    if attempt_ids:
        await db.execute(delete(AttemptQuestionServing).where(AttemptQuestionServing.attempt_id.in_(attempt_ids)))
        await db.execute(delete(AttemptAnswer).where(AttemptAnswer.attempt_id.in_(attempt_ids)))
        await db.execute(delete(Violation).where(Violation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))

    await db.execute(delete(AssessmentBan).where(AssessmentBan.assessment_id == assessment.id))
    await db.execute(delete(AssessmentQuestion).where(AssessmentQuestion.assessment_id == assessment.id))

    assessment_title = assessment.title
    assessment_status = assessment.status
    teacher_id = assessment.teacher_id
    attempts_deleted_count = len(attempt_ids)

    await db.delete(assessment)
    await db.commit()

    await record_audit_event(
        session=db,
        actor_user_id=current_admin.id,
        action="admin_assessment_deleted",
        target_type="assessment",
        target_id=assessment_id,
        metadata={
            "title": assessment_title,
            "status": assessment_status,
            "teacher_id": str(teacher_id),
            "deleted_attempts_count": attempts_deleted_count,
            "deleted_by_role": "admin"
        }
    )
    await db.commit()

    return {
        "message": f"Assessment '{assessment_title}' and all associated {attempts_deleted_count} attempt records deleted successfully by administrator.",
        "deleted_assessment_id": str(assessment_id)
    }

