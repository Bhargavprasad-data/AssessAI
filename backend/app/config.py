import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DB_PATH = (_BACKEND_DIR / "proctor_dev.db").as_posix()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", str(_BACKEND_DIR / ".env"), str(_BACKEND_DIR.parent / ".env")),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # General
    ENVIRONMENT: str = "development"
    APP_NAME: str = "AI-Based Adaptive Online Assessment and Smart Proctoring System"
    API_V1_STR: str = "/api"

    # Security & JWT Auth
    SECRET_KEY: str = "dev-secret-key-change-in-production-min-32-chars-long!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    CSRF_SECRET_KEY: str = "dev-csrf-secret-key-change-in-production!"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    # Database
    # Defaults to SQLite in backend directory for local development; overridden by DATABASE_URL in production/Postgres
    DATABASE_URL: str = f"sqlite+aiosqlite:///{_DEFAULT_DB_PATH}"

    # Storage
    STORAGE_TYPE: str = "local"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_BYTES: int = 20 * 1024 * 1024  # 20MB

    # AI Providers
    AI_PROVIDER_ORDER: str = "gemini,anthropic,openai,ollama,mock"
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    MOCK_AI_ENABLED: bool = True
    AI_TIMEOUT_SECONDS: float = 30.0
    AI_MAX_RETRIES: int = 2
    AI_CIRCUIT_BREAKER_COOLDOWN_SECONDS: float = 60.0
    AI_MAX_REGENERATION_ROUNDS: int = 3

    # Proctoring & Timing Defaults
    DEFAULT_MAX_VIOLATIONS: int = 3
    VIOLATION_DEBOUNCE_SECONDS: float = 2.0
    SWEEP_INTERVAL_SECONDS: int = 60
    DISCONNECT_IDLE_SECONDS: int = 300  # 5 minutes idle
    DISCONNECT_TIMEOUT_SECONDS: int = 1800  # 30 minutes cap

    # Adaptive Defaults
    DEFAULT_FAST_RESPONSE_THRESHOLD_SECONDS: int = 30
    DEFAULT_MAX_QUESTION_COUNT: int = 15
    DEFAULT_PROMOTION_THRESHOLD: int = 2
    DEFAULT_DEMOTION_THRESHOLD: int = 2

    # Rate Limiting
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: int = 20
    AUTH_RATE_LIMIT_WINDOW_MINUTES: int = 15

    @property
    def provider_order_list(self) -> List[str]:
        return [p.strip().lower() for p in self.AI_PROVIDER_ORDER.split(",") if p.strip()]


settings = Settings()
