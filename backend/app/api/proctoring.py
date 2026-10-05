import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.attempt import Attempt
from app.models.assessment import Assessment
from app.models.proctoring import Violation
from app.schemas.proctoring import ViolationSignalRequest, ViolationSignalResponse
from app.api.deps import get_current_user
from app.services.proctoring_service import record_violation_signal
from app.api.websockets import ws_manager

router = APIRouter(prefix="/proctoring", tags=["Proctoring Signals"])


@router.get("/attempts/{attempt_id}/violations-status", response_model=ViolationSignalResponse)
async def get_proctoring_violation_status(
    attempt_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    attempt = await db.get(Attempt, attempt_id)
    if not attempt or attempt.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    assessment = await db.get(Assessment, attempt.assessment_id)
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    count = await db.scalar(
        select(func.count(Violation.id)).where(Violation.attempt_id == attempt_id)
    )
    count = count or 0

    return ViolationSignalResponse(
        recorded=False,
        total_violations=count,
        max_violations=assessment.max_violations,
        is_terminated=attempt.status == "terminated",
        message=f"Current violations: {count}/{assessment.max_violations}"
    )


@router.post("/attempts/{attempt_id}/violations", response_model=ViolationSignalResponse)
async def submit_proctoring_violation(
    attempt_id: uuid.UUID,
    payload: ViolationSignalRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    attempt = await db.get(Attempt, attempt_id)
    if not attempt or attempt.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    is_recorded, count, max_v, is_terminated = await record_violation_signal(
        session=db,
        attempt_id=attempt.id,
        violation_type=payload.type,
        metadata=payload.metadata
    )

    # Broadcast event to teacher live proctoring feed
    await ws_manager.broadcast_violation_signal(
        assessment_id=str(attempt.assessment_id),
        violation_payload={
            "attempt_id": str(attempt.id),
            "student_id": str(current_user.id),
            "student_name": current_user.name,
            "type": payload.type,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "violation_count": count,
            "max_violations": max_v,
            "is_terminated": is_terminated,
            "metadata": payload.metadata
        }
    )

    if is_terminated:
        message = f"Assessment terminated: Exceeded the maximum limit of {max_v} proctoring violations."
    elif is_recorded:
        message = f"Warning: Proctoring signal detected ({payload.type}). Strike {count} of {max_v}."
    else:
        message = "Duplicate proctoring signal ignored (debounced)."

    return ViolationSignalResponse(
        recorded=is_recorded,
        total_violations=count,
        max_violations=max_v,
        is_terminated=is_terminated,
        message=message
    )
