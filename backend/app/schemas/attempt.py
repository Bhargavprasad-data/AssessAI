import uuid
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field

CompletionReasonType = Literal[
    "student_submitted",
    "time_expired",
    "violation_threshold",
    "no_questions_remaining",
    "max_questions_reached",
    "teacher_terminated",
    "banned",
    "system_error",
    "disconnect_timeout"
]


class AttemptJoinRequest(BaseModel):
    consent_ack: bool = Field(..., description="Student consent acknowledgement required before exam")
    device_id: str = Field(..., min_length=1, max_length=255)


class CurrentQuestionOut(BaseModel):
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    text: str
    options: List[str]
    difficulty: str  # Snapshot difficulty
    question_number: int
    max_questions: int
    time_remaining_seconds: int
    per_question_time_remaining_seconds: Optional[int] = None


class AnswerSubmitRequest(BaseModel):
    question_id: uuid.UUID
    selected_option_index: Optional[int] = None  # None if timed out
    is_timeout: bool = False


class AnswerSubmitResponse(BaseModel):
    attempt_id: uuid.UUID
    status: str  # 'in_progress', 'submitted', 'terminated'
    completion_reason: Optional[str] = None
    question_sequence: Optional[int] = None
    next_question: Optional[CurrentQuestionOut] = None
    final_score: Optional[float] = None


class AnswerReviewItem(BaseModel):
    question_id: uuid.UUID
    question_text: str
    options: List[str]
    selected_option_index: Optional[int]
    correct_option_index: int
    is_correct: bool
    difficulty: str
    response_time_ms: int


class AttemptResultsOut(BaseModel):
    attempt_id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str
    status: str
    completion_reason: Optional[str]
    started_at: datetime
    submitted_at: Optional[datetime]
    final_score: float
    highest_difficulty_reached: str
    total_answers: int
    correct_answers: int
    answers_breakdown: Optional[List[AnswerReviewItem]] = None  # None if teacher hasn't revealed
