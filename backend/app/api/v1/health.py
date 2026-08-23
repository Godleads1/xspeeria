"""Health endpoint.

Liveness only. It must answer without a database, Redis, Celery, partner credentials
or any secret -- there is nothing to depend on in Milestone 1, and a health check that
requires infrastructure cannot report that the infrastructure is missing.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_app_settings
from app.core.config import Settings

__all__ = ["router", "HealthResponse"]

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Liveness payload. Carries no secret and no infrastructure detail."""

    status: Literal["ok"]
    app: str
    environment: str
    api_version: str


@router.get("/health", response_model=HealthResponse, summary="Liveness check")
async def health(settings: Annotated[Settings, Depends(get_app_settings)]) -> HealthResponse:
    return HealthResponse(
        status="ok",
        app=settings.app_name,
        environment=settings.app_env,
        api_version=settings.api_v,
    )
