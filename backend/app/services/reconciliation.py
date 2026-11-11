"""Daily reconciliation: each finished deal's money in matches its money out — ADR-110.

Owner, 2026-11-10: "Daily reconciliation: check that each deal's money in matches its money
out." Xspeeria never holds money: each side pays into a partner bank's escrow, which pays out
or returns it. This job checks Xspeeria's own record of what each escrow confirmed, deal by
deal, once the deal is finished:

* **Completed:** each escrow received the amount plus the 1% fee, paid out exactly the amount
  (the payout accounts chosen add up to it too), and returned nothing. What stays is the fee.
* **Cancelled or unwound:** an escrow that received money returned all of it, amount and fee,
  and paid out nothing; an escrow that received nothing paid nothing.

"Received", "paid out" and "returned" are the amounts in the partner's signed confirmations
(``EscrowFunded``, ``PayoutConfirmed``, ``EscrowReturned`` events), in the escrow's currency.
Every difference becomes a **reconciliation exception** for staff (never fixed automatically;
L-22) and a P1 operations alert. The check is read-only otherwise and safe to run again: an
exception still open for the same deal, escrow and finding is not opened twice.

Deals that staff closed through recovery (``CLOSED_RECOVERED``, ``CLOSED_WITH_LOSS``) are
already a person's decision with its own records (ADR-065) and are not re-judged here.
Comparing these records with the partner bank's own statement needs the partner's statement
format: ``UNKNOWN — NOT VERIFIED`` until a partner bank is chosen.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.settlement import (
    PayoutExecution,
    ReconciliationException,
    Settlement,
    SettlementEvent,
    SettlementLeg,
)

__all__ = ["CHECKED_PHASES", "DAILY_LOOKBACK", "Finding", "ReconciliationService", "leg_findings"]

_logger = get_logger(__name__)

#: Finished deals whose money is checked.
CHECKED_PHASES = ("COMPLETED", "CLOSED_UNWOUND", "CANCELLED")
#: The daily run looks at deals that changed in the last two days (a missed run is covered).
DAILY_LOOKBACK = timedelta(days=2)
#: Partner confirmations that move money, by what they mean.
_MONEY_EVENTS = {"EscrowFunded": "in", "PayoutConfirmed": "out", "EscrowReturned": "back"}
_PREFIX = "Daily check: "


@dataclass(frozen=True)
class Finding:
    """One difference on one escrow."""

    type: str  # AMOUNT_MISMATCH or STATE_MISMATCH (the exception types)
    detail: str
    expected_minor: int | None = None
    observed_minor: int | None = None


@dataclass
class _Totals:
    received: int = 0
    paid_out: int = 0
    returned: int = 0
    wrong_currency: bool = False


def leg_findings(
    phase: str, leg: SettlementLeg, totals: _Totals, chosen_minor: int
) -> list[Finding]:
    """What is wrong with one escrow of a finished deal (empty: it reconciles)."""
    due = leg.amount_minor + leg.fee_minor
    out: list[Finding] = []

    def amount(what: str, expected: int, observed: int) -> None:
        if expected != observed:
            out.append(
                Finding(
                    "AMOUNT_MISMATCH",
                    f"{what}: expected {expected}, recorded {observed} (minor units)",
                    expected,
                    observed,
                )
            )

    if totals.wrong_currency:
        out.append(Finding("AMOUNT_MISMATCH", f"a confirmation is not in {leg.currency}"))
    if phase == "COMPLETED":
        if leg.state != "PAID_OUT":
            out.append(Finding("STATE_MISMATCH", f"deal completed but escrow is {leg.state}"))
        amount("received", due, totals.received)
        amount("paid out", leg.amount_minor, totals.paid_out)
        amount("returned", 0, totals.returned)
        amount("payout accounts chosen", leg.amount_minor, chosen_minor)
    else:  # cancelled or unwound: everything received goes back
        if totals.received:
            if leg.state != "RETURNED":
                out.append(
                    Finding("STATE_MISMATCH", f"deal ended, money received, escrow is {leg.state}")
                )
            amount("returned", totals.received, totals.returned)
            amount("received", due, totals.received)
        else:
            amount("returned", 0, totals.returned)
            if leg.state in ("FUNDED", "RELEASE_SENT", "PAID_OUT", "RETURN_SENT", "RETURNED"):
                out.append(
                    Finding(
                        "STATE_MISMATCH",
                        f"escrow is {leg.state} but no money in is recorded",
                    )
                )
        amount("paid out", 0, totals.paid_out)
    return out


class ReconciliationService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db, self._clock = db, clock

    async def run(self, since: datetime | None = None) -> tuple[int, int]:
        """Check finished deals (changed since ``since``; all when None).

        Returns ``(deals checked, exceptions opened)``.
        """
        q = select(Settlement.id, Settlement.phase).where(Settlement.phase.in_(CHECKED_PHASES))
        if since is not None:
            q = q.where(Settlement.updated_at >= since)
        deals = (await self._db.execute(q.order_by(Settlement.updated_at))).all()
        opened = 0
        for settlement_id, phase in deals:
            opened += await self._check(settlement_id, phase)
        await self._db.commit()
        if opened:
            _logger.error(
                "reconciliation_mismatch", extra={"opened": opened, "checked": len(deals)}
            )
        return len(deals), opened

    async def daily(self) -> tuple[int, int]:
        return await self.run(self._clock() - DAILY_LOOKBACK)

    async def _check(self, settlement_id: uuid.UUID, phase: str) -> int:
        legs = (
            await self._db.scalars(
                select(SettlementLeg).where(SettlementLeg.settlement_id == settlement_id)
            )
        ).all()
        totals: dict[uuid.UUID, _Totals] = defaultdict(_Totals)
        events = await self._db.execute(
            select(
                SettlementEvent.leg_id, SettlementEvent.event_type, SettlementEvent.payload
            ).where(
                SettlementEvent.settlement_id == settlement_id,
                SettlementEvent.event_type.in_(tuple(_MONEY_EVENTS)),
            )
        )
        currency = {leg.leg_id: leg.currency for leg in legs}
        for leg_id, event_type, payload in events.all():
            if leg_id is None or not isinstance(payload, dict) or "amount_minor" not in payload:
                continue  # a dispatch record ("we asked the bank"), not a confirmation
            t = totals[leg_id]
            value = payload.get("amount_minor")
            if not isinstance(value, int) or isinstance(value, bool):
                t.wrong_currency = True  # unreadable amount: a person must look
                continue
            if payload.get("currency") != currency.get(leg_id):
                t.wrong_currency = True
            kind = _MONEY_EVENTS[event_type]
            if kind == "in":
                t.received += value
            elif kind == "out":
                t.paid_out += value
            else:
                t.returned += value
        total = func.coalesce(func.sum(PayoutExecution.amount_minor), 0)
        rows = await self._db.execute(
            select(PayoutExecution.leg_id, total)
            .where(PayoutExecution.leg_id.in_([leg.leg_id for leg in legs]))
            .group_by(PayoutExecution.leg_id)
        )
        chosen: dict[uuid.UUID, int] = {leg_id: int(v) for leg_id, v in rows.all()}
        opened = 0
        for leg in legs:
            for f in leg_findings(phase, leg, totals[leg.leg_id], int(chosen.get(leg.leg_id, 0))):
                opened += await self._open(settlement_id, leg, f)
        return opened

    async def _open(self, settlement_id: uuid.UUID, leg: SettlementLeg, f: Finding) -> int:
        detail = (_PREFIX + f.detail)[:300]
        already = await self._db.scalar(
            select(ReconciliationException.id).where(
                ReconciliationException.settlement_id == settlement_id,
                ReconciliationException.leg_id == leg.leg_id,
                ReconciliationException.detail == detail,
                ReconciliationException.status != "RESOLVED",
            )
        )
        if already is not None:
            return 0
        amounts = f.expected_minor is not None
        self._db.add(
            ReconciliationException(
                id=uuid.uuid4(),
                settlement_id=settlement_id,
                leg_id=leg.leg_id,
                receipt_id=None,
                type=f.type,
                expected_amount_minor=f.expected_minor,
                observed_amount_minor=f.observed_minor,
                currency=leg.currency if amounts else None,
                scale=leg.scale if amounts else None,
                currency_def_version=leg.currency_def_version if amounts else None,
                detail=detail,
                status="OPEN",
                opened_at=self._clock(),
            )
        )
        await self._db.flush()
        return 1
