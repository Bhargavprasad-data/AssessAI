import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    # Role field from client is IGNORED by registration endpoint per Section 8.2


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class AdminCreateUser(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: Literal["admin", "teacher", "student"]


class AdminUpdateUser(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[Literal["admin", "teacher", "student"]] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    role: str
    created_at: datetime
    is_banned: bool
    banned_at: Optional[datetime] = None
    ban_reason: Optional[str] = None


class TokenResponse(BaseModel):
    message: str
    user: UserOut
    csrf_token: str
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: Optional[str] = None
