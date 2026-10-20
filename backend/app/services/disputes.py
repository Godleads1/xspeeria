"""Disputes and support cases — ADR-057 (contract §3.8, data dictionary "Dispute", ADR-050).

Rules:
* A **dispute** is on a deal whose escrow has started (a ``Transaction`` exists). Only the two
  parties may open one (``AUTH_403_NOT_PARTY``); one unresolved dispute per deal
  (``RES_409_DISPUTE_ALREADY_OPEN``). Opening it adds a blocking ``DISPUTE`` hold, which pauses
  the escrow (no release, no automatic timeout) until staff resolve it. It never changes a
  phase, a leg or an amount, and never touches a completed settlement's money (ADR-001 §7.1).
* A **support case** has no deal and pauses nothing (owner, 2026-10-20).
* Each party sees the case, its status and only **their own** messages plus staff replies — never
  the other party's words or identity. The other party is notified that a dispute was opened.
* Messages are append-only; none can be added once the case is resolved.
* Resolution is staff-only (admin console, next milestone).

Someone else's case, or an id that does not exist, answers the same 404 (no probing).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.models.disputes import Dispute, DisputeMessage
from app.models.marketplace import Match, Offer
from app.models.settlement import Settlement, SettlementEvent, SettlementHold, Transaction
from app.services.auth import Principal
from app.services.notifications import notify

__all__ = ["DisputeService", "dispute_view"]

_logger = get_logger(__name__)


def _not_found() -> AppError:
    return AppError("RES_404_NOT_FOUND", "That case was not found.", status_code=404)


def _not_party() -> AppError:
    return AppError(
        "AUTH_403_NOT_PARTY",
        "You are not part of this deal.",
        status_code=status.HTTP_403_FORBIDDEN,
    )


def dispute_view(d: Dispute, messages: list[DisputeMessage], viewer: uuid.UUID) -> dict[str, Any]:
    mine = d.initiator_user_id == viewer
    return {
        "dispute_id": str(d.id),
        "kind": d.kind,
        "transaction_id": str(d.transaction_id) if d.transaction_id else None,
        "reason": d.reason,
        "status": d.status,
        "outcome": d.outcome,
        "opened_by_you": mine,
        # The description is the opener's own words: shown to them only.
        "description": d.description if mine else None,
        "created_at": d.created_at.isoformat(),
        "updated_at": d.updated_at.isoformat(),
        "resolved_at": d.resolved_at.isoformat() if d.resolved_at else None,
        "messages": [
            {
                "message_id": str(m.id),
                "author": "you" if m.author_role == "user" else "staff",
                "body": m.body,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
            if m.author_role == "staff" or m.author_user_id == viewer
        ],
    }


class DisputeService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    async def _parties(self, transaction_id: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
        """(match id, taker, offer owner) for a transaction, or 404."""
        row = (
            await self._db.execute(
                select(Match.id, Match.counterparty_user_id, Offer.user_id)
                .join(Transaction, Transaction.match_id == Match.id)
                .join(Offer, Offer.id == Match.offer_id)
                .where(Transaction.id == transaction_id)
            )
        ).one_or_none()
        if row is None:
            await self._db.rollback()
            raise _not_found()
        return row[0], row[1], row[2]

    async def open(
        self,
        principal: Principal,
        *,
        transaction_id: uuid.UUID | None,
        reason: str,
        description: str,
    ) -> dict[str, Any]:
        now = self._clock()
        kind = "dispute" if transaction_id is not None else "support"
        dispute = Dispute(
            id=uuid.uuid4(),
            kind=kind,
            transaction_id=transaction_id,
            initiator_user_id=principal.user_id,
            reason=reason,
            description=description,
            status="open",
            created_at=now,
            updated_at=now,
        )
        other: uuid.UUID | None = None
        match_id: uuid.UUID | None = None
        if transaction_id is not None:
            match_id, taker, owner = await self._parties(transaction_id)
            if principal.user_id not in (taker, owner):
                await self._db.rollback()
                raise _not_party()
            other = owner if principal.user_id == taker else taker
            settlement = await self._db.scalar(
                select(Settlement).where(Settlement.transaction_id == transaction_id)
            )
            if settlement is not None:
                hold = SettlementHold(
                    id=uuid.uuid4(),
                    settlement_id=settlement.id,
                    type="DISPUTE",
                    blocks_progression=True,
                    reason="dispute opened",
                    opened_by=principal.user_id,
                    opened_at=now,
                )
                self._db.add(hold)
                self._db.add(
                    SettlementEvent(
                        id=uuid.uuid4(),
                        settlement_id=settlement.id,
                        leg_id=None,
                        event_type="HoldOpened",
                        payload={"type": "DISPUTE", "reason": "dispute opened"},
                        created_at=now,
                    )
                )
                await self._db.flush()
                dispute.hold_id = hold.id
        self._db.add(dispute)
        try:
            await self._db.flush()
        except IntegrityError as exc:
            await self._db.rollback()
            if "uq_disputes_one_open_per_transaction" not in str(exc.orig):
                raise
            raise AppError(
                "RES_409_DISPUTE_ALREADY_OPEN",
                "There is already an open dispute on this deal.",
                status_code=status.HTTP_409_CONFLICT,
            ) from None
        if other is not None and match_id is not None:
            await notify(
                self._db,
                user_id=other,
                event="dispute.opened",
                dedupe_key=f"dispute:{dispute.id}:opened",
                now=now,
                dispute_id=str(dispute.id),
                match_id=str(match_id),
            )
        await self._db.commit()
        _logger.info(
            "dispute_opened",
            extra={"dispute_id": str(dispute.id), "kind": kind, "user_id": str(principal.user_id)},
        )
        return dispute_view(dispute, [], principal.user_id)

    async def _visible(self, principal: Principal, dispute_id: uuid.UUID, *, lock: bool) -> Dispute:
        stmt = select(Dispute).where(Dispute.id == dispute_id)
        if lock:
            stmt = stmt.with_for_update()
        d = await self._db.scalar(stmt)
        if d is None:
            await self._db.rollback()
            raise _not_found()
        if d.initiator_user_id == principal.user_id:
            return d
        if d.kind == "dispute" and d.transaction_id is not None:
            _, taker, owner = await self._parties(d.transaction_id)
            if principal.user_id in (taker, owner):
                return d
        await self._db.rollback()
        raise _not_found()

    async def _messages(self, dispute_id: uuid.UUID) -> list[DisputeMessage]:
        rows = await self._db.scalars(
            select(DisputeMessage)
            .where(DisputeMessage.dispute_id == dispute_id)
            .order_by(DisputeMessage.created_at, DisputeMessage.id)
        )
        return list(rows.all())

    async def get(self, principal: Principal, dispute_id: uuid.UUID) -> dict[str, Any]:
        d = await self._visible(principal, dispute_id, lock=False)
        view = dispute_view(d, await self._messages(d.id), principal.user_id)
        await self._db.rollback()
        return view

    async def mine(self, principal: Principal) -> list[dict[str, Any]]:
        """Cases I opened, and disputes on my deals opened by the other side. Newest first."""
        my_transactions = (
            select(Transaction.id)
            .join(Match, Match.id == Transaction.match_id)
            .join(Offer, Offer.id == Match.offer_id)
            .where(
                or_(
                    Match.counterparty_user_id == principal.user_id,
                    Offer.user_id == principal.user_id,
                )
            )
        )
        rows = (
            await self._db.scalars(
                select(Dispute)
                .where(
                    or_(
                        Dispute.initiator_user_id == principal.user_id,
                        Dispute.transaction_id.in_(my_transactions),
                    )
                )
                .order_by(Dispute.created_at.desc())
                .limit(100)
            )
        ).all()
        views = [dispute_view(d, [], principal.user_id) for d in rows]
        await self._db.rollback()
        return views

    async def add_message(
        self, principal: Principal, dispute_id: uuid.UUID, body: str
    ) -> dict[str, Any]:
        d = await self._visible(principal, dispute_id, lock=True)
        if d.status == "resolved":
            await self._db.rollback()
            raise AppError(
                "RES_409_DISPUTE_RESOLVED",
                "This case is closed. Open a new one if you still need help.",
                status_code=status.HTTP_409_CONFLICT,
            )
        now = self._clock()
        self._db.add(
            DisputeMessage(
                id=uuid.uuid4(),
                dispute_id=d.id,
                author_role="user",
                author_user_id=principal.user_id,
                body=body,
                created_at=now,
            )
        )
        d.updated_at = now
        await self._db.flush()
        view = dispute_view(d, await self._messages(d.id), principal.user_id)
        await self._db.commit()
        return view
