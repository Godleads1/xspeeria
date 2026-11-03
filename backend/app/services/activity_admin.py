"""Customer activity and deal timelines for the admin console (ADR-073; Super Admin only).

* **Customer activity:** everything one customer did (``customer_activity``), merged with what
  staff did about them: their account (suspend, reactivate, close), their identity checks, their
  fraud alerts and the disputes they opened (``staff_audit_log``). Newest first, 5 years.
* **Deals:** the list customers know by the reference the app shows (the first 8 characters of
  the deal ID), and one deal's full timeline from the records each step leaves: the offer, the
  take, each payout choice, every escrow event, holds, disputes, refunds, staff actions and the
  customers' own activity on it.

Needs ``activity.read``. Amounts are exact decimal text from integer minor units.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.services.staff import StaffPrincipal, forbidden

__all__ = ["ActivityAdminService", "CATEGORIES"]

CATEGORIES = ("account", "security", "identity", "market", "deal", "payout", "dispute", "other")
_UUID_LIKE = "^[0-9a-fA-F-]{8,36}$"


#: Tie-breaker for steps recorded in the same instant: the order a deal goes through.
_STEP_ORDER = {
    k: i
    for i, k in enumerate(
        (
            "offer_posted",
            "offer_taken",
            "payout_accounts_chosen",
            "SettlementCreated",
            "EscrowProvisioned",
            "EscrowProvisioningFailed",
            "FundingExtended",
            "EscrowFunded",
            "HoldOpened",
            "FundingWindowExpired",
            "EscrowReturnInitiated",
            "EscrowReturned",
            "ReversalApproved",
            "ReleaseAuthorized",
            "ReleaseSent",
            "PayoutFailed",
            "PayoutConfirmed",
            "SettlementUnwound",
            "SettlementCancelled",
            "SettlementCompleted",
        )
    )
}


# --- fixed queries (bandit B608: no SQL is built from strings; filters are bound parameters) ---

_CUSTOMER_COUNT = (
    "SELECT count(*) FROM ("
    "SELECT * FROM ("
    "SELECT 'customer' AS source, a.at, a.category FROM customer_activity a WHERE a.user_id = :u "
    "UNION ALL "
    "SELECT 'staff', s.at, 'staff' FROM staff_audit_log s "
    "WHERE (s.target_type = 'customer' AND s.target_id = CAST(:u AS text)) OR "
    "(s.target_type = 'kyc_case' AND s.target_id IN "
    "(SELECT CAST(id AS text) FROM kyc_cases WHERE user_id = :u)) OR "
    "(s.target_type = 'fraud_alert' AND s.target_id IN "
    "(SELECT CAST(id AS text) FROM fraud_alerts WHERE user_id = :u)) OR "
    "(s.target_type = 'dispute' AND s.target_id IN "
    "(SELECT CAST(id AS text) FROM disputes WHERE initiator_user_id = :u))"
    ") m WHERE (NOT CAST(:only_staff AS boolean) OR m.source = 'staff') "
    "AND (CAST(:category AS text) IS NULL OR m.category = CAST(:category AS text)) "
    "AND (CAST(:since AS timestamptz) IS NULL OR m.at >= CAST(:since AS timestamptz)) "
    "AND (CAST(:until AS timestamptz) IS NULL OR m.at < CAST(:until AS timestamptz))"
    ") c"
)
_CUSTOMER_PAGE = (
    "SELECT * FROM ("
    "SELECT 'customer' AS source, a.at, a.action, a.category, a.outcome, a.route, "
    "a.method, a.status, a.match_id, a.offer_id, a.ref_id, a.detail, a.device, a.country, "
    "NULL AS staff_name, NULL AS target_type "
    "FROM customer_activity a WHERE a.user_id = :u "
    "UNION ALL "
    "SELECT 'staff', s.at, s.action, 'staff', 'done', NULL, NULL, NULL, NULL, NULL, NULL, "
    "s.detail, NULL, NULL, st.name, s.target_type "
    "FROM staff_audit_log s LEFT JOIN staff_accounts st ON st.id = s.staff_id "
    "WHERE (s.target_type = 'customer' AND s.target_id = CAST(:u AS text)) OR "
    "(s.target_type = 'kyc_case' AND s.target_id IN "
    "(SELECT CAST(id AS text) FROM kyc_cases WHERE user_id = :u)) OR "
    "(s.target_type = 'fraud_alert' AND s.target_id IN "
    "(SELECT CAST(id AS text) FROM fraud_alerts WHERE user_id = :u)) OR "
    "(s.target_type = 'dispute' AND s.target_id IN "
    "(SELECT CAST(id AS text) FROM disputes WHERE initiator_user_id = :u))"
    ") m WHERE (NOT CAST(:only_staff AS boolean) OR m.source = 'staff') "
    "AND (CAST(:category AS text) IS NULL OR m.category = CAST(:category AS text)) "
    "AND (CAST(:since AS timestamptz) IS NULL OR m.at >= CAST(:since AS timestamptz)) "
    "AND (CAST(:until AS timestamptz) IS NULL OR m.at < CAST(:until AS timestamptz)) "
    "ORDER BY m.at DESC LIMIT :limit OFFSET :offset"
)
_DEAL_ONE = (
    "SELECT m.id AS match_id, t.id AS transaction_id, m.accepted_at, m.agreed_rate, "
    "m.allocated_amount_minor, o.source_currency, o.target_currency, m.scale, "
    "o.user_id AS owner_id, m.counterparty_user_id AS taker_id, ou.email AS owner_email, "
    "tu.email AS taker_email, s.phase, s.closure_reason, s.id AS settlement_id "
    "FROM matches m JOIN offers o ON o.id = m.offer_id "
    "JOIN users ou ON ou.id = o.user_id JOIN users tu ON tu.id = m.counterparty_user_id "
    "LEFT JOIN transactions t ON t.match_id = m.id "
    "LEFT JOIN settlements s ON s.transaction_id = t.id "
    "WHERE m.id = :m"
)
_DEALS_PAGE = (
    "SELECT m.id AS match_id, t.id AS transaction_id, m.accepted_at, m.agreed_rate, "
    "m.allocated_amount_minor, o.source_currency, o.target_currency, m.scale, "
    "o.user_id AS owner_id, m.counterparty_user_id AS taker_id, ou.email AS owner_email, "
    "tu.email AS taker_email, s.phase, s.closure_reason, s.id AS settlement_id "
    "FROM matches m JOIN offers o ON o.id = m.offer_id "
    "JOIN users ou ON ou.id = o.user_id JOIN users tu ON tu.id = m.counterparty_user_id "
    "LEFT JOIN transactions t ON t.match_id = m.id "
    "LEFT JOIN settlements s ON s.transaction_id = t.id "
    # The reference the app shows is the start of the deal ID; emails match anywhere.
    "WHERE CAST(:q AS text) IS NULL "
    "OR lower(CAST(m.id AS text)) LIKE CAST(:q AS text) || '%' "
    "OR lower(CAST(t.id AS text)) LIKE CAST(:q AS text) || '%' "
    "OR lower(ou.email) LIKE CAST(:like AS text) OR lower(tu.email) LIKE CAST(:like AS text) "
    "ORDER BY m.accepted_at DESC LIMIT :limit OFFSET :offset"
)
_DEALS_COUNT = (
    "SELECT count(*) FROM matches m JOIN offers o ON o.id = m.offer_id "
    "JOIN users ou ON ou.id = o.user_id JOIN users tu ON tu.id = m.counterparty_user_id "
    "LEFT JOIN transactions t ON t.match_id = m.id "
    "WHERE CAST(:q AS text) IS NULL "
    "OR lower(CAST(m.id AS text)) LIKE CAST(:q AS text) || '%' "
    "OR lower(CAST(t.id AS text)) LIKE CAST(:q AS text) || '%' "
    "OR lower(ou.email) LIKE CAST(:like AS text) OR lower(tu.email) LIKE CAST(:like AS text)"
)


def _not_found() -> AppError:
    return AppError("RES_404_NOT_FOUND", "Not found.", status_code=status.HTTP_404_NOT_FOUND)


def _money(minor: int | None, scale: int | None) -> str | None:
    if minor is None or scale is None:
        return None
    return f"{Decimal(minor).scaleb(-scale):.{scale}f}"


def ref(match_id: uuid.UUID) -> str:
    """The deal reference the app shows customers (History, receipts)."""
    return str(match_id).split("-")[0].upper()


class ActivityAdminService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def _need(self, p: StaffPrincipal) -> None:
        if not p.can("activity.read"):
            raise forbidden()

    async def _rows(self, sql: str, **params: Any) -> list[Any]:
        return list((await self._db.execute(text(sql), params)).mappings().all())

    # --- one customer ----------------------------------------------------------------------

    async def customer(
        self,
        p: StaffPrincipal,
        user_id: uuid.UUID,
        *,
        category: str | None,
        since: datetime | None,
        until: datetime | None,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        self._need(p)
        who = await self._rows(
            "SELECT u.id, u.email, u.phone, u.status, u.created_at, u.deletion_requested_at, "
            "(SELECT legal_name FROM kyc_cases k WHERE k.user_id = u.id AND k.status = "
            "'approved' AND legal_name IS NOT NULL ORDER BY decided_at DESC LIMIT 1) AS name "
            "FROM users u WHERE u.id = :u",
            u=user_id,
        )
        if not who:
            await self._db.rollback()
            raise _not_found()
        if who[0]["deletion_requested_at"] is not None and not p.can("kyc.read"):
            # ADR-095 / DEC-106: a deleted account's kept records are for Compliance only.
            await self._db.rollback()
            raise forbidden()
        # Every filter is a bound parameter in one fixed query: no SQL is built from text.
        params: dict[str, Any] = {
            "u": user_id,
            "only_staff": category == "staff",
            "category": category if category in CATEGORIES else None,
            "since": since,
            "until": until,
            "offset": offset,
            "limit": limit,
        }
        total = await self._db.scalar(text(_CUSTOMER_COUNT), params)
        items = await self._rows(_CUSTOMER_PAGE, **params)
        await self._db.rollback()
        w = who[0]
        return {
            "customer": {
                "id": w["id"],
                "name": w["name"],
                "email": w["email"],
                "phone": w["phone"],
                "status": w["status"],
                "joined_at": w["created_at"],
            },
            "total": int(total or 0),
            "items": [
                {
                    **dict(i),
                    "deal_ref": ref(i["match_id"]) if i["match_id"] else None,
                }
                for i in items
            ],
        }

    # --- deals -----------------------------------------------------------------------------

    def _deal(self, r: Any) -> dict[str, Any]:
        return {
            "match_id": r["match_id"],
            "ref": ref(r["match_id"]),
            "transaction_id": r["transaction_id"],
            "taken_at": r["accepted_at"],
            "currency": r["source_currency"],
            "counter_currency": r["target_currency"],
            "amount": _money(r["allocated_amount_minor"], r["scale"]),
            "rate": str(r["agreed_rate"]),
            "offer_owner": {"id": r["owner_id"], "email": r["owner_email"]},
            "taker": {"id": r["taker_id"], "email": r["taker_email"]},
            "phase": r["phase"],
            "closure_reason": r["closure_reason"],
        }

    async def deals(
        self, p: StaffPrincipal, *, search: str | None, offset: int, limit: int
    ) -> dict[str, Any]:
        self._need(p)
        q = (search or "").strip().lower()
        params: dict[str, Any] = {
            "q": q or None,
            "like": f"%{q}%" if q else None,
            "offset": offset,
            "limit": limit,
        }
        total = await self._db.scalar(text(_DEALS_COUNT), params)
        rows = await self._rows(_DEALS_PAGE, **params)
        await self._db.rollback()
        return {"total": int(total or 0), "items": [self._deal(r) for r in rows]}

    async def timeline(self, p: StaffPrincipal, match_id: uuid.UUID) -> dict[str, Any]:
        self._need(p)
        rows = await self._rows(_DEAL_ONE, m=match_id)
        if not rows:
            await self._db.rollback()
            raise _not_found()
        deal = rows[0]
        offer_id = (await self._rows("SELECT offer_id FROM matches WHERE id = :m", m=match_id))[0][
            "offer_id"
        ]
        events: list[dict[str, Any]] = []

        def add(at: Any, kind: str, who: str, **extra: Any) -> None:
            if at is not None:
                events.append({"at": at, "kind": kind, "by": who, **extra})

        offer = (
            await self._rows(
                "SELECT created_at, source_amount_minor, scale, desired_rate FROM offers "
                "WHERE id = :o",
                o=offer_id,
            )
        )[0]
        add(
            offer["created_at"],
            "offer_posted",
            "offer_owner",
            amount=_money(offer["source_amount_minor"], offer["scale"]),
            currency=deal["source_currency"],
            rate=str(offer["desired_rate"]),
        )
        add(
            deal["accepted_at"],
            "offer_taken",
            "taker",
            amount=_money(deal["allocated_amount_minor"], deal["scale"]),
            currency=deal["source_currency"],
            rate=str(deal["agreed_rate"]),
        )
        for c in await self._rows(
            "SELECT user_id, min(created_at) AS at, sum(amount_minor) AS total, currency, "
            "max(scale) AS scale, count(*) AS accounts FROM match_payout_selections "
            "WHERE match_id = :m GROUP BY user_id, currency",
            m=match_id,
        ):
            add(
                c["at"],
                "payout_accounts_chosen",
                "offer_owner" if c["user_id"] == deal["owner_id"] else "taker",
                amount=_money(int(c["total"]), c["scale"]),
                currency=c["currency"],
                accounts=int(c["accounts"]),
            )
        if deal["settlement_id"] is not None:
            sid = deal["settlement_id"]
            for e in await self._rows(
                "SELECT e.created_at, e.event_type, l.funder_user_id, l.currency, "
                "l.amount_minor, l.fee_minor, l.scale FROM settlement_events e "
                "LEFT JOIN settlement_legs l ON l.leg_id = e.leg_id "
                "WHERE e.settlement_id = :s ORDER BY e.created_at, e.id",
                s=sid,
            ):
                side = None
                if e["funder_user_id"] is not None:
                    side = "offer_owner" if e["funder_user_id"] == deal["owner_id"] else "taker"
                add(
                    e["created_at"],
                    e["event_type"],
                    side or "system",
                    currency=e["currency"],
                    amount=_money(e["amount_minor"], e["scale"]),
                    fee=_money(e["fee_minor"], e["scale"]),
                )
            for h in await self._rows(
                "SELECT type, reason, opened_at, closed_at, o.name AS opened_by, "
                "c.name AS closed_by FROM settlement_holds h "
                "LEFT JOIN staff_accounts o ON o.id = h.opened_by "
                "LEFT JOIN staff_accounts c ON c.id = h.closed_by WHERE settlement_id = :s",
                s=sid,
            ):
                add(h["opened_at"], "hold_opened", h["opened_by"] or "system", hold=h["type"])
                add(h["closed_at"], "hold_closed", h["closed_by"] or "system", hold=h["type"])
        disputes = await self._rows(
            "SELECT d.id, d.created_at, d.resolved_at, d.outcome, d.reason, d.initiator_user_id "
            "FROM disputes d WHERE d.transaction_id = :t",
            t=deal["transaction_id"],
        )
        for d in disputes:
            who = "offer_owner" if d["initiator_user_id"] == deal["owner_id"] else "taker"
            add(d["created_at"], "dispute_opened", who, dispute_id=d["id"], reason=d["reason"])
            add(
                d["resolved_at"],
                "dispute_resolved",
                "staff",
                dispute_id=d["id"],
                outcome=d["outcome"],
            )
        for r in await self._rows(
            "SELECT r.id, r.status, r.requested_at, r.decided_at, a.name AS requested_by, "
            "b.name AS decided_by FROM reversals r "
            "LEFT JOIN staff_accounts a ON a.id = r.requested_by "
            "LEFT JOIN staff_accounts b ON b.id = r.decided_by "
            "WHERE r.dispute_id = ANY(CAST(:ids AS uuid[]))",
            ids=[str(d["id"]) for d in disputes],
        ):
            add(r["requested_at"], "refund_requested", r["requested_by"] or "staff")
            if r["decided_at"] is not None:
                add(r["decided_at"], f"refund_{r['status']}", r["decided_by"] or "staff")
        # The customers' own steps on this deal (approvals, payout choices, payments, extensions).
        # Only the two people on this deal: a refused request by anyone else, linked to the same
        # match ID in the URL, is not one of their steps (F-006).
        for a in await self._rows(
            "SELECT at, action, outcome, user_id FROM customer_activity "
            "WHERE (match_id = :m AND user_id IN (:owner, :taker)) "
            "OR (offer_id = :o AND user_id = :taker "
            "AND action = 'offer_taken' AND outcome <> 'done')",
            m=match_id,
            o=offer_id,
            owner=deal["owner_id"],
            taker=deal["taker_id"],
        ):
            add(
                a["at"],
                f"customer:{a['action']}",
                "offer_owner" if a["user_id"] == deal["owner_id"] else "taker",
                outcome=a["outcome"],
            )
        await self._db.rollback()
        # By time; equal times follow the natural order of a deal's steps.
        events.sort(key=lambda e: (e["at"], _STEP_ORDER.get(e["kind"], 50)))
        return {**self._deal(deal), "events": events}
