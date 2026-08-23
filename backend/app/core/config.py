"""Application settings.

Every value that Milestone 1 does not need is **optional**. The application must boot,
serve `/health` and run its test suite with no database, no Redis, no Celery, no
partner credentials, no webhook secret and no production JWT configuration.

Nothing here invents a value that Decision 2 owns: there are no MFA rules, password
parameters, lockout thresholds, session expiries, rate limits or recovery rules. The
JWT expiry below is a transport-level default carried over from `.env.example` and is
**not** a security-policy decision.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

__all__ = ["Settings", "get_settings"]

Environment = Literal["local", "development", "staging", "production"]


class Settings(BaseSettings):
    """Environment-driven settings.

    Field names mirror the keys already present in `.env.example`. Future keys are
    retained and optional so that later milestones can adopt them without a rename.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Xspeeria"
    app_env: Environment = "local"
    debug: bool = False
    api_v: str = "v1"
    log_level: str = "INFO"
    enable_docs: bool = True
    enable_redoc: bool = False

    # --- Future infrastructure. Unset in Milestone 1; the app must not require them. ---
    database_url: str | None = None
    redis_url: str | None = None
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    # --- Future security transport config. Values are NOT security policy. ---
    jwt_secret_key: str | None = None
    jwt_algorithm: str | None = None
    jwt_access_token_expire_minutes: int | None = None
    webhook_shared_secret: str | None = None

    cors_allowed_origins: str = ""

    @field_validator("log_level")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        allowed = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}
        upper = value.upper()
        if upper not in allowed:
            raise ValueError(f"log_level must be one of {sorted(allowed)}")
        return upper

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def docs_url(self) -> str | None:
        return "/docs" if self.enable_docs and not self.is_production else None

    @property
    def redoc_url(self) -> str | None:
        return "/redoc" if self.enable_redoc and not self.is_production else None

    @property
    def openapi_url(self) -> str | None:
        """The schema is disabled in production alongside the docs UIs.

        Gated on the environment alone, not on ``enable_docs``: outside production the
        schema must stay reachable for the docs UI to load, and the machine-readable
        schema is the more useful artefact to an attacker, so it must not outlive the
        UIs that render it.
        """
        return None if self.is_production else "/openapi.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor. Cleared in tests via ``get_settings.cache_clear()``."""
    return Settings()
