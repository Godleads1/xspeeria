"""Escrow endpoints — Milestone 4.1F (ADR-037). **Simulation only.**

* ``GET /api/v1/matches/{id}/settlement`` — my escrow steps for one deal (parties only).
* ``POST /api/v1/webhooks/partners/{code}`` — partner messages. No user sign-in: trust comes
  only from the HMAC signature over the exact body bytes and the ±5 minute window (ADR-002 §3).
* ``POST /api/v1/dev/matches/{id}/simulate-transfer`` — only when ``APP_ENV=local`` and
  ``PRETEND_BANK=true``: pretend my bank transfer arrived. It goes through the pretend bank's
  signed message, never straight to FUNDED.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import get_auth_runtime, get_db_session
from app.api.v1.offers import Verified
from app.core.client_address import client_address
from app.core.exceptions import AppError
from app.schemas.settlement import SettlementResponse
from app.services.auth import AuthRuntime
from app.services.settlement import SettlementService

__all__ = ["dev_router", "router", "webhooks_router"]

router = APIRouter(prefix="/api/v1/matches", tags=["escrow"])
webhooks_router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])
dev_router = APIRouter(prefix="/api/v1/dev", tags=["dev"])

#: Partner messages are small; refuse anything larger before reading it all.
MAX_WEBHOOK_BYTES = 16 * 1024


async def get_settlement_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> SettlementService:
    return SettlementService(db, runtime.clock, runtime.pretend_bank)


Settlements = Annotated[SettlementService, Depends(get_settlement_service)]


@router.get(
    "/{match_id}/settlement",
    response_model=SettlementResponse,
    summary="My escrow steps for this deal",
)
async def my_settlement(match_id: uuid.UUID, principal: Verified, service: Settlements) -> Any:
    return await service.view(principal, match_id)


@router.post(
    "/{match_id}/settlement/extend",
    response_model=SettlementResponse,
    summary="Ask once for 5 more minutes to pay into escrow (the taker only)",
)
async def extend_funding(match_id: uuid.UUID, principal: Verified, service: Settlements) -> Any:
    return await service.extend(principal, match_id)


@webhooks_router.post(
    "/partners/{partner_code}",
    summary="Partner bank messages (signed)",
    include_in_schema=False,
)
async def partner_webhook(
    partner_code: str,
    request: Request,
    service: Settlements,
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Any:
    # Unsigned traffic is still kept as evidence, so bound how fast anyone can add it.
    address = client_address(request)  # ADR-109: behind a trusted proxy, the sender
    if not await runtime.user_limiter.hit(f"webhook:{address}", runtime.clock()):
        raise AppError("AUTH_429_RATE_LIMITED", "Too many requests.", status_code=429)
    declared = request.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or int(declared) > MAX_WEBHOOK_BYTES):
        raise AppError("VALIDATION_ERROR", "Message too large.", status_code=413)
    raw = b""
    async for chunk in request.stream():
        raw += chunk
        if len(raw) > MAX_WEBHOOK_BYTES:
            raise AppError("VALIDATION_ERROR", "Message too large.", status_code=413)
    headers = {
        "X-Xspeeria-Signature": request.headers.get("x-xspeeria-signature", "")[:128],
        "X-Xspeeria-Timestamp": request.headers.get("x-xspeeria-timestamp", "")[:20],
    }
    result = await service.ingest(partner_code[:32], headers, raw)
    return JSONResponse(status_code=result.http_status, content={"verdict": result.verdict})


@dev_router.post(
    "/matches/{match_id}/simulate-transfer",
    response_model=SettlementResponse,
    status_code=status.HTTP_200_OK,
    summary="DEV ONLY: pretend my bank transfer into escrow arrived",
)
async def simulate_transfer(match_id: uuid.UUID, principal: Verified, service: Settlements) -> Any:
    return await service.simulate_transfer(principal, match_id)
