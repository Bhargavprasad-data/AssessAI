import uuid
from typing import Dict, List, Optional
from pydantic import BaseModel


class ScoreDistributionBucket(BaseModel):
    range_label: str
    count: int


class AssessmentAnalyticsOut(BaseModel):
    assessment_id: uuid.UUID
    assessment_title: str
    total_attempts: int
    completed_attempts: int
    terminated_attempts: int
    average_score: float
    highest_score: float
    lowest_score: float
    average_difficulty_reached: str
    accuracy_by_difficulty: Dict[str, float]  # e.g. {"easy": 85.0, "medium": 65.0, "hard": 40.0}
    score_distribution: List[ScoreDistributionBucket]
    total_violations_recorded: int
