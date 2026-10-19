"""Phone push tokens — Milestone N-3 (ADR-052).

* ``PUT /api/v1/users/me/push-token`` — this phone's Expo push token, for my current session.
* ``DELETE /api/v1/users/me/push-token`` — stop pushes to this phone.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import get_auth_runtime, get_db_session
from app.api.v1.notifications import Me
from app.services.auth import AuthRuntime
from app.services.push import PushTokenService

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/users/me/push-token", tags=["notifications"])


class PushTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(
        max_length=255, pattern=r"^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$"
    )
    platform: Literal["ios", "android"]


async def get_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> PushTokenService:
    return PushTokenService(db, runtime.clock)


Tokens = Annotated[PushTokenService, Depends(get_service)]


@router.put("", status_code=status.HTTP_204_NO_CONTENT, summary="Register this phone for push")
async def register_push_token(body: PushTokenRequest, principal: Me, service: Tokens) -> Response:
    await service.register(principal, body.token, body.platform)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT, summary="Stop push to this phone")
async def remove_push_token(principal: Me, service: Tokens) -> Response:
    await service.remove(principal)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
