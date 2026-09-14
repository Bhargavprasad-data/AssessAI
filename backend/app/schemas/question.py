import uuid
from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class QuestionBase(BaseModel):
    text: str = Field(..., min_length=5)
    options: List[str] = Field(..., min_length=4, max_length=4)
    correct_option_index: int = Field(..., ge=0, le=3)
    difficulty: Literal["easy", "medium", "hard"]
    source_chunk_ref: str


class QuestionCreate(QuestionBase):
    material_id: uuid.UUID


class QuestionUpdate(BaseModel):
    text: Optional[str] = Field(None, min_length=5)
    options: Optional[List[str]] = Field(None, min_length=4, max_length=4)
    correct_option_index: Optional[int] = Field(None, ge=0, le=3)
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None


class QuestionOut(QuestionBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    material_id: uuid.UUID
    is_duplicate_flag: bool
    retired_at: Optional[datetime] = None


class GenerateMultipleRequest(BaseModel):
    material_ids: List[uuid.UUID]
    count: int = Field(default=15, ge=1, le=100)


class QuestionsBatchRequest(BaseModel):
    material_ids: List[uuid.UUID]
    include_retired: bool = False
    job_id: Optional[uuid.UUID] = None
