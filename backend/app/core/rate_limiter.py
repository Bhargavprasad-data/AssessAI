import time
from collections import defaultdict
from typing import Dict, List
from fastapi import HTTPException, status, Request
from app.config import settings


class InMemoryRateLimiter:
    def __init__(self):
        # Map key -> list of timestamps
        self._requests: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, key: str, max_requests: int, window_seconds: float) -> bool:
        now = time.time()
        window_start = now - window_seconds
        
        # Prune old timestamps
        timestamps = [t for t in self._requests[key] if t > window_start]
        if len(timestamps) >= max_requests:
            self._requests[key] = timestamps
            return False
        
        timestamps.append(now)
        self._requests[key] = timestamps
        return True

    def check_rate_limit(self, key: str, max_requests: int, window_seconds: float, error_detail: str = "Too many requests. Please try again later."):
        if not self.is_allowed(key, max_requests, window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=error_detail
            )


rate_limiter = InMemoryRateLimiter()


def rate_limit_auth(request: Request, account_identifier: str = ""):
    client_ip = request.client.host if request.client else "unknown"
    key = f"auth:{client_ip}:{account_identifier}"
    window_seconds = settings.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60
    rate_limiter.check_rate_limit(
        key=key,
        max_requests=settings.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
        window_seconds=window_seconds,
        error_detail="Too many authentication attempts. Please try again later."
    )


def rate_limit_ai_generation(user_id: str):
    key = f"ai_gen:{user_id}"
    rate_limiter.check_rate_limit(
        key=key,
        max_requests=10,
        window_seconds=60.0,
        error_detail="AI generation rate limit reached. Please wait before triggering another job."
    )
