"""Service notices for signed-in app users (ADR-066): outages staff have reported.

Read-only. Shows only the service, the message, how serious it is and the times — never who
reported it or anything about other users.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session
from app.services.auth import AuthRuntime
from app.services.outages import active_notices

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/service-notices", tags=["notices"])


@router.get("", summary="Outage notices to show in the app")
async def service_notices(
    principal: CurrentPrincipal,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Any:
    del principal  # signed-in users only
    return await active_notices(db, runtime.clock())
