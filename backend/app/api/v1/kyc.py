"""Identity-check endpoints — Milestone KYC-1 (ADR-039).

* ``POST /api/v1/kyc/cases`` — start or continue my identity check; returns Didit's link once.
* ``GET /api/v1/kyc/cases/current`` — my latest check, in plain words.
* ``GET /api/v1/kyc/regions`` — my status per country and a country to suggest (ADR-042).
* ``POST /api/v1/webhooks/didit`` — Didit's signed results. No sign-in: trust comes only from
  the HMAC signature and the 5-minute window (docs.didit.me).

Starting a check needs a signed-in, 2FA-verified user but not KYC (that is what it grants).
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session
from app.api.deps import get_app_settings
from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.auth import AuthRuntime, Principal
from app.services.kyc import KycService

__all__ = ["router", "webhooks_router"]

router = APIRouter(prefix="/api/v1/kyc", tags=["kyc"])
webhooks_router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

#: Didit decisions can carry many checks; still bounded before reading it all.
MAX_WEBHOOK_BYTES = 256 * 1024


Country = Literal["NG", "GB", "US"]


class StartCheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    #: The country this check verifies (ADR-042); the ID must be issued there.
    country: Country = "NG"


class RegionStatus(BaseModel):
    country: Country
    status: str


class RegionsResponse(BaseModel):
    regions: list[RegionStatus]
    #: A country the user appears to be in and is not verified for; only a suggestion.
    suggested_country: Country | None


class KycCaseResponse(BaseModel):
    kyc_case_id: str | None
    country: Country
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
    return KycService(db, runtime.clock, runtime.kyc_provider, runtime.kyc_identity_key)


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
async def start_check(
    principal: Me, kyc: Kyc, body: Annotated[StartCheckRequest | None, Body()] = None
) -> Any:
    return await kyc.start(principal, (body or StartCheckRequest()).country)


@router.get("/cases/current", response_model=KycCaseResponse, summary="My identity check")
async def my_check(principal: Me, kyc: Kyc, country: Annotated[Country, Query()] = "NG") -> Any:
    return await kyc.current(principal, country)


@router.get("/regions", response_model=RegionsResponse, summary="My identity checks per country")
async def my_regions(
    request: Request,
    principal: Me,
    kyc: Kyc,
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Any:
    seen = None
    if settings.client_country_header:
        raw = request.headers.get(settings.client_country_header, "")[:8].strip().upper()
        seen = raw if len(raw) == 2 and raw.isalpha() else None
    return await kyc.regions(principal, seen)


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
