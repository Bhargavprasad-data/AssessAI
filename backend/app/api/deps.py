import uuid
from typing import List, Optional
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.security import decode_token
from app.models.user import User


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> User:
    expected_role = request.headers.get("X-Expected-Role")
    # Check Authorization header first (isolated per client origin), then access_token cookie
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()

    payload = decode_token(token) if token else None
    if not payload or payload.get("type") != "access":
        # Only fall back to access_token cookie if no Authorization header was provided.
        # If an Authorization header was provided, it must be validated directly; falling
        # back to shared localhost cookies causes cross-portal session hijacking and 403 Forbidden errors.
        if not auth_header:
            cookie_token = request.cookies.get("access_token")
            if cookie_token and cookie_token != token:
                cookie_payload = decode_token(cookie_token)
                if cookie_payload and cookie_payload.get("type") == "access":
                    # Reject cookie if it belongs to a different role than the portal requested
                    if not expected_role or cookie_payload.get("role") == expected_role:
                        token = cookie_token
                        payload = cookie_payload

    if not token or not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing or expired access token."
        )

    # If expected_role is present in token payload, verify it early
    if expected_role and payload.get("role") and payload.get("role") != expected_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token role mismatch: expected '{expected_role}', but token is for '{payload.get('role')}'."
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing subject identifier."
        )

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed user identifier in token."
        )

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token no longer exists."
        )

    if expected_role and user.role != expected_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User role mismatch: expected '{expected_role}', but user is '{user.role}'."
        )

    # Check global platform-wide ban
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account has been globally suspended by an administrator. Reason: {user.ban_reason or 'Policy violation'}"
        )

    return user


def require_role(allowed_roles: List[str]):
    async def role_checker(request: Request, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            auth_header = request.headers.get("Authorization")
            has_explicit_auth = bool(auth_header and auth_header.startswith("Bearer "))
            if not has_explicit_auth:
                # User had no explicit Bearer token; authentication fell back to a shared localhost cookie
                # belonging to a different portal/role. Raise 401 so the client can prompt login or refresh.
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Authentication required. Current session cookie belongs to role '{current_user.role}', but this endpoint requires {allowed_roles}."
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Action requires one of the following roles: {allowed_roles}, but your role is '{current_user.role}'."
            )
        return current_user
    return role_checker


require_admin = require_role(["admin"])
require_teacher = require_role(["teacher"])
require_student = require_role(["student"])
require_teacher_or_admin = require_role(["teacher", "admin"])
