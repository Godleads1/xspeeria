"""FastAPI application factory.

Milestone 1 wires configuration, structured logging, the error envelope and a single
health route. It intentionally registers no domain router: no domain entity, service
or persistence exists yet.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.api.v1 import health
from app.core.config import Settings, get_settings
from app.core.exceptions import install_exception_handlers
from app.core.logging import configure_logging, get_logger

__all__ = ["create_app", "app"]


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the application. Accepts injected settings so tests need no environment."""
    resolved = settings or get_settings()
    configure_logging(resolved.log_level)

    application = FastAPI(
        title=resolved.app_name,
        version="0.0.0",
        docs_url=resolved.docs_url,
        redoc_url=resolved.redoc_url,
    )

    application.state.settings = resolved
    install_exception_handlers(application)
    application.include_router(health.router)

    get_logger(__name__).info(
        "application_configured",
        extra={"environment": resolved.app_env, "api_version": resolved.api_v},
    )
    return application


app = create_app()
