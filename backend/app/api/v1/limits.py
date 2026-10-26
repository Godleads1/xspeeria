"""My verification tier and trade limits (ADR-058)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session
from app.api.deps import get_app_settings
from app.core.config import Settings
from app.services.auth import AuthRuntime
from app.services.limits import limits_view

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/users/me", tags=["users"])


class LimitsResponse(BaseModel):
    #: 0 (look only) to 3.
    tier: int
    #: Naira, decimal text; null at Tier 0 (no trading).
    daily_limit: str | None
    monthly_limit: str | None
    used_today: str
    used_this_month: str
    left_today: str
    left_this_month: str


@router.get("/limits", response_model=LimitsResponse, summary="My tier and trade limits")
async def my_limits(
    principal: CurrentPrincipal,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Any:
    view = await limits_view(db, principal.user_id, runtime.clock(), settings)
    await db.rollback()
    return view
