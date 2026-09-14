import uuid
from typing import List, Dict, Any
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.attempt import Attempt
from app.models.user import User


async def get_authoritative_leaderboard(
    session: AsyncSession,
    assessment_id: uuid.UUID,
    anonymize: bool = False
) -> List[Dict[str, Any]]:
    """
    Computes leaderboard strictly from persisted database attempts.
    In-memory state is never the authoritative source.
    Sorted by: final_score DESC, submitted_at ASC.
    """
    stmt = (
        select(Attempt, User.name, User.email)
        .join(User, User.id == Attempt.student_id)
        .where(
            Attempt.assessment_id == assessment_id,
            Attempt.status.in_(["submitted", "terminated"])
        )
        .order_by(desc(Attempt.final_score), Attempt.submitted_at.asc().nulls_last())
    )
    results = (await session.execute(stmt)).all()

    leaderboard = []
    for rank, (attempt, student_name, student_email) in enumerate(results, start=1):
        if anonymize:
            display_name = f"Student #{attempt.id.hex[:6].upper()}"
        else:
            display_name = student_name or f"Student #{attempt.id.hex[:6].upper()}"

        leaderboard.append({
            "rank": rank,
            "attempt_id": str(attempt.id),
            "display_name": display_name,
            "final_score": attempt.final_score,
            "highest_difficulty": attempt.highest_difficulty_reached,
            "status": attempt.status,
            "completion_reason": attempt.completion_reason,
            "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None
        })

    return leaderboard
