"""Offers — Milestone 4.1C (ADR-029).

An Offer is a record of what a user is willing to exchange; nothing here moves funds.
Every check is on the server: amounts, rate (positivity, then the official-rate ceiling),
ownership, status. The client's word is never taken for who it is, what it owns, or a price.

Publishing is idempotent per user for 24 hours: the same `Idempotency-Key` with the same
request returns the first answer; with a different request it is refused.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_HALF_EVEN, Decimal
from typing import Any

from fastapi import status
from sqlalchemy import and_, case, delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.money import from_minor
from app.domain.offer_rules import (
    CURRENCY_DEF_VERSION,
    FORMAT_ERROR,
    IDEMPOTENCY_TTL,
    OFFICIAL_RATE,
    SCALE,
    OfferInputError,
    parse_amount_minor,
    parse_pair,
    parse_rate,
    rate_problem,
)
from app.domain.search_rules import Search
from app.models.kyc import KycCase
from app.models.marketplace import ACTIVE_STATUSES, IdempotencyRecord, Match, Offer
from app.models.settlement import Settlement, Transaction
from app.services.auth import Principal

__all__ = ["Created", "OfferService", "offer_view", "replay_idempotent"]

_logger = get_logger(__name__)
CREATE_OPERATION = "offer.create"
#: How far back the "Success" list looks (ADR-059 Decision 4: "recent" completed trades).
SUCCESS_WINDOW = timedelta(days=7)


def _err(code: str, message: str, http: int) -> AppError:
    return AppError(code, message, status_code=http)


def _input_error(e: OfferInputError) -> AppError:
    return _err(e.code, e.message, 422)


def _not_found() -> AppError:
    return _err("RES_404_NOT_FOUND", "That offer was not found.", status.HTTP_404_NOT_FOUND)


def money_text(minor: int, scale: int) -> str:
    return f"{from_minor(minor, scale):.{scale}f}"


def rate_text(rate: Decimal) -> str:
    """At least 2 decimals, at most 6, no trailing zeros beyond 2."""
    text_ = f"{rate:.6f}".rstrip("0")
    whole, _, frac = text_.partition(".")
    return f"{whole}.{frac.ljust(2, '0')}"


def offer_view(offer: Offer, viewer: uuid.UUID) -> dict[str, Any]:
    """The public shape of an Offer. The owner's identity is never shown to others."""
    remaining = offer.source_amount_minor - offer.matched_amount_minor
    return {
        "offer_id": str(offer.id),
        "source_currency": offer.source_currency,
        "target_currency": offer.target_currency,
        "source_amount": money_text(offer.source_amount_minor, offer.scale),
        "matched_amount": money_text(offer.matched_amount_minor, offer.scale),
        "remaining_amount": money_text(remaining, offer.scale),
        "desired_rate": rate_text(offer.desired_rate),
        "status": offer.status,
        "is_own": offer.user_id == viewer,
        "version": offer.version,
        "created_at": offer.created_at.isoformat(),
    }


@dataclass(frozen=True)
class Created:
    status_code: int
    body: dict[str, Any]


async def replay_idempotent(
    db: AsyncSession,
    user_id: uuid.UUID,
    operation: str,
    key: uuid.UUID,
    request_hash: str,
    now: datetime,
) -> Created | None:
    """Look up ``key`` for this user and operation (ADR-029, Standing Standards §7.1 steps 2–3).

    ``None``: a new request (an expired record is forgotten). Same request: the first answer,
    after rolling back. Different request: ``SYS_409_IDEMPOTENCY_KEY_REUSED``.
    """
    row = await db.scalar(
        select(IdempotencyRecord)
        .where(
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.operation == operation,
            IdempotencyRecord.idempotency_key == key,
        )
        .with_for_update()
    )
    if row is None:
        return None
    if now >= row.expires_at:  # older than 24 hours: forgotten, the key is free again
        await db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.id == row.id))
        await db.flush()
        return None
    if row.request_hash != request_hash:
        await db.rollback()
        raise _err(
            "SYS_409_IDEMPOTENCY_KEY_REUSED",
            "This request key was already used for a different request.",
            status.HTTP_409_CONFLICT,
        )
    result = Created(row.response_status, dict(row.response_body))
    await db.rollback()
    return result


class OfferService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    # --- publish ------------------------------------------------------------------------

    async def create(
        self,
        principal: Principal,
        idempotency_key: uuid.UUID,
        source_currency: str,
        target_currency: str,
        source_amount: str,
        desired_rate: str,
    ) -> Created:
        now = self._clock()
        try:
            pair = parse_pair(source_currency, target_currency)
            amount_minor = parse_amount_minor(source_amount, pair.source)
            rate = parse_rate(desired_rate)
        except OfferInputError as e:
            raise _input_error(e) from None
        problem = rate_problem(rate, pair.foreign)
        if problem is not None:
            raise _input_error(problem)

        request_hash = hashlib.sha256(
            json.dumps(
                {
                    "op": CREATE_OPERATION,
                    "source": pair.source,
                    "target": pair.target,
                    "amount_minor": amount_minor,
                    "rate": rate_text(rate),
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()

        replay = await replay_idempotent(
            self._db, principal.user_id, CREATE_OPERATION, idempotency_key, request_hash, now
        )
        if replay is not None:
            return replay

        defined = await self._db.scalar(
            text(
                "SELECT 1 FROM currency_definitions "
                "WHERE currency = :c AND currency_def_version = :v AND scale = :s"
            ),
            {"c": pair.source, "v": CURRENCY_DEF_VERSION, "s": SCALE[pair.source]},
        )
        if defined is None:
            await self._db.rollback()
            _logger.error("currency_definition_missing", extra={"currency": pair.source})
            raise _err(
                "SYS_503_SERVICE_UNAVAILABLE",
                "Offers are not available right now.",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        offer = Offer(
            id=uuid.uuid4(),
            user_id=principal.user_id,
            source_currency=pair.source,
            target_currency=pair.target,
            source_amount_minor=amount_minor,
            matched_amount_minor=0,
            scale=SCALE[pair.source],
            currency_def_version=CURRENCY_DEF_VERSION,
            desired_rate=rate,
            status="open",
            version=1,
            created_at=now,
        )
        self._db.add(offer)
        await self._db.flush()
        body = offer_view(offer, principal.user_id)
        self._db.add(
            IdempotencyRecord(
                id=uuid.uuid4(),
                user_id=principal.user_id,
                operation=CREATE_OPERATION,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response_status=status.HTTP_201_CREATED,
                response_body=body,
                created_at=now,
                expires_at=now + IDEMPOTENCY_TTL,
            )
        )
        try:
            await self._db.commit()
        except IntegrityError as exc:
            # The same key arrived twice at once; the other request won. Answer as it did.
            await self._db.rollback()
            if "uq_idempotency_records_user_operation_key" not in str(exc.orig):
                raise
            replay = await replay_idempotent(
                self._db, principal.user_id, CREATE_OPERATION, idempotency_key, request_hash, now
            )
            if replay is None:  # pragma: no cover - the winner's row must exist
                raise
            return replay
        _logger.info(
            "offer_created", extra={"user_id": str(principal.user_id), "offer_id": body["offer_id"]}
        )
        return Created(status.HTTP_201_CREATED, body)

    # --- read ---------------------------------------------------------------------------

    async def marketplace(
        self,
        principal: Principal,
        source: str,
        target: str,
        limit: int,
        offset: int,
        search: Search | None = None,
    ) -> list[dict[str, Any]]:
        """Listed offers for one pair: active and within today's official rate.

        ``search`` (ADR-059 Decision 1) narrows by rate and amount and picks the order; with
        none, the order is the original one (best rate, then oldest).
        """
        try:
            pair = parse_pair(source, target)
        except OfferInputError as e:
            raise _input_error(e) from None
        search = search or Search()
        ceiling = OFFICIAL_RATE[pair.foreign]
        remaining = Offer.source_amount_minor - Offer.matched_amount_minor
        # The amount filter and sort are in the FOREIGN currency. A buy request (paying naira)
        # holds naira, so its foreign size is naira / rate; bounds are multiplied, not divided,
        # so the comparison stays exact (NUMERIC, never float).
        selling_naira = pair.source == "NGN"
        unit = Decimal(10) ** (SCALE["NGN"] - SCALE[pair.foreign])
        conditions = [
            Offer.source_currency == pair.source,
            Offer.target_currency == pair.target,
            Offer.status.in_(ACTIVE_STATUSES),
            Offer.desired_rate <= ceiling,
        ]
        if search.min_rate is not None:
            conditions.append(Offer.desired_rate >= search.min_rate)
        if search.max_rate is not None:
            conditions.append(Offer.desired_rate <= search.max_rate)
        for bound, above in (
            (search.min_amount_minor, True),
            (search.max_amount_minor, False),
        ):
            if bound is None:
                continue
            limit_expr = Offer.desired_rate * (bound * unit) if selling_naira else bound
            conditions.append(remaining >= limit_expr if above else remaining <= limit_expr)
        # Best for the taker: buying foreign currency → lowest NGN rate; buying naira → highest.
        best = Offer.desired_rate.asc() if not selling_naira else Offer.desired_rate.desc()
        size = remaining / Offer.desired_rate if selling_naira else remaining
        order = {
            "best_rate": (best, Offer.created_at.asc()),
            "newest": (Offer.created_at.desc(),),
            "oldest": (Offer.created_at.asc(),),
            "largest": (size.desc(), best),
            "smallest": (size.asc(), best),
        }[search.sort]
        rows = (
            await self._db.scalars(
                select(Offer)
                .where(and_(*conditions))
                .order_by(*order, Offer.id.asc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        return [offer_view(o, principal.user_id) for o in rows]

    async def viewer_country(self, principal: Principal, device: str | None) -> str | None:
        """ADR-059 Decision 2: the phone's country, else the latest approved check's country."""
        if device is not None:
            return device
        row = await self._db.scalar(
            select(KycCase.country)
            .where(KycCase.user_id == principal.user_id, KycCase.status == "approved")
            .order_by(KycCase.decided_at.desc())
            .limit(1)
        )
        return str(row) if row is not None else None

    async def completed_trades(
        self,
        source: str,
        target: str,
        limit: int,
        offset: int,
        search: Search,
    ) -> list[dict[str, Any]]:
        """Recent completed trades for one pair: rate, foreign amount and time only.

        ADR-059 Decision 4 ("Success"): a record of real recent rates. Nobody is named and
        nothing here can be taken. Only settlements in the COMPLETED phase count.
        """
        try:
            pair = parse_pair(source, target)
        except OfferInputError as e:
            raise _input_error(e) from None
        selling_naira = pair.source == "NGN"
        unit = Decimal(10) ** (SCALE["NGN"] - SCALE[pair.foreign])
        allocated = Match.allocated_amount_minor
        conditions = [
            Offer.source_currency == pair.source,
            Offer.target_currency == pair.target,
            Settlement.phase == "COMPLETED",
            Settlement.updated_at >= self._clock() - SUCCESS_WINDOW,
        ]
        if search.min_rate is not None:
            conditions.append(Match.agreed_rate >= search.min_rate)
        if search.max_rate is not None:
            conditions.append(Match.agreed_rate <= search.max_rate)
        for bound, above in (
            (search.min_amount_minor, True),
            (search.max_amount_minor, False),
        ):
            if bound is None:
                continue
            limit_expr = Match.agreed_rate * (bound * unit) if selling_naira else bound
            conditions.append(allocated >= limit_expr if above else allocated <= limit_expr)
        size = allocated / Match.agreed_rate if selling_naira else allocated
        best = Match.agreed_rate.asc() if not selling_naira else Match.agreed_rate.desc()
        order = {
            "best_rate": (best, Settlement.updated_at.desc()),
            "newest": (Settlement.updated_at.desc(),),
            "oldest": (Settlement.updated_at.asc(),),
            "largest": (size.desc(), Settlement.updated_at.desc()),
            "smallest": (size.asc(), Settlement.updated_at.desc()),
        }[search.sort]
        rows = (
            await self._db.execute(
                select(Match.allocated_amount_minor, Match.agreed_rate, Settlement.updated_at)
                .join(Offer, Offer.id == Match.offer_id)
                .join(Transaction, Transaction.match_id == Match.id)
                .join(Settlement, Settlement.transaction_id == Transaction.id)
                .where(and_(*conditions))
                .order_by(*order, Settlement.id.asc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        scale = SCALE[pair.foreign]
        out = []
        for minor, rate, completed_at in rows:
            if selling_naira:
                foreign = (Decimal(minor) / unit / rate).quantize(
                    Decimal(1), rounding=ROUND_HALF_EVEN
                )
                minor_foreign = int(foreign)
            else:
                minor_foreign = int(minor)
            out.append(
                {
                    "currency": pair.foreign,
                    "amount": money_text(minor_foreign, scale),
                    "rate": rate_text(rate),
                    "completed_at": completed_at.isoformat(),
                }
            )
        return out

    async def mine(self, principal: Principal) -> list[dict[str, Any]]:
        open_first = case((Offer.status.in_(ACTIVE_STATUSES), 0), else_=1)
        rows = (
            await self._db.scalars(
                select(Offer)
                .where(Offer.user_id == principal.user_id)
                .order_by(open_first, Offer.created_at.desc())
                .limit(200)
            )
        ).all()
        return [offer_view(o, principal.user_id) for o in rows]

    async def get(self, principal: Principal, offer_id: uuid.UUID) -> dict[str, Any]:
        offer = await self._db.get(Offer, offer_id)
        if offer is None:
            raise _not_found()
        mine = offer.user_id == principal.user_id
        listed = offer.status in ACTIVE_STATUSES and offer.desired_rate <= OFFICIAL_RATE.get(
            offer.target_currency if offer.source_currency == "NGN" else offer.source_currency,
            Decimal(0),
        )
        if not mine and not listed:
            raise _not_found()  # someone else's closed offer: as if it did not exist
        return offer_view(offer, principal.user_id)

    # --- change -------------------------------------------------------------------------

    async def _owned_for_update(self, principal: Principal, offer_id: uuid.UUID) -> Offer:
        offer = await self._db.scalar(select(Offer).where(Offer.id == offer_id).with_for_update())
        if offer is None:
            await self._db.rollback()
            raise _not_found()
        if offer.user_id != principal.user_id:
            await self._db.rollback()
            raise _err(
                "AUTH_403_NOT_OWNER",
                "Only the owner can change this offer.",
                status.HTTP_403_FORBIDDEN,
            )
        return offer

    async def update_rate(
        self,
        principal: Principal,
        offer_id: uuid.UUID,
        desired_rate: str | None,
        source_amount: str | None = None,
    ) -> dict[str, Any]:
        """Edit my offer's rate and/or amount (ADR-029; ADR-059 Decision 3).

        Only while nobody has taken any of it. Every check a new offer gets runs again (amount,
        minimum, rate, official-rate ceiling); ownership and state are read under the row lock
        that taking an offer also uses, so an edit and a take can never both win.
        """
        if desired_rate is None and source_amount is None:
            raise _input_error(OfferInputError(FORMAT_ERROR, "Change the rate or the amount."))
        offer = await self._owned_for_update(principal, offer_id)
        try:
            rate = parse_rate(desired_rate) if desired_rate is not None else offer.desired_rate
            amount_minor = (
                parse_amount_minor(source_amount, offer.source_currency)
                if source_amount is not None
                else offer.source_amount_minor
            )
        except OfferInputError as e:
            await self._db.rollback()
            raise _input_error(e) from None
        if offer.matched_amount_minor != 0:
            await self._db.rollback()
            raise _err(
                "RES_409_OFFER_ALREADY_MATCHED",
                "Someone has started a deal on this offer, so it can’t be changed now. "
                "You can still withdraw what’s left.",
                status.HTTP_409_CONFLICT,
            )
        if offer.status != "open":
            await self._db.rollback()
            raise _err(
                "RES_409_OFFER_ALREADY_MATCHED",
                "This offer can no longer be edited.",
                status.HTTP_409_CONFLICT,
            )
        foreign = offer.target_currency if offer.source_currency == "NGN" else offer.source_currency
        problem = rate_problem(rate, foreign)
        if problem is not None:
            await self._db.rollback()
            raise _input_error(problem)
        changed = [
            name
            for name, differs in (
                ("rate", rate != offer.desired_rate),
                ("amount", amount_minor != offer.source_amount_minor),
            )
            if differs
        ]
        if changed:
            if "rate" in changed:
                offer.desired_rate = rate
                offer.rate_updated_at = self._clock()
            offer.source_amount_minor = amount_minor
            offer.version += 1
        view = offer_view(offer, principal.user_id)
        await self._db.commit()
        if changed:
            # Audit trail: who, which offer, what kind of change, and the new version.
            _logger.info(
                "offer_edited",
                extra={
                    "user_id": str(principal.user_id),
                    "offer_id": str(offer.id),
                    "changed": ",".join(changed),
                    "version": offer.version,
                },
            )
        return view

    async def withdraw(self, principal: Principal, offer_id: uuid.UUID) -> dict[str, Any]:
        """Close the remainder to matching. Never touches existing allocations (contract)."""
        offer = await self._owned_for_update(principal, offer_id)
        if offer.status == "withdrawn":
            view = offer_view(offer, principal.user_id)
            await self._db.rollback()
            return view  # already withdrawn: same answer
        if offer.status not in ACTIVE_STATUSES:
            await self._db.rollback()
            raise _err(
                "RES_409_OFFER_ALREADY_MATCHED",
                "Nothing is left to withdraw on this offer.",
                status.HTTP_409_CONFLICT,
            )
        offer.status = "withdrawn"
        offer.withdrawn_at = self._clock()
        offer.version += 1
        view = offer_view(offer, principal.user_id)
        await self._db.commit()
        return view
