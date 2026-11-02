"""Health endpoint.

Liveness only. It must answer without a database, Redis, Celery, partner credentials
or any secret -- a health check that requires infrastructure cannot report that the
infrastructure is missing.

SEC-014 (2026-11-02): it answers ``{"status": "ok"}`` and nothing else. The environment name,
app name and API version told an unauthenticated caller which deployment they had reached;
Super Admins see those on System Health (ADR-072) instead.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

__all__ = ["router", "HealthResponse"]

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Liveness payload: nothing about the deployment."""

    status: Literal["ok"]


@router.get("/health", response_model=HealthResponse, summary="Liveness check")
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
