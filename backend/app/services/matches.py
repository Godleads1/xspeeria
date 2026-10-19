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

Preparation (Milestone 4.1E, ADR-035): each new Match waits **30 minutes** for both parties to
choose their payout account(s). When both have, it is ``funding_ready`` (escrow comes next,
with the partner bank). Otherwise it **expires**: the cause is recorded and the amount returns
to the Offer (ADR-001 §14.5). Expiry runs under the same Offer-then-Match lock order as
acceptance, before any capacity read, and from a periodic sweep.
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
from sqlalchemy import delete, or_, select
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
from app.domain.payout_rules import (
    MAX_PAYOUT_ACCOUNTS_PER_DEAL,
    PREPARATION_WINDOW,
    counter_amount_minor,
)
from app.models.marketplace import ACTIVE_STATUSES, IdempotencyRecord, Match, Offer
from app.models.payouts import Beneficiary, MatchPayoutSelection
from app.models.settlement import Settlement, Transaction
from app.providers.pretend_bank import PretendBank
from app.services.auth import Principal
from app.services.notifications import notify
from app.services.offers import Created, money_text, rate_text, replay_idempotent
from app.services.settlement import SettlementService

__all__ = ["ACCEPT_OPERATION", "EXPIRY_CAUSE", "MatchService", "PayoutChoice", "match_view"]

_logger = get_logger(__name__)
ACCEPT_OPERATION = "offer.accept"
#: Recorded on a Match whose payout accounts were not chosen in time (ADR-001 §14.5).
EXPIRY_CAUSE = "payout_accounts_not_chosen_in_time"
AWAITING = "awaiting_payout_accounts"


def _err(code: str, message: str, http: int) -> AppError:
    return AppError(code, message, status_code=http)


def _foreign(offer: Offer) -> str:
    return offer.target_currency if offer.source_currency == "NGN" else offer.source_currency


def receive_side(match: Match, offer: Offer, viewer: uuid.UUID) -> tuple[str, int]:
    """What ``viewer`` receives from this deal: (currency, minor units).

    The taker receives the allocated amount in the offer's currency; the offer's owner
    receives the counter amount (allocated × rate, or ÷ rate for naira), half to even.
    """
    if match.counterparty_user_id == viewer:
        return match.currency, match.allocated_amount_minor
    return offer.target_currency, counter_amount_minor(
        match.allocated_amount_minor, match.currency, match.agreed_rate
    )


def match_view(
    match: Match,
    offer: Offer,
    viewer: uuid.UUID,
    chosen_by: frozenset[uuid.UUID] = frozenset(),
) -> dict[str, Any]:
    """The Match as either party sees it. Neither party's identity is shown."""
    receive_currency, receive_minor = receive_side(match, offer, viewer)
    other = offer.user_id if match.counterparty_user_id == viewer else match.counterparty_user_id
    return {
        "match_id": str(match.id),
        "offer_id": str(match.offer_id),
        "currency": match.currency,
        "counter_currency": offer.target_currency,
        "allocated_amount": money_text(match.allocated_amount_minor, match.scale),
        # ADR-045: the other currency's amount, so a deal can be shown without recomputing.
        "counter_amount": money_text(
            counter_amount_minor(match.allocated_amount_minor, match.currency, match.agreed_rate),
            match.scale,
        ),
        "agreed_rate": rate_text(match.agreed_rate),
        "accepted_at": match.accepted_at.isoformat(),
        "server_order_key": str(match.server_order_key),
        "your_role": "taker" if match.counterparty_user_id == viewer else "offer_owner",
        "you_receive_currency": receive_currency,
        "you_receive_amount": money_text(receive_minor, match.scale),
        "preparation_state": match.preparation_state,
        "preparation_deadline": (
            match.preparation_deadline.isoformat() if match.preparation_deadline else None
        ),
        "you_chose_payout_accounts": viewer in chosen_by,
        "other_side_chose_payout_accounts": other in chosen_by,
    }


async def _phases(db: AsyncSession, match_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not match_ids:
        return {}
    rows = (
        await db.execute(
            select(Transaction.match_id, Settlement.phase)
            .join(Settlement, Settlement.transaction_id == Transaction.id)
            .where(Transaction.match_id.in_(match_ids))
        )
    ).all()
    return {mid: phase for mid, phase in rows}


async def _chosen_by(
    db: AsyncSession, match_ids: list[uuid.UUID]
) -> dict[uuid.UUID, frozenset[uuid.UUID]]:
    if not match_ids:
        return {}
    rows = (
        await db.execute(
            select(MatchPayoutSelection.match_id, MatchPayoutSelection.user_id)
            .where(MatchPayoutSelection.match_id.in_(match_ids))
            .distinct()
        )
    ).all()
    out: dict[uuid.UUID, set[uuid.UUID]] = {}
    for mid, uid in rows:
        out.setdefault(mid, set()).add(uid)
    return {k: frozenset(v) for k, v in out.items()}


class PayoutChoice:
    """One line of a payout choice as the client sent it (untrusted)."""

    def __init__(self, beneficiary_id: uuid.UUID, amount: str) -> None:
        self.beneficiary_id = beneficiary_id
        self.amount = amount


def _release(offer: Offer, match: Match, now: datetime) -> None:
    """Expire one awaiting Match and return its amount to the Offer (both rows locked)."""
    match.preparation_state = "expired"
    match.preparation_ended_at = now
    match.termination_cause = EXPIRY_CAUSE
    offer.matched_amount_minor -= match.allocated_amount_minor
    if offer.status in ("partially_matched", "fully_matched"):
        offer.status = "open" if offer.matched_amount_minor == 0 else "partially_matched"
    offer.version += 1


def _normalised_amount(text: str) -> str:
    """For the request fingerprint only: "500" and "500.00" are the same request."""
    try:
        value = Decimal(text)
    except InvalidOperation:
        return text
    return format(value.normalize(), "f") if value.is_finite() else text


class MatchService:
    def __init__(
        self,
        db: AsyncSession,
        clock: Callable[[], datetime],
        bank: PretendBank | None = None,
    ) -> None:
        self._db = db
        self._clock = clock
        self._bank = bank

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

        # Deals on this offer whose 30 minutes ran out give their amount back first.
        await self._expire_on_locked_offer(offer, now)

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
            preparation_state=AWAITING,
            preparation_deadline=now + PREPARATION_WINDOW,
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
        # ADR-044: the offer's owner hears that someone took it (same transaction).
        await notify(
            self._db,
            user_id=offer.user_id,
            event="match.created",
            dedupe_key=f"match:{match.id}:created",
            now=now,
            match_id=str(match.id),
            offer_id=str(offer.id),
        )

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

    # --- reading -----------------------------------------------------------------------

    async def get(self, principal: Principal, match_id: uuid.UUID) -> dict[str, Any]:
        await self.expire_due(limit=50)
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
        chosen = await _chosen_by(self._db, [match.id])
        return match_view(match, offer, principal.user_id, chosen.get(match.id, frozenset()))

    async def mine(self, principal: Principal) -> list[dict[str, Any]]:
        """Matches where I took an offer or someone took mine, newest first."""
        await self.expire_due(limit=50)
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
        ids = [m.id for m, _ in rows]
        chosen = await _chosen_by(self._db, ids)
        phases = await _phases(self._db, ids)
        return [
            {
                **match_view(m, o, principal.user_id, chosen.get(m.id, frozenset())),
                # ADR-045: where the escrow is (None before it opens), for History.
                "settlement_phase": phases.get(m.id),
            }
            for m, o in rows
        ]

    # --- preparation (ADR-035) -----------------------------------------------------------

    async def _expire_on_locked_offer(self, offer: Offer, now: datetime) -> None:
        """Inside a transaction that already holds the Offer lock."""
        due = (
            await self._db.scalars(
                select(Match)
                .where(
                    Match.offer_id == offer.id,
                    Match.preparation_state == AWAITING,
                    Match.preparation_deadline <= now,
                )
                .with_for_update()
            )
        ).all()
        for match in due:
            _release(offer, match, now)
        if due:
            await self._db.flush()

    async def expire_due(self, *, limit: int = 200) -> int:
        """Expire awaiting Matches past their deadline, one transaction per Match.

        Lock order is Offer, then Match — the same as acceptance — so they never deadlock.
        Safe to run from several servers at once: each Match is re-checked under its lock.
        """
        now = self._clock()
        ids = (
            await self._db.execute(
                select(Match.id, Match.offer_id)
                .where(Match.preparation_state == AWAITING, Match.preparation_deadline <= now)
                .order_by(Match.preparation_deadline)
                .limit(limit)
            )
        ).all()
        await self._db.rollback()
        done = 0
        for match_id, offer_id in ids:
            offer = await self._db.scalar(
                select(Offer).where(Offer.id == offer_id).with_for_update()
            )
            match = await self._db.scalar(
                select(Match).where(Match.id == match_id).with_for_update()
            )
            if (
                offer is not None
                and match is not None
                and match.preparation_state == AWAITING
                and match.preparation_deadline is not None
                and match.preparation_deadline <= now
            ):
                _release(offer, match, now)
                await self._db.commit()
                done += 1
                _logger.info("match_expired", extra={"match_id": str(match_id)})
            else:
                await self._db.rollback()
        return done

    async def choose_payout_accounts(
        self,
        principal: Principal,
        match_id: uuid.UUID,
        choices: list[PayoutChoice],
        confirm_step_up: Callable[[], Awaitable[None]],
    ) -> dict[str, Any]:
        """Replace my payout choice for one deal (ADR-021 §3, ADR-035).

        My own, bank-confirmed accounts in the currency I receive; amounts add up exactly to
        what I receive. When both sides have chosen, the deal is ``funding_ready``.
        """
        now = self._clock()
        offer_id = await self._db.scalar(select(Match.offer_id).where(Match.id == match_id))
        if offer_id is None:
            await self._db.rollback()
            raise _err(
                "RES_404_MATCH_NOT_FOUND", "That match was not found.", status.HTTP_404_NOT_FOUND
            )
        offer = await self._db.scalar(select(Offer).where(Offer.id == offer_id).with_for_update())
        match = await self._db.scalar(select(Match).where(Match.id == match_id).with_for_update())
        if offer is None or match is None:  # pragma: no cover - FK and the row just read
            await self._db.rollback()
            raise _err(
                "RES_404_MATCH_NOT_FOUND", "That match was not found.", status.HTTP_404_NOT_FOUND
            )
        if principal.user_id not in (match.counterparty_user_id, offer.user_id):
            await self._db.rollback()
            raise _err(
                "AUTH_403_FORBIDDEN", "You are not part of this match.", status.HTTP_403_FORBIDDEN
            )
        if (
            match.preparation_state == AWAITING
            and match.preparation_deadline is not None
            and match.preparation_deadline <= now
        ):
            _release(offer, match, now)
            await self._db.commit()
            raise _err(
                "RES_409_INVALID_SETTLEMENT_STATE",
                "The 30 minutes to choose payout accounts have passed, so this deal was cancelled.",
                status.HTTP_409_CONFLICT,
            )
        if match.preparation_state != AWAITING:
            await self._db.rollback()
            raise _err(
                "RES_409_INVALID_SETTLEMENT_STATE",
                "Payout accounts can no longer be changed for this deal.",
                status.HTTP_409_CONFLICT,
            )

        currency, due_minor = receive_side(match, offer, principal.user_id)
        scale = match.scale
        if not 1 <= len(choices) <= MAX_PAYOUT_ACCOUNTS_PER_DEAL:
            await self._db.rollback()
            raise _err(
                "VALIDATION_ERROR",
                f"Choose between 1 and {MAX_PAYOUT_ACCOUNTS_PER_DEAL} payout accounts.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        if len({c.beneficiary_id for c in choices}) != len(choices):
            await self._db.rollback()
            raise _err(
                "VALIDATION_ERROR",
                "Each account can be chosen once.",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        amounts: list[int] = []
        for c in choices:
            try:
                amounts.append(parse_amount_minor(c.amount, currency, minimum=False))
            except OfferInputError as e:
                await self._db.rollback()
                raise _err(e.code, e.message, status.HTTP_422_UNPROCESSABLE_CONTENT) from None
        total = sum(amounts)
        if total != due_minor:
            await self._db.rollback()
            raise _err(
                "VALIDATION_ERROR",
                f"The amounts must add up to exactly {money_text(due_minor, scale)} {currency} "
                f"(they add up to {money_text(total, scale)}).",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        accounts = {
            b.id: b
            for b in (
                await self._db.scalars(
                    select(Beneficiary).where(
                        Beneficiary.id.in_([c.beneficiary_id for c in choices]),
                        Beneficiary.user_id == principal.user_id,
                        Beneficiary.removed_at.is_(None),
                    )
                )
            ).all()
        }
        for c in choices:
            account = accounts.get(c.beneficiary_id)
            if account is None:
                await self._db.rollback()
                raise _err(
                    "RES_404_NOT_FOUND",
                    "That payout account was not found.",
                    status.HTTP_404_NOT_FOUND,
                )
            if account.currency != currency:
                other_currency = account.currency  # read before the rollback expires it
                await self._db.rollback()
                raise _err(
                    "VALIDATION_ERROR",
                    f"You receive {currency} from this deal; that account is in {other_currency}.",
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                )
            if account.validation_state != "validated":
                await self._db.rollback()
                raise _err(
                    "VALIDATION_ERROR",
                    "That account has not been confirmed by the bank yet.",
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                )

        await confirm_step_up()  # ADR-008: confirming where a payout goes needs a fresh code

        await self._db.execute(
            delete(MatchPayoutSelection).where(
                MatchPayoutSelection.match_id == match.id,
                MatchPayoutSelection.user_id == principal.user_id,
            )
        )
        for c, amount in zip(choices, amounts, strict=True):
            self._db.add(
                MatchPayoutSelection(
                    id=uuid.uuid4(),
                    match_id=match.id,
                    user_id=principal.user_id,
                    beneficiary_id=c.beneficiary_id,
                    amount_minor=amount,
                    currency=currency,
                    scale=scale,
                    currency_def_version=match.currency_def_version,
                    created_at=now,
                )
            )
        await self._db.flush()
        chosen = (await _chosen_by(self._db, [match.id])).get(match.id, frozenset())
        if {match.counterparty_user_id, offer.user_id} <= chosen:
            match.preparation_state = "funding_ready"
            match.preparation_ended_at = now
            # ADR-037: open the escrow steps in the same transaction (simulation only).
            await SettlementService(self._db, self._clock, self._bank).create_for_match(
                match, offer
            )
        view = match_view(match, offer, principal.user_id, chosen)
        await self._db.commit()
        _logger.info(
            "payout_accounts_chosen",
            extra={
                "match_id": str(match.id),
                "user_id": str(principal.user_id),
                "accounts": len(choices),
            },
        )
        return view
