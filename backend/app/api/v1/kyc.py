"""Identity-check endpoints — Milestone KYC-1 (ADR-039).

* ``POST /api/v1/kyc/cases`` — start or continue my identity check; returns Didit's link once.
* ``GET /api/v1/kyc/cases/current`` — my latest check, in plain words.
* ``POST /api/v1/webhooks/didit`` — Didit's signed results. No sign-in: trust comes only from
  the HMAC signature and the 5-minute window (docs.didit.me).

Starting a check needs a signed-in, 2FA-verified user but not KYC (that is what it grants).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session
from app.core.exceptions import AppError
from app.services.auth import AuthRuntime, Principal
from app.services.kyc import KycService

__all__ = ["router", "webhooks_router"]

router = APIRouter(prefix="/api/v1/kyc", tags=["kyc"])
webhooks_router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

#: Didit decisions can carry many checks; still bounded before reading it all.
MAX_WEBHOOK_BYTES = 256 * 1024


class KycCaseResponse(BaseModel):
    kyc_case_id: str | None
    status: str
    message: str | None
    #: Didit's hosted check, returned once when starting or continuing. Never stored.
    verification_url: str | None
    #: The name on the ID, only once verified.
    legal_name: str | None


async def get_kyc_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> KycService:
    return KycService(db, runtime.clock, runtime.kyc_provider)


Kyc = Annotated[KycService, Depends(get_kyc_service)]


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


Me = Annotated[Principal, Depends(limited)]


@router.post(
    "/cases",
    response_model=KycCaseResponse,
    summary="Start or continue my identity check (Didit)",
)
async def start_check(principal: Me, kyc: Kyc) -> Any:
    return await kyc.start(principal)


@router.get("/cases/current", response_model=KycCaseResponse, summary="My identity check")
async def my_check(principal: Me, kyc: Kyc) -> Any:
    return await kyc.current(principal)


@webhooks_router.post("/didit", summary="Didit results (signed)", include_in_schema=False)
async def didit_webhook(
    request: Request,
    kyc: Kyc,
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Any:
    address = request.client.host if request.client else "unknown"
    if not runtime.user_limiter.hit(f"kyc-webhook:{address}", runtime.clock()):
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
        "X-Signature-V2": request.headers.get("x-signature-v2", "")[:128],
        "X-Timestamp": request.headers.get("x-timestamp", "")[:20],
    }
    result = await kyc.ingest(headers, raw)
    return JSONResponse(status_code=result.http_status, content={"verdict": result.verdict})
