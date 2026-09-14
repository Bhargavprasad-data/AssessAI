import uuid
from datetime import datetime
from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, ConfigDict

ViolationType = Literal[
    "tab_switch",
    "window_blur",
    "copy",
    "paste",
    "cut",
    "screenshot_attempt",
    "device_switch",
    "mobile_detected",
    "unauthorized_object",
    "multiple_faces",
    "no_face",
    "looking_away",
    "audio_spike",
    "webcam_disconnected",
    "mic_disabled",
    "screen_share_stopped"
]


class ViolationSignalRequest(BaseModel):
    type: ViolationType
    metadata: Optional[Dict[str, Any]] = None


class ViolationSignalResponse(BaseModel):
    recorded: bool
    total_violations: int
    max_violations: int
    is_terminated: bool
    message: str


class BanCreateRequest(BaseModel):
    student_id: uuid.UUID
    reason: str = Field(..., min_length=3, max_length=500)


class BanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    student_name: Optional[str] = None
    banned_at: datetime
    banned_by: Optional[uuid.UUID] = None
    ban_source: str
    reason: str
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[uuid.UUID] = None
