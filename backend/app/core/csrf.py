import hmac
import hashlib
import secrets
from fastapi import Request, HTTPException, status
from app.config import settings


def generate_csrf_token() -> str:
    """Generate a random CSRF token signed with the CSRF secret key."""
    raw = secrets.token_urlsafe(32)
    sig = hmac.new(settings.CSRF_SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_csrf_token(token: str) -> bool:
    if not token or "." not in token:
        return False
    parts = token.split(".", 1)
    if len(parts) != 2:
        return False
    raw, sig = parts
    expected = hmac.new(settings.CSRF_SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


async def check_csrf_protection(request: Request):
    """
    Dependency that enforces double-submit cookie / header CSRF protection
    on state-changing HTTP methods.
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("X-CSRF-Token") or request.headers.get("x-csrf-token")

    if not cookie_token or not header_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF verification failed: Missing CSRF token in cookie or header"
        )

    if not verify_csrf_token(cookie_token) or not verify_csrf_token(header_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF verification failed: Invalid token signature"
        )

    if not hmac.compare_digest(cookie_token, header_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF verification failed: Cookie and header tokens do not match"
        )
