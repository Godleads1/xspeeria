"""Help for people who can't log in — ADR-103 (owner 2026-11-09).

No log-in, so these routes are public and limited per network address (ADR-087), like the
sign-in routes. Opening a request answers the same whether or not an account has that phone.
Reading or replying needs the request id and the private key the phone was given, sent in the
``X-Help-Key`` header (never in the address, so it isn't logged).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import get_auth_runtime, get_db_session, limit_by_address
from app.services.auth import AuthRuntime
from app.services.help import HelpService

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/help", tags=["help"], dependencies=[Depends(limit_by_address)])


def _text(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("write a few words")
    return cleaned


class OpenHelpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str = Field(min_length=8, max_length=20)
    email: str = Field(min_length=3, max_length=254)
    message: str = Field(min_length=1, max_length=2000)

    _clean = field_validator("message")(_text)


class HelpOpened(BaseModel):
    request_id: str
    #: Keep it on the phone: it is the only way to read the answers. Shown once.
    key: str


class HelpReply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=2000)

    _clean = field_validator("message")(_text)


class HelpMessageOut(BaseModel):
    message_id: str
    author: Literal["you", "staff"]
    body: str
    created_at: datetime


class HelpThreadOut(BaseModel):
    request_id: str
    status: Literal["open", "closed"]
    messages: list[HelpMessageOut]


def _service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> HelpService:
    return HelpService(db, runtime.clock)


Service = Annotated[HelpService, Depends(_service)]
Key = Annotated[str, Header(alias="X-Help-Key", min_length=16, max_length=128)]


@router.post(
    "/requests",
    status_code=status.HTTP_201_CREATED,
    response_model=HelpOpened,
    summary="Ask for help without logging in",
)
async def open_request(body: OpenHelpRequest, service: Service) -> HelpOpened:
    made = await service.open(body.phone, body.email, body.message)
    return HelpOpened(request_id=str(made.request_id), key=made.key)


@router.get("/requests/{request_id}", response_model=HelpThreadOut, summary="Read the answers")
async def read_request(request_id: uuid.UUID, key: Key, service: Service) -> HelpThreadOut:
    t = await service.thread(request_id, key)
    return HelpThreadOut(
        request_id=str(t.request_id),
        status=t.status,  # type: ignore[arg-type]
        messages=[HelpMessageOut(**m) for m in t.messages],
    )


@router.post(
    "/requests/{request_id}/messages",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reply to our team",
)
async def reply(request_id: uuid.UUID, body: HelpReply, key: Key, service: Service) -> Response:
    await service.customer_reply(request_id, key, body.message)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
