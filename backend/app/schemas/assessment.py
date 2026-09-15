import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict


class AssessmentCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    time_limit_seconds: int = Field(..., ge=1)
    per_question_time_limit_seconds: Optional[int] = Field(None, ge=1)
    fast_response_threshold_seconds: int = Field(30, ge=1)
    enable_speed_adaptive: bool = True
    max_question_count: int = Field(15, ge=1)
    promotion_threshold: int = Field(2, ge=1)
    demotion_threshold: int = Field(2, ge=1)
    max_violations: int = Field(3, ge=1)
    scoring_weights: Dict[str, float] = Field(default_factory=lambda: {"easy": 1.0, "medium": 2.0, "hard": 3.0})
    promotion_rules: Dict[str, Any] = Field(default_factory=lambda: {"promotion_threshold": 2, "demotion_threshold": 2})
    ban_on_violation_breach: bool = True
    device_switch_as_violation: bool = False
    question_ids: Optional[List[uuid.UUID]] = None


class AssessmentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    time_limit_seconds: Optional[int] = Field(None, ge=1)
    per_question_time_limit_seconds: Optional[int] = Field(None, ge=1)
    fast_response_threshold_seconds: Optional[int] = Field(None, ge=1)
    enable_speed_adaptive: Optional[bool] = None
    max_question_count: Optional[int] = Field(None, ge=1)
    promotion_threshold: Optional[int] = Field(None, ge=1)
    demotion_threshold: Optional[int] = Field(None, ge=1)
    max_violations: Optional[int] = Field(None, ge=1)
    scoring_weights: Optional[Dict[str, float]] = None
    promotion_rules: Optional[Dict[str, Any]] = None
    ban_on_violation_breach: Optional[bool] = None
    device_switch_as_violation: Optional[bool] = None
    question_ids: Optional[List[uuid.UUID]] = None


class AssessmentPublishRequest(BaseModel):
    override_sufficiency: bool = False


class AssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    time_limit_seconds: int
    per_question_time_limit_seconds: Optional[int] = None
    fast_response_threshold_seconds: int
    enable_speed_adaptive: bool
    max_question_count: int
    promotion_threshold: int
    demotion_threshold: int
    max_violations: int
    scoring_weights: Dict[str, Any]
    promotion_rules: Dict[str, Any]
    ban_on_violation_breach: bool
    device_switch_as_violation: bool
    status: str
    created_at: datetime
    config_locked: bool
    question_count: Optional[int] = 0
    attempts_count: Optional[int] = 0
    active_attempts_count: Optional[int] = 0
    completed_attempts_count: Optional[int] = 0
    teacher_name: Optional[str] = None
    teacher_email: Optional[str] = None
