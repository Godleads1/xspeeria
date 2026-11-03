"""Health endpoints.

``/health`` is liveness only. It must answer without a database, Redis, Celery, partner credentials
or any secret -- a health check that requires infrastructure cannot report that the
infrastructure is missing.

SEC-014 (2026-11-02): it answers ``{"status": "ok"}`` and nothing else. The environment name,
app name and API version told an unauthenticated caller which deployment they had reached;
Super Admins see those on System Health (ADR-072) instead.

``/health/ready`` (ADR-088) is readiness, for a load balancer: 200 ``{"status": "ready"}`` only
when this server can reach its database, otherwise 503 ``{"status": "not_ready"}``. Nothing else
is said (not why, not which database). The answer is kept for one second, so callers hitting it
in a loop cost at most one tiny query a second per server process.
"""

from __future__ import annotations

import asyncio
import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import get_app_settings
from app.core.config import Settings
from app.core.logging import get_logger

__all__ = ["READY_TIMEOUT_SECONDS", "ReadyResponse", "router", "HealthResponse"]

_logger = get_logger(__name__)

#: How long the database may take to answer before the server counts as not ready.
READY_TIMEOUT_SECONDS = 2.0
_CACHE_SECONDS = 1.0
_last: tuple[float, bool] | None = None

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Liveness payload: nothing about the deployment."""

    status: Literal["ok"]


@router.get("/health", response_model=HealthResponse, summary="Liveness check")
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


class ReadyResponse(BaseModel):
    """Readiness payload: ready or not, nothing about why."""

    status: Literal["ready", "not_ready"]


async def _database_answers(settings: Settings) -> bool:
    if not settings.database_url:
        return False
    from app.db.session import get_sessionmaker

    try:
        async with get_sessionmaker(settings)() as db:
            await asyncio.wait_for(db.execute(text("SELECT 1")), READY_TIMEOUT_SECONDS)
            await db.rollback()
        return True
    except Exception as exc:  # noqa: BLE001 - any failure means "not ready"; logged, not shown
        _logger.warning("not_ready", extra={"error": type(exc).__name__})
        return False


@router.get(
    "/health/ready",
    response_model=ReadyResponse,
    summary="Readiness check: can this server reach its database?",
    responses={503: {"model": ReadyResponse}},
)
async def ready(
    response: Response, settings: Annotated[Settings, Depends(get_app_settings)]
) -> ReadyResponse:
    global _last
    now = time.monotonic()
    if _last is not None and now - _last[0] < _CACHE_SECONDS:
        ok = _last[1]
    else:
        ok = await _database_answers(settings)
        _last = (now, ok)
    response.headers["Cache-Control"] = "no-store"
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadyResponse(status="not_ready")
    return ReadyResponse(status="ready")
