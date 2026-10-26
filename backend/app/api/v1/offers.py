"""Offer endpoints — Milestone 4.1C (ADR-029).

Routes only translate HTTP to the service; every rule lives in ``app.services.offers``.
Every route needs a signed-in, 2FA-verified user (``CurrentPrincipal``) and, until a KYC
provider exists, the local-only KYC bypass (ADR-029 §KYC). Offers are records of intent,
not money.

Limits: not the sign-in limiter (10 a minute per address, ADR-025), which is shared with
log-in and with everyone behind one carrier address (ADR-030 §2), but 60 requests a minute per
signed-in user (ADR-031).
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import (
    CurrentPrincipal,
    get_auth_runtime,
    get_auth_service,
    get_db_session,
)
from app.api.deps import get_app_settings
from app.core.config import Settings
from app.core.exceptions import AppError
from app.domain.kyc_rules import COUNTRIES
from app.domain.location_rules import currency_of, device_country
from app.domain.offer_rules import OfferInputError, parse_pair
from app.domain.search_rules import parse_search
from app.domain.settlement_rules import JURISDICTION
from app.models.marketplace import Offer
from app.schemas.offers import (
    AcceptRequest,
    AddPayoutAccountRequest,
    ChoosePayoutAccountsRequest,
    CreateGroupRequest,
    CreateOfferRequest,
    GroupResponse,
    ListingsResponse,
    MatchResponse,
    OfferResponse,
    PayoutAccountResponse,
    QueueEntryResponse,
    UpdateRateRequest,
)
from app.services.auth import AuthRuntime, AuthService, Principal
from app.services.kyc import KycService
from app.services.matches import MatchService, PayoutChoice
from app.services.offers import OfferService
from app.services.payouts import PayoutAccountService
from app.services.queue import QueueService

__all__ = ["marketplace_router", "matches_router", "payout_accounts_router", "router"]

marketplace_router = APIRouter(prefix="/api/v1/marketplace", tags=["marketplace"])
router = APIRouter(prefix="/api/v1/offers", tags=["offers"])
matches_router = APIRouter(prefix="/api/v1/matches", tags=["matches"])
payout_accounts_router = APIRouter(prefix="/api/v1/payout-accounts", tags=["payout accounts"])


async def get_offer_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> OfferService:
    return OfferService(db, runtime.clock)


async def kyc_approved(
    principal: CurrentPrincipal,
    settings: Annotated[Settings, Depends(get_app_settings)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Principal:
    """Per-user request limit, then KYC.

    Approved means an approved Didit identity check (ADR-039), or the local-only bypass.
    """
    if not runtime.user_limiter.hit(f"user:{principal.user_id}", runtime.clock()):
        raise AppError(
            "AUTH_429_RATE_LIMITED",
            "Too many requests. Please wait a moment and try again.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details={"retry_after_seconds": 60},
        )
    if settings.kyc_dev_bypass and settings.app_env == "local":
        return principal
    if await KycService(db, runtime.clock, runtime.kyc_provider).is_approved(principal.user_id):
        await db.rollback()
        return principal
    await db.rollback()
    raise AppError(
        "AUTH_403_KYC_REQUIRED",
        "Please complete identity verification before using the marketplace.",
        status_code=status.HTTP_403_FORBIDDEN,
    )


async def require_pay_country(
    principal: Principal,
    currency: str,
    settings: Settings,
    runtime: AuthRuntime,
    db: AsyncSession,
) -> None:
    """ADR-042: paying in a currency needs an approved check in that currency's country."""
    if settings.kyc_dev_bypass and settings.app_env == "local":
        return
    country = JURISDICTION.get(currency.upper())
    if country is not None and country in COUNTRIES:
        ok = await KycService(db, runtime.clock, runtime.kyc_provider).is_approved(
            principal.user_id, country
        )
        await db.rollback()
        if ok:
            return
        name = COUNTRIES[country][1]
        raise AppError(
            "AUTH_403_KYC_REQUIRED",
            f"Verify your identity for {name} to pay in {currency.upper()}.",
            status_code=status.HTTP_403_FORBIDDEN,
            details={"country": country},
        )
    # A currency with no country cannot be verified for (fail closed).
    raise AppError(
        "AUTH_403_KYC_REQUIRED",
        "Trading in this currency is not available.",
        status_code=status.HTTP_403_FORBIDDEN,
    )


Settings_ = Annotated[Settings, Depends(get_app_settings)]
Runtime = Annotated[AuthRuntime, Depends(get_auth_runtime)]
Db = Annotated[AsyncSession, Depends(get_db_session)]
Service = Annotated[OfferService, Depends(get_offer_service)]
Verified = Annotated[Principal, Depends(kyc_approved)]
IdempotencyKey = Annotated[uuid.UUID, Header(alias="Idempotency-Key")]
StepUpToken = Annotated[str | None, Header(alias="X-Step-Up-Token", max_length=128)]


async def get_match_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> MatchService:
    return MatchService(db, runtime.clock, runtime.pretend_bank)


Matches = Annotated[MatchService, Depends(get_match_service)]
Auth = Annotated[AuthService, Depends(get_auth_service)]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=OfferResponse,
    summary="Publish an offer (repeat-safe with Idempotency-Key)",
)
async def create_offer(
    body: CreateOfferRequest,
    principal: Verified,
    service: Service,
    key: IdempotencyKey,
    settings: Settings_,
    runtime: Runtime,
    db: Db,
) -> Any:
    # The maker pays the source currency (ADR-042).
    await require_pay_country(principal, body.source_currency, settings, runtime, db)
    result = await service.create(
        principal,
        key,
        body.source_currency,
        body.target_currency,
        body.source_amount,
        body.desired_rate,
    )
    return JSONResponse(status_code=result.status_code, content=result.body)


@router.post(
    "/requests",
    status_code=status.HTTP_201_CREATED,
    response_model=GroupResponse,
    summary="Publish a buy request in 2–5 currencies (repeat-safe with Idempotency-Key)",
)
async def create_group(
    body: CreateGroupRequest,
    principal: Verified,
    service: Service,
    key: IdempotencyKey,
    settings: Settings_,
    runtime: Runtime,
    db: Db,
) -> Any:
    """ADR-059 Decision 5. The maker pays naira, so the Nigeria identity check applies."""
    await require_pay_country(principal, "NGN", settings, runtime, db)
    result = await service.create_group(
        principal,
        key,
        body.source_amount,
        [(c.currency, c.desired_rate) for c in body.currencies],
    )
    return JSONResponse(status_code=result.status_code, content=result.body)


@marketplace_router.get(
    "/listings",
    response_model=ListingsResponse,
    summary="Search one currency pair: offers that can be taken, or recent completed trades",
)
async def listings(
    principal: Verified,
    service: Service,
    currency_pair: Annotated[
        str, Query(alias="filter[currency_pair]", pattern=r"^[A-Za-z]{3}/[A-Za-z]{3}$")
    ],
    listing_type: Annotated[Literal["offer"], Query(alias="filter[type]")] = "offer",
    sort: Annotated[str | None, Query(max_length=16)] = None,
    listing_status: Annotated[str | None, Query(alias="filter[status]", max_length=16)] = None,
    min_rate: Annotated[str | None, Query(alias="filter[min_rate]", max_length=16)] = None,
    max_rate: Annotated[str | None, Query(alias="filter[max_rate]", max_length=16)] = None,
    min_amount: Annotated[str | None, Query(alias="filter[min_amount]", max_length=24)] = None,
    max_amount: Annotated[str | None, Query(alias="filter[max_amount]", max_length=24)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
    x_device_country: Annotated[str | None, Header(max_length=8)] = None,
) -> Any:
    """ADR-059 Decision 1. Every filter and sort is checked on the server (allow-list, exact
    decimals, lower bound not above upper). ``filter[status]=success`` lists recent completed
    trades (rate, amount, time — never who traded)."""
    source, target = currency_pair.split("/")
    try:
        pair = parse_pair(source, target)
        search = parse_search(
            pair,
            sort=sort,
            status=listing_status,
            min_rate=min_rate,
            max_rate=max_rate,
            min_amount=min_amount,
            max_amount=max_amount,
        )
    except OfferInputError as e:
        raise AppError(e.code, e.message, status_code=422) from None
    # ADR-059 Decision 2 (rule A): nobody sees listings selling their own country's currency.
    # The country is a visibility hint only; it grants and decides nothing else.
    country = await service.viewer_country(principal, device_country(x_device_country))
    page: dict[str, Any] = {
        "status": search.status,
        "viewer_country": country,
        "hidden": False,
        "needs_location": False,
        "items": [],
        "trades": [],
        "limit": limit,
        "offset": offset,
        "next_offset": None,
    }
    if country is None:
        return {**page, "needs_location": True}
    if currency_of(country) == pair.source:
        return {**page, "hidden": True}
    if search.status == "success":
        trades = await service.completed_trades(pair.source, pair.target, limit + 1, offset, search)
        more = len(trades) > limit
        return {**page, "trades": trades[:limit], "next_offset": offset + limit if more else None}
    items = await service.marketplace(principal, source, target, limit + 1, offset, search)
    more = len(items) > limit
    return {**page, "items": items[:limit], "next_offset": offset + limit if more else None}


# --- waiting queue (ADR-059 Decision 4) ----------------------------------------------------


async def get_queue_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> QueueService:
    return QueueService(db, runtime.clock)


Queue = Annotated[QueueService, Depends(get_queue_service)]


@router.get(
    "/queue/mine",
    response_model=QueueEntryResponse | None,
    summary="The queue I am waiting in, if any",
)
async def my_queue(principal: Verified, queue: Queue) -> Any:
    return await queue.mine(principal)


@router.post(
    "/{offer_id}/queue",
    response_model=QueueEntryResponse,
    summary="Wait for an offer someone else is paying for (up to 3 people, one queue each)",
)
async def join_queue(
    offer_id: uuid.UUID,
    principal: Verified,
    queue: Queue,
    settings: Settings_,
    runtime: Runtime,
    db: Db,
) -> Any:
    # Waiting leads to taking: the same identity rule as taking applies (ADR-042).
    pays = await db.scalar(select(Offer.target_currency).where(Offer.id == offer_id))
    await db.rollback()
    if pays is not None:
        await require_pay_country(principal, pays, settings, runtime, db)
    return await queue.join(principal, offer_id)


@router.delete(
    "/{offer_id}/queue",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Stop waiting for this offer",
)
async def leave_queue(offer_id: uuid.UUID, principal: Verified, queue: Queue) -> Response:
    await queue.leave(principal, offer_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/mine", response_model=list[OfferResponse], summary="My offers, open ones first")
async def my_offers(principal: Verified, service: Service) -> Any:
    return await service.mine(principal)


@router.get("/{offer_id}", response_model=OfferResponse, summary="One offer")
async def get_offer(offer_id: uuid.UUID, principal: Verified, service: Service) -> Any:
    return await service.get(principal, offer_id)


@router.patch(
    "/{offer_id}",
    response_model=OfferResponse,
    summary="Change my offer's rate and/or amount (before anyone takes any of it)",
)
async def update_rate(
    offer_id: uuid.UUID, body: UpdateRateRequest, principal: Verified, service: Service
) -> Any:
    return await service.update_rate(principal, offer_id, body.desired_rate, body.source_amount)


@router.delete("/{offer_id}", response_model=OfferResponse, summary="Withdraw my offer")
async def withdraw(offer_id: uuid.UUID, principal: Verified, service: Service) -> Any:
    return await service.withdraw(principal, offer_id)


@router.post(
    "/{offer_id}/accept",
    status_code=status.HTTP_201_CREATED,
    response_model=MatchResponse,
    summary="Take some or all of an offer (needs an authenticator approval for trade.accept)",
)
async def accept_offer(
    offer_id: uuid.UUID,
    body: AcceptRequest,
    principal: Verified,
    matches: Matches,
    auth: Auth,
    key: IdempotencyKey,
    settings: Settings_,
    runtime: Runtime,
    db: Db,
    step_up_token: StepUpToken = None,
) -> Any:
    """Records a Match; no money moves. Same key + same request returns the first answer."""
    # The taker pays the offer's target currency (ADR-042). Unknown offers: the service 404s.
    pays = await db.scalar(select(Offer.target_currency).where(Offer.id == offer_id))
    await db.rollback()
    if pays is not None:
        await require_pay_country(principal, pays, settings, runtime, db)

    async def confirm() -> None:
        # Shares this request's database session, so the approval is spent in the same commit.
        await auth.consume_step_up(principal, "trade.accept", step_up_token)

    result = await matches.accept(principal, offer_id, key, body.accepted_amount, confirm)
    return JSONResponse(status_code=result.status_code, content=result.body)


@matches_router.get("/mine", response_model=list[MatchResponse], summary="My matches")
async def my_matches(principal: Verified, matches: Matches) -> Any:
    return await matches.mine(principal)


@matches_router.get("/{match_id}", response_model=MatchResponse, summary="One match")
async def get_match(match_id: uuid.UUID, principal: Verified, matches: Matches) -> Any:
    return await matches.get(principal, match_id)


# --- payout accounts and per-deal choice (Milestone 4.1E, ADR-035) ------------------------


async def get_payout_account_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> PayoutAccountService:
    return PayoutAccountService(db, runtime.clock, runtime.beneficiary_box, runtime.name_check)


PayoutAccounts = Annotated[PayoutAccountService, Depends(get_payout_account_service)]


@payout_accounts_router.get(
    "",
    response_model=list[PayoutAccountResponse],
    summary="My payout accounts (last 4 digits only)",
)
async def my_payout_accounts(principal: Verified, accounts: PayoutAccounts) -> Any:
    return await accounts.mine(principal)


@payout_accounts_router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=PayoutAccountResponse,
    summary="Add one of my own accounts (needs an authenticator approval for beneficiary.add)",
)
async def add_payout_account(
    body: AddPayoutAccountRequest,
    principal: Verified,
    accounts: PayoutAccounts,
    auth: Auth,
    step_up_token: StepUpToken = None,
) -> Any:
    async def confirm() -> None:
        await auth.consume_step_up(principal, "beneficiary.add", step_up_token)

    return await accounts.add(
        principal,
        currency=body.currency,
        bank_name=body.bank_name,
        account_number=body.account_number,
        routing_number=body.routing_number,
        sort_code=body.sort_code,
        account_type=body.account_type,
        confirm_step_up=confirm,
    )


@payout_accounts_router.delete(
    "/{payout_account_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove one of my payout accounts (needs beneficiary.remove approval)",
)
async def remove_payout_account(
    payout_account_id: uuid.UUID,
    principal: Verified,
    accounts: PayoutAccounts,
    auth: Auth,
    step_up_token: StepUpToken = None,
) -> Response:
    async def confirm() -> None:
        await auth.consume_step_up(principal, "beneficiary.remove", step_up_token)

    await accounts.remove(principal, payout_account_id, confirm)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@matches_router.put(
    "/{match_id}/payout-accounts",
    response_model=MatchResponse,
    summary="Choose where my side of this deal is paid (needs payout.confirm approval)",
)
async def choose_payout_accounts(
    match_id: uuid.UUID,
    body: ChoosePayoutAccountsRequest,
    principal: Verified,
    matches: Matches,
    auth: Auth,
    step_up_token: StepUpToken = None,
) -> Any:
    async def confirm() -> None:
        await auth.consume_step_up(principal, "payout.confirm", step_up_token)

    choices = [PayoutChoice(a.payout_account_id, a.amount) for a in body.accounts]
    return await matches.choose_payout_accounts(principal, match_id, choices, confirm)
