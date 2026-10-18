"""FastAPI application factory.

Milestone 1 wires configuration, structured logging, the error envelope and a single
health route. Milestone AUTH-1 (ADR-025) adds the sign-in and current-user routes and the
request log. No money-bearing router exists.

Sign-in needs ``JWT_SECRET_KEY`` (at least 32 characters) and ``MFA_ENCRYPTION_KEY`` (base64 of
32 bytes, ADR-026). Without either, the auth routes answer
``SYS_503_SERVICE_UNAVAILABLE`` and the rest of the application still boots. No SMS provider
is connected (ADR-025 §2): tests inject one through ``auth_runtime``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import FastAPI

from app.api.v1 import auth, health
from app.core.auth_tokens import ALGORITHM, TokenKeys
from app.core.config import Settings, get_settings
from app.core.exceptions import install_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.mfa import SecretBox
from app.core.pin_hashing import PinHasher
from app.core.rate_limit import SlidingWindowLimiter
from app.core.request_logging import install_request_logging
from app.domain.auth_rules import LOGIN_REQUESTS_PER_MINUTE, MAX_PIN_TRIES, PIN_LOCK
from app.services.auth import AuthRuntime

__all__ = ["build_auth_runtime", "create_app", "app"]


def build_auth_runtime(settings: Settings) -> AuthRuntime:
    """Production wiring. Fails fast on a misconfigured key rather than half-working."""
    if settings.jwt_algorithm and settings.jwt_algorithm != ALGORITHM:
        raise ValueError(f"jwt_algorithm must be {ALGORITHM} (ADR-025)")
    if (
        settings.is_production
        and settings.jwt_secret_key
        and "CHANGE_ME" in settings.jwt_secret_key
    ):
        raise ValueError("JWT_SECRET_KEY is still the .env.example placeholder")
    if (
        settings.is_production
        and settings.mfa_encryption_key
        and "CHANGE_ME" in settings.mfa_encryption_key
    ):
        raise ValueError("MFA_ENCRYPTION_KEY is still the .env.example placeholder")
    keys = TokenKeys(settings.jwt_secret_key) if settings.jwt_secret_key else None
    box = SecretBox(settings.mfa_encryption_key) if settings.mfa_encryption_key else None
    return AuthRuntime(
        keys=keys,
        secret_box=box,
        hasher=PinHasher(),
        sms=None,
        clock=lambda: datetime.now(UTC),
        address_limiter=SlidingWindowLimiter(
            limit=LOGIN_REQUESTS_PER_MINUTE, window=timedelta(minutes=1)
        ),
        unknown_identifier_limiter=SlidingWindowLimiter(limit=MAX_PIN_TRIES, window=PIN_LOCK),
    )


def create_app(
    settings: Settings | None = None, auth_runtime: AuthRuntime | None = None
) -> FastAPI:
    """Build the application. Accepts injected settings so tests need no environment."""
    resolved = settings or get_settings()
    configure_logging(resolved.log_level)

    application = FastAPI(
        title=resolved.app_name,
        version="0.0.0",
        docs_url=resolved.docs_url,
        redoc_url=resolved.redoc_url,
        openapi_url=resolved.openapi_url,
    )

    application.state.settings = resolved
    application.state.auth = auth_runtime or build_auth_runtime(resolved)
    install_exception_handlers(application)
    install_request_logging(application)
    application.include_router(health.router)
    application.include_router(auth.router)

    get_logger(__name__).info(
        "application_configured",
        extra={"environment": resolved.app_env, "api_version": resolved.api_v},
    )
    return application


app = create_app()
