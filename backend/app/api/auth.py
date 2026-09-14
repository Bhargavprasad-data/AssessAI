import uuid
from datetime import datetime, timezone
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.token import RefreshToken
from app.schemas.auth import UserRegister, UserLogin, UserOut, TokenResponse, RefreshTokenRequest
from app.core.security import (
    verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
)
from app.core.csrf import generate_csrf_token
from app.core.rate_limiter import rate_limit_auth
import logging
from app.api.deps import get_current_user
from app.services.audit_service import record_audit_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, csrf_token: str):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/"
    )
    # CSRF cookie is readable by frontend script to send back in X-CSRF-Token header
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )


def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")
    response.delete_cookie("csrf_token", path="/")


@router.post("/register", response_model=TokenResponse)
async def register(
    user_in: UserRegister,
    request: Request,
    response: Response,
    role: Literal["teacher", "student", "admin"] = "student",
    db: AsyncSession = Depends(get_db)
):
    """
    Public registration endpoint.
    Client-supplied role in request body is ignored (Section 8.2 security rule).
    Portal specifies registration role via query parameter ('student', 'teacher', or 'admin').
    """
    rate_limit_auth(request, user_in.email)

    # Check email uniqueness
    existing_user = await db.scalar(select(User).where(User.email == user_in.email.lower()))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    # Server-assigned role
    assigned_role = "admin" if role == "admin" else ("teacher" if role == "teacher" else "student")

    new_user = User(
        id=uuid.uuid4(),
        name=user_in.name.strip(),
        email=user_in.email.lower(),
        password_hash=get_password_hash(user_in.password),
        role=assigned_role,
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_user)
    await db.flush()

    # Generate tokens
    access_token = create_access_token({"sub": str(new_user.id), "role": new_user.role})
    refresh_token_str, token_id = create_refresh_token({"sub": str(new_user.id)})
    csrf_token = generate_csrf_token()

    user_out = UserOut.model_validate(new_user)

    # Record refresh token
    db_token = RefreshToken(
        id=uuid.uuid4(),
        user_id=new_user.id,
        token_id=token_id,
        issued_at=datetime.now(timezone.utc),
        revoked=False
    )
    try:
        db.add(db_token)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Error persisting refresh token on register for {new_user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error during registration. Please try again."
        )

    set_auth_cookies(response, access_token, refresh_token_str, csrf_token)

    return TokenResponse(
        message="Registration successful",
        user=user_out,
        csrf_token=csrf_token,
        access_token=access_token,
        refresh_token=refresh_token_str
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    rate_limit_auth(request, credentials.email)

    user = await db.scalar(select(User).where(User.email == credentials.email.lower()))
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This account has been globally banned. Reason: {user.ban_reason or 'Policy violation'}"
        )

    # Validate UserOut before committing session writes to ensure clean model serialization
    user_out = UserOut.model_validate(user)

    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    refresh_token_str, token_id = create_refresh_token({"sub": str(user.id)})
    csrf_token = generate_csrf_token()

    db_token = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        token_id=token_id,
        issued_at=datetime.now(timezone.utc),
        revoked=False
    )
    try:
        db.add(db_token)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Error persisting refresh token for user {user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while saving session. Please try again."
        )

    set_auth_cookies(response, access_token, refresh_token_str, csrf_token)

    return TokenResponse(
        message="Login successful",
        user=user_out,
        csrf_token=csrf_token,
        access_token=access_token,
        refresh_token=refresh_token_str
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token_endpoint(
    request: Request,
    response: Response,
    body: Optional[RefreshTokenRequest] = None,
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    # 1. Header takes precedence (isolated per portal origin)
    token = None
    header_token = request.headers.get("X-Refresh-Token")
    if header_token and header_token.strip():
        token = header_token.strip()
    elif body and body.refresh_token and body.refresh_token.strip():
        token = body.refresh_token.strip()
    else:
        token = request.cookies.get("refresh_token")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token.")

    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token.")

    token_id = payload.get("jti")
    user_id_str = payload.get("sub")
    if not token_id or not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token.")

    user = await db.get(User, uuid.UUID(user_id_str))
    if not user or user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is banned or inactive.")

    # Prevent cross-portal session contamination if caller specifies expected role
    expected_role = role or request.headers.get("X-Expected-Role")
    if expected_role and user.role != expected_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token refresh role mismatch: requested role '{expected_role}', but token belongs to role '{user.role}'."
        )

    # Find token record in DB
    db_token = await db.scalar(select(RefreshToken).where(RefreshToken.token_id == token_id))
    if not db_token or db_token.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked or expired.")

    # Rotate: Revoke current token
    db_token.revoked = True

    # Issue new token pair
    new_access_token = create_access_token({"sub": str(user.id), "role": user.role})
    new_refresh_token, new_token_id = create_refresh_token({"sub": str(user.id)})
    csrf_token = generate_csrf_token()

    user_out = UserOut.model_validate(user)

    new_db_token = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        token_id=new_token_id,
        issued_at=datetime.now(timezone.utc),
        revoked=False
    )
    try:
        db.add(new_db_token)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Error rotating refresh token for {user.id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error refreshing session. Please log in again."
        )

    set_auth_cookies(response, new_access_token, new_refresh_token, csrf_token)

    return TokenResponse(
        message="Token refreshed successfully",
        user=user_out,
        csrf_token=csrf_token,
        access_token=new_access_token,
        refresh_token=new_refresh_token
    )


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    token = request.cookies.get("refresh_token")
    if token:
        payload = decode_token(token)
        if payload and "jti" in payload:
            token_id = payload["jti"]
            db_token = await db.scalar(select(RefreshToken).where(RefreshToken.token_id == token_id))
            if db_token:
                db_token.revoked = True
                await db.commit()

    clear_auth_cookies(response)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=Optional[UserOut])
async def get_me(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    expected_role = request.headers.get("X-Expected-Role")
    try:
        user = await get_current_user(request, db)
        if expected_role and user.role != expected_role:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Role mismatch")
        return UserOut.model_validate(user)
    except HTTPException:
        # If access token is expired, missing, or mismatched role, attempt auto-renewal via header or refresh_token cookie
        refresh_token = request.headers.get("X-Refresh-Token") or request.cookies.get("refresh_token")
        if refresh_token:
            payload = decode_token(refresh_token)
            if payload and payload.get("type") == "refresh":
                token_id = payload.get("jti")
                user_id_str = payload.get("sub")
                if token_id and user_id_str:
                    try:
                        user = await db.get(User, uuid.UUID(user_id_str))
                        if user and not user.is_banned:
                            if not expected_role or user.role == expected_role:
                                db_token = await db.scalar(select(RefreshToken).where(RefreshToken.token_id == token_id))
                                if db_token and not db_token.revoked:
                                    # Auto-renew session seamlessly
                                    db_token.revoked = True
                                    new_access_token = create_access_token({"sub": str(user.id), "role": user.role})
                                    new_refresh_token, new_token_id = create_refresh_token({"sub": str(user.id)})
                                    csrf_token = generate_csrf_token()
                                    new_db_token = RefreshToken(
                                        id=uuid.uuid4(),
                                        user_id=user.id,
                                        token_id=new_token_id,
                                        issued_at=datetime.now(timezone.utc),
                                        revoked=False
                                    )
                                    db.add(new_db_token)
                                    await db.commit()
                                    set_auth_cookies(response, new_access_token, new_refresh_token, csrf_token)
                                    response.headers["X-Access-Token"] = new_access_token
                                    response.headers["X-Refresh-Token"] = new_refresh_token
                                    return UserOut.model_validate(user)
                    except Exception as e:
                        logger.warning(f"Failed auto-renewing session in get_me: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or not authenticated."
        )

