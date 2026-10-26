"""My verification tier and trade limits (ADR-058)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session
from app.api.deps import get_app_settings
from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.auth import AuthRuntime, Principal
from app.services.limits import limits_view
from app.services.tier_checks import TierCheckService

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


# --- checks for higher tiers (ADR-058 Tier 2 and Tier 3) -------------------------------------


class TierChecksResponse(BaseModel):
    tier: int
    #: approved / declined / in_review, or null when never tried.
    bvn: str | None
    #: The home address as given (shown back to its owner only), or null.
    address: dict[str, str] | None
    proof_of_address: str | None
    source_of_funds: str | None


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BvnRequest(_Strict):
    bvn: str = Field(min_length=11, max_length=11)


class AddressRequest(_Strict):
    line1: str = Field(min_length=3, max_length=120)
    line2: str | None = Field(default=None, max_length=120)
    city: str = Field(min_length=2, max_length=60)
    state: str = Field(min_length=2, max_length=60)
    postcode: str | None = Field(default=None, max_length=12)
    country: str = Field(pattern=r"^[A-Z]{2}$")


class ProofOfAddressRequest(_Strict):
    #: The file, base64. At most 10 MB once decoded (checked by the service).
    document: str = Field(min_length=4, max_length=14_000_000)
    content_type: str = Field(max_length=32)


class SourceOfFundsRequest(_Strict):
    source: str = Field(max_length=16)
    note: str | None = Field(default=None, max_length=200)


async def get_tier_checks(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> TierCheckService:
    return TierCheckService(db, runtime.clock, runtime.tier_checks, settings)


Checks = Annotated[TierCheckService, Depends(get_tier_checks)]


async def _limited(
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


Limited = Annotated[Principal, Depends(_limited)]


@router.get("/tier-checks", response_model=TierChecksResponse, summary="My checks for higher tiers")
async def my_tier_checks(principal: CurrentPrincipal, checks: Checks) -> Any:
    return await checks.view(principal)


@router.post("/tier-checks/bvn", response_model=TierChecksResponse, summary="Check my BVN (Tier 2)")
async def submit_bvn(body: BvnRequest, principal: Limited, checks: Checks) -> Any:
    return await checks.submit_bvn(principal, body.bvn)


@router.post(
    "/tier-checks/address", response_model=TierChecksResponse, summary="My home address (Tier 2)"
)
async def submit_address(body: AddressRequest, principal: Limited, checks: Checks) -> Any:
    return await checks.submit_address(
        principal, {k: v for k, v in body.model_dump().items() if v is not None}
    )


@router.post(
    "/tier-checks/proof-of-address",
    response_model=TierChecksResponse,
    summary="Upload a proof of address (Tier 3); checked by Didit, never stored",
)
async def submit_proof_of_address(
    body: ProofOfAddressRequest, principal: Limited, checks: Checks
) -> Any:
    return await checks.submit_proof_of_address(principal, body.document, body.content_type)


@router.post(
    "/tier-checks/source-of-funds",
    response_model=TierChecksResponse,
    summary="Where the money I trade comes from (Tier 3)",
)
async def submit_source_of_funds(
    body: SourceOfFundsRequest, principal: Limited, checks: Checks
) -> Any:
    return await checks.submit_source_of_funds(principal, body.source, body.note)
