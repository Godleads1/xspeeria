"""Offer acceptance and Matches — Milestone 4.1D (ADR-031).

A Match records that one user agreed to take part (or all) of another user's Offer at the
Offer's rate. It is information, not money: no funds move here. Escrow, payout accounts and
settlement come with later milestones.

Acceptance follows Standing Standards §7.1 inside **one** database transaction:

1. lock the Offer row (the serialization key is ``offer_id``);
2–3. look up the ``Idempotency-Key``: same request → the first answer, without re-checking
     capacity; different request → ``SYS_409_IDEMPOTENCY_KEY_REUSED``;
4–5. new requests only: spend the authenticator approval (ADR-026 ``trade.accept``), check the
     Offer is still listed (status and today's rate ceiling), read what is left, check the
     amount (more than zero; the minimum unless taking exactly what is left — ADR-031);
6–12. record the idempotency answer, set ``accepted_at`` (server time) and
     ``server_order_key`` (database identity), create the Match, update the Offer, commit.

The amount is never clamped or resized: too much is ``RES_409_INSUFFICIENT_REMAINING``.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.offer_rules import (
    IDEMPOTENCY_TTL,
    MINIMUM_MINOR,
    OFFICIAL_RATE,
    OfferInputError,
    below_minimum,
    parse_amount_minor,
)
from app.models.marketplace import ACTIVE_STATUSES, IdempotencyRecord, Match, Offer
from app.services.auth import Principal
from app.services.offers import Created, money_text, rate_text, replay_idempotent

__all__ = ["ACCEPT_OPERATION", "MatchService", "match_view"]

_logger = get_logger(__name__)
ACCEPT_OPERATION = "offer.accept"


def _err(code: str, message: str, http: int) -> AppError:
    return AppError(code, message, status_code=http)


def _foreign(offer: Offer) -> str:
    return offer.target_currency if offer.source_currency == "NGN" else offer.source_currency


def match_view(match: Match, offer: Offer, viewer: uuid.UUID) -> dict[str, Any]:
    """The Match as either party sees it. Neither party's identity is shown."""
    return {
        "match_id": str(match.id),
        "offer_id": str(match.offer_id),
        "currency": match.currency,
        "counter_currency": offer.target_currency,
        "allocated_amount": money_text(match.allocated_amount_minor, match.scale),
        "agreed_rate": rate_text(match.agreed_rate),
        "accepted_at": match.accepted_at.isoformat(),
        "server_order_key": str(match.server_order_key),
        "your_role": "taker" if match.counterparty_user_id == viewer else "offer_owner",
    }


def _normalised_amount(text: str) -> str:
    """For the request fingerprint only: "500" and "500.00" are the same request."""
    try:
        value = Decimal(text)
    except InvalidOperation:
        return text
    return format(value.normalize(), "f") if value.is_finite() else text


class MatchService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    async def accept(
        self,
        principal: Principal,
        offer_id: uuid.UUID,
        idempotency_key: uuid.UUID,
        accepted_amount: str | None,
        confirm_step_up: Callable[[], Awaitable[None]],
    ) -> Created:
        if accepted_amount is None:
            raise _err(
                "VAL_422_MISSING_FIELD",
                "Enter how much you want to take.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        now = self._clock()

        # 1. Serialize on the Offer's capacity row.
        offer = await self._db.scalar(select(Offer).where(Offer.id == offer_id).with_for_update())
        if offer is None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That offer was not found.", status.HTTP_404_NOT_FOUND)
        # Read now: a rollback below expires the loaded row.
        currency, scale = offer.source_currency, offer.scale
        if offer.user_id == principal.user_id:
            await self._db.rollback()
            raise _err(
                "AUTH_403_SELF_MATCH_FORBIDDEN",
                "You can’t take your own offer.",
                status.HTTP_403_FORBIDDEN,
            )

        # 2–3. Same key: replay or refuse — before any capacity check.
        request_hash = hashlib.sha256(
            json.dumps(
                {
                    "op": ACCEPT_OPERATION,
                    "offer_id": str(offer_id),
                    "amount": _normalised_amount(accepted_amount),
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        replay = await replay_idempotent(
            self._db, principal.user_id, ACCEPT_OPERATION, idempotency_key, request_hash, now
        )
        if replay is not None:
            return replay

        # New request: one authenticator approval per acceptance (ADR-026 `trade.accept`).
        await confirm_step_up()

        # 4. Still listed? Lifecycle status and today's official-rate ceiling (contract §3.5).
        ceiling = OFFICIAL_RATE.get(_foreign(offer))
        if offer.status not in ACTIVE_STATUSES or ceiling is None or offer.desired_rate > ceiling:
            await self._db.rollback()
            raise _err(
                "RES_409_OFFER_UNAVAILABLE",
                "This offer is no longer available.",
                status.HTTP_409_CONFLICT,
            )

        # 5. The amount, against what is left right now.
        try:
            amount = parse_amount_minor(accepted_amount, currency, minimum=False)
        except OfferInputError as e:
            await self._db.rollback()
            raise _err(e.code, e.message, status.HTTP_422_UNPROCESSABLE_CONTENT) from None
        remaining = offer.source_amount_minor - offer.matched_amount_minor
        if amount > remaining:
            await self._db.rollback()
            raise _err(
                "RES_409_INSUFFICIENT_REMAINING",
                f"Only {money_text(remaining, scale)} {currency} is left on this offer.",
                status.HTTP_409_CONFLICT,
            )
        if amount < MINIMUM_MINOR[currency] and amount != remaining:
            await self._db.rollback()
            small = below_minimum(currency)
            raise _err(small.code, small.message, status.HTTP_422_UNPROCESSABLE_CONTENT)

        # 7–10. Server time, server order key, the Match, the Offer's capacity.
        match = Match(
            id=uuid.uuid4(),
            offer_id=offer.id,
            counterparty_user_id=principal.user_id,
            allocated_amount_minor=amount,
            currency=offer.source_currency,
            scale=offer.scale,
            currency_def_version=offer.currency_def_version,
            agreed_rate=offer.desired_rate,
            accepted_at=now,
        )
        self._db.add(match)
        offer.matched_amount_minor += amount
        offer.status = (
            "fully_matched"
            if offer.matched_amount_minor == offer.source_amount_minor
            else "partially_matched"
        )
        offer.version += 1
        await self._db.flush()
        await self._db.refresh(match, ["server_order_key"])

        # 6 + 11. The remembered answer, committed with everything else.
        body = match_view(match, offer, principal.user_id)
        self._db.add(
            IdempotencyRecord(
                id=uuid.uuid4(),
                user_id=principal.user_id,
                operation=ACCEPT_OPERATION,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response_status=status.HTTP_201_CREATED,
                response_body=body,
                created_at=now,
                expires_at=now + IDEMPOTENCY_TTL,
            )
        )
        try:
            await self._db.commit()  # 12.
        except IntegrityError as exc:
            # The same key was used at the same moment on another offer and that one won.
            await self._db.rollback()
            if "uq_idempotency_records_user_operation_key" not in str(exc.orig):
                raise
            replay = await replay_idempotent(
                self._db, principal.user_id, ACCEPT_OPERATION, idempotency_key, request_hash, now
            )
            if replay is None:  # pragma: no cover - the winner's row must exist
                raise
            return replay
        _logger.info(
            "offer_accepted",
            extra={
                "user_id": str(principal.user_id),
                "offer_id": str(offer.id),
                "match_id": body["match_id"],
            },
        )
        return Created(status.HTTP_201_CREATED, body)

    async def get(self, principal: Principal, match_id: uuid.UUID) -> dict[str, Any]:
        row = (
            await self._db.execute(
                select(Match, Offer)
                .join(Offer, Offer.id == Match.offer_id)
                .where(Match.id == match_id)
            )
        ).first()
        if row is None:
            raise _err(
                "RES_404_MATCH_NOT_FOUND", "That match was not found.", status.HTTP_404_NOT_FOUND
            )
        match, offer = row
        if principal.user_id not in (match.counterparty_user_id, offer.user_id):
            raise _err(
                "AUTH_403_FORBIDDEN",
                "You are not part of this match.",
                status.HTTP_403_FORBIDDEN,
            )
        return match_view(match, offer, principal.user_id)

    async def mine(self, principal: Principal) -> list[dict[str, Any]]:
        """Matches where I took an offer or someone took mine, newest first."""
        rows = (
            await self._db.execute(
                select(Match, Offer)
                .join(Offer, Offer.id == Match.offer_id)
                .where(
                    or_(
                        Match.counterparty_user_id == principal.user_id,
                        Offer.user_id == principal.user_id,
                    )
                )
                .order_by(Match.accepted_at.desc(), Match.server_order_key.desc())
                .limit(200)
            )
        ).all()
        return [match_view(m, o, principal.user_id) for m, o in rows]
