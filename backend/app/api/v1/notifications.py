"""In-app notifications — Milestone N-1 (ADR-044).

* ``GET /api/v1/notifications`` — my messages, newest first (``filter[read]``, ``before``,
  ``limit``), with my unread count.
* ``PATCH /api/v1/notifications/{notification_id}`` — mark one read or unread.

Someone else's message answers 404, the same as one that does not exist (contract §3.7 says
403 ``AUTH_403_NOT_OWNER``; 404 is used so ids cannot be probed — ADR-044).
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, StrictBool
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session
from app.core.exceptions import AppError
from app.services.auth import AuthRuntime, Principal
from app.services.notifications import MAX_PAGE, NotificationService

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    notification_id: str
    type: str
    #: e.g. "kyc.approved", "match.created", "settlement.completed" (ADR-044 list).
    event: str
    #: Ids and codes only, for the app's words and link.
    data: dict[str, str]
    created_at: str
    read: StrictBool


class NotificationPage(BaseModel):
    items: list[NotificationResponse]
    unread_count: int
    #: Pass as ``before`` for the next page; null when there is none.
    next_before: str | None


class MarkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    read: StrictBool


async def get_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> NotificationService:
    return NotificationService(db, runtime.clock)


Notifications = Annotated[NotificationService, Depends(get_service)]


async def limited(
    principal: CurrentPrincipal, runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)]
) -> Principal:
    if not await runtime.user_limiter.hit(f"user:{principal.user_id}", runtime.clock()):
        raise AppError(
            "AUTH_429_RATE_LIMITED",
            "Too many requests. Please wait a moment and try again.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details={"retry_after_seconds": 60},
        )
    return principal


Me = Annotated[Principal, Depends(limited)]


@router.get("", response_model=NotificationPage, summary="My notifications, newest first")
async def my_notifications(
    principal: Me,
    service: Notifications,
    read: Annotated[bool | None, Query(alias="filter[read]")] = None,
    before: Annotated[uuid.UUID | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE)] = 20,
) -> Any:
    return await service.list(principal, read=read, before=before, limit=limit)


@router.patch(
    "/{notification_id}", response_model=NotificationResponse, summary="Mark read or unread"
)
async def mark_notification(
    notification_id: uuid.UUID, body: MarkRequest, principal: Me, service: Notifications
) -> Any:
    return await service.mark(principal, notification_id, body.read)
