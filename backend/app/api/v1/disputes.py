"""Disputes and support cases — ADR-057 (contract §3.8; ADR-050 Support through Disputes).

* ``POST /api/v1/disputes`` — open a dispute on a deal (``transaction_id``) or, without one, a
  support case.
* ``GET /api/v1/disputes`` — my cases, newest first.
* ``GET /api/v1/disputes/{dispute_id}`` — one case with my messages and staff replies.
* ``POST /api/v1/disputes/{dispute_id}/evidence`` — add a message. The contract's file part
  (multipart, 10 MB) comes with file storage; until then this takes JSON ``{"message": ...}``.

Rules live in ``app.services.disputes``. 60 requests a minute per signed-in user.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session
from app.core.exceptions import AppError
from app.services.auth import AuthRuntime, Principal
from app.services.disputes import DisputeService

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/disputes", tags=["disputes"])


def _text(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("write a few words")
    return cleaned


class OpenDisputeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    #: The deal (from the escrow screen). Leave out for a support case (ADR-050).
    transaction_id: uuid.UUID | None = None
    reason: Literal["funds_not_received", "wrong_amount", "counterparty_unresponsive", "other"]
    description: str = Field(min_length=1, max_length=2000)

    _clean = field_validator("description")(_text)


class MessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=2000)

    _clean = field_validator("message")(_text)


class DisputeMessageResponse(BaseModel):
    message_id: str
    #: The other party's messages are never shown.
    author: Literal["you", "staff"]
    body: str
    created_at: str


class DisputeResponse(BaseModel):
    dispute_id: str
    kind: Literal["dispute", "support"]
    transaction_id: str | None
    reason: str
    status: Literal["open", "under_review", "resolved"]
    outcome: str | None
    opened_by_you: bool
    description: str | None
    created_at: str
    updated_at: str
    resolved_at: str | None
    messages: list[DisputeMessageResponse]


async def limited(
    principal: CurrentPrincipal, runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)]
) -> Principal:
    if not runtime.user_limiter.hit(f"user:{principal.user_id}", runtime.clock()):
        raise AppError(
            "AUTH_429_RATE_LIMITED",
            "Too many requests. Please wait a moment and try again.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details={"retry_after_seconds": 60},
        )
    return principal


async def get_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> DisputeService:
    return DisputeService(db, runtime.clock)


Me = Annotated[Principal, Depends(limited)]
Service = Annotated[DisputeService, Depends(get_service)]


def _out(view: dict[str, Any]) -> DisputeResponse:
    return DisputeResponse.model_validate(view)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=DisputeResponse,
    summary="Open a dispute on a deal (pauses its escrow) or a support case",
)
async def open_dispute(body: OpenDisputeRequest, me: Me, service: Service) -> DisputeResponse:
    return _out(
        await service.open(
            me,
            transaction_id=body.transaction_id,
            reason=body.reason,
            description=body.description,
        )
    )


@router.get(
    "",
    response_model=list[DisputeResponse],
    summary="My disputes and support cases, newest first",
)
async def my_disputes(me: Me, service: Service) -> list[DisputeResponse]:
    return [_out(v) for v in await service.mine(me)]


@router.get(
    "/{dispute_id}",
    response_model=DisputeResponse,
    summary="One case with my messages and staff replies",
)
async def get_dispute(dispute_id: uuid.UUID, me: Me, service: Service) -> DisputeResponse:
    return _out(await service.get(me, dispute_id))


@router.post(
    "/{dispute_id}/evidence",
    status_code=status.HTTP_201_CREATED,
    response_model=DisputeResponse,
    summary="Add a message to an open case (files come with file storage)",
)
async def add_evidence(
    dispute_id: uuid.UUID, body: MessageRequest, me: Me, service: Service
) -> DisputeResponse:
    return _out(await service.add_message(me, dispute_id, body.message))
