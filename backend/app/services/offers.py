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
from datetime import datetime
from decimal import Decimal
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
    IDEMPOTENCY_TTL,
    OFFICIAL_RATE,
    SCALE,
    OfferInputError,
    parse_amount_minor,
    parse_pair,
    parse_rate,
    rate_problem,
)
from app.models.marketplace import ACTIVE_STATUSES, IdempotencyRecord, Offer
from app.services.auth import Principal

__all__ = ["Created", "OfferService", "offer_view", "replay_idempotent"]

_logger = get_logger(__name__)
CREATE_OPERATION = "offer.create"


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
        self, principal: Principal, source: str, target: str, limit: int, offset: int
    ) -> list[dict[str, Any]]:
        """Listed offers for one pair: active and within today's official rate, best first."""
        try:
            pair = parse_pair(source, target)
        except OfferInputError as e:
            raise _input_error(e) from None
        ceiling = OFFICIAL_RATE[pair.foreign]
        # Best for the taker: buying foreign currency → lowest NGN rate; buying naira → highest.
        best = Offer.desired_rate.asc() if pair.source != "NGN" else Offer.desired_rate.desc()
        rows = (
            await self._db.scalars(
                select(Offer)
                .where(
                    and_(
                        Offer.source_currency == pair.source,
                        Offer.target_currency == pair.target,
                        Offer.status.in_(ACTIVE_STATUSES),
                        Offer.desired_rate <= ceiling,
                    )
                )
                .order_by(best, Offer.created_at.asc(), Offer.id.asc())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        return [offer_view(o, principal.user_id) for o in rows]

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
        desired_rate: str,
    ) -> dict[str, Any]:
        try:
            rate = parse_rate(desired_rate)
        except OfferInputError as e:
            raise _input_error(e) from None
        offer = await self._owned_for_update(principal, offer_id)
        if offer.status != "open" or offer.matched_amount_minor != 0:
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
        offer.desired_rate = rate
        offer.version += 1
        offer.rate_updated_at = self._clock()
        view = offer_view(offer, principal.user_id)
        await self._db.commit()
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
