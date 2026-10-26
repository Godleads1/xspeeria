"""Fraud Management (ADR-068; owner 2026-10-26: "Simple rules + staff flag").

Rules over data Xspeeria already has, checked by the background sweep (every 30 s):

* ``pin_lockout`` (low) — the app locked the account after 5 wrong PINs.
* ``code_lockout`` (low) — the account was locked after 5 wrong sign-in codes.
* ``disputes_against`` (high) — 3 or more disputes raised **against** the same person in 30 days.
* ``payout_name_mismatch`` (medium) — a payout account whose bank-checked holder name shares no
  name with the person's verified identity name.

Staff can also raise one by hand (``staff_report``). The thresholds are starting values, set in
this file; changing them is an owner decision.

An alert never blocks, moves or reverses anything by itself. Staff act through the screens that
already exist (suspend a customer — Super Admin; ask for a refund — reversals). Details hold
counts and references only, never account numbers (last 4 digits at most), PINs or codes.

Permissions (checked here, from the database role, on every call): ``fraud_alerts.read`` list
and open; ``fraud_alerts.create`` raise one by hand; ``fraud_alerts.update`` mark in progress
and resolve.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from collections import defaultdict
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from fastapi import status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.disputes import Dispute
from app.models.fraud import FraudAlert
from app.models.identity import User
from app.models.kyc import KycCase
from app.models.marketplace import Match, Offer
from app.models.payouts import Beneficiary
from app.models.settlement import Transaction
from app.models.staff import StaffAccount, StaffAuditEntry
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = ["DISPUTES_THRESHOLD", "DISPUTES_WINDOW", "FraudService", "names_share_a_word", "ref"]

#: Starting values (ADR-068); changing them is an owner decision.
DISPUTES_THRESHOLD = 3
DISPUTES_WINDOW = timedelta(days=30)

SEVERITY = {
    "pin_lockout": "low",
    "code_lockout": "low",
    "disputes_against": "high",
    "payout_name_mismatch": "medium",
}


def ref(alert_id: uuid.UUID) -> str:
    return "#" + str(alert_id).split("-")[0].upper()


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


def _words(name: str) -> set[str]:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return {w for w in re.split(r"[^a-z]+", plain) if len(w) >= 2}


def names_share_a_word(a: str, b: str) -> bool:
    """True when two names share at least one word (accents and order ignored). Pure."""
    wa, wb = _words(a), _words(b)
    return not wa or not wb or bool(wa & wb)


class FraudService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    # --- the rules (background sweep) ------------------------------------------------------

    async def _raise(
        self, user_id: uuid.UUID, rule: str, subject: str, details: dict[str, Any]
    ) -> bool:
        now = self._clock()
        result = await self._db.execute(
            insert(FraudAlert)
            .values(
                id=uuid.uuid4(),
                user_id=user_id,
                rule=rule,
                severity=SEVERITY[rule],
                status="open",
                subject=subject[:120],
                details=details,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(
                index_elements=["rule", "subject"], index_where=FraudAlert.subject.isnot(None)
            )
            .returning(FraudAlert.id)
        )
        return result.scalar() is not None

    async def scan(self) -> int:
        """Apply every rule once; returns how many new alerts were raised. Idempotent."""
        now = self._clock()
        raised = 0
        locked = (
            await self._db.execute(
                select(User.id, User.pin_locked_until, User.mfa_locked_until).where(
                    or_(User.pin_locked_until > now, User.mfa_locked_until > now)
                )
            )
        ).all()
        for user_id, pin_until, code_until in locked:
            if pin_until is not None and pin_until > now:
                raised += await self._raise(
                    user_id,
                    "pin_lockout",
                    f"{user_id}:{pin_until.isoformat()}",
                    {"locked_until": pin_until.isoformat()},
                )
            if code_until is not None and code_until > now:
                raised += await self._raise(
                    user_id,
                    "code_lockout",
                    f"{user_id}:{code_until.isoformat()}",
                    {"locked_until": code_until.isoformat()},
                )

        rows = (
            await self._db.execute(
                select(
                    Dispute.id,
                    Dispute.created_at,
                    Dispute.initiator_user_id,
                    Match.counterparty_user_id,
                    Offer.user_id,
                )
                .join(Transaction, Transaction.id == Dispute.transaction_id)
                .join(Match, Match.id == Transaction.match_id)
                .join(Offer, Offer.id == Match.offer_id)
                .where(Dispute.kind == "dispute", Dispute.created_at >= now - DISPUTES_WINDOW)
                .order_by(Dispute.created_at)
            )
        ).all()
        against: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
        for dispute_id, _at, initiator, taker, owner in rows:
            other = owner if initiator == taker else taker
            against[other].append(dispute_id)
        for user_id, ids in against.items():
            if len(ids) >= DISPUTES_THRESHOLD:
                # The newest dispute names it: another one later raises a new alert.
                raised += await self._raise(
                    user_id,
                    "disputes_against",
                    f"{user_id}:{ids[-1]}",
                    {"disputes": len(ids), "days": DISPUTES_WINDOW.days},
                )

        names = (
            await self._db.execute(
                select(
                    Beneficiary.id,
                    Beneficiary.user_id,
                    Beneficiary.account_name,
                    Beneficiary.account_last4,
                    Beneficiary.bank_name,
                    KycCase.legal_name,
                )
                .join(
                    KycCase,
                    (KycCase.user_id == Beneficiary.user_id) & (KycCase.status == "approved"),
                )
                .where(
                    Beneficiary.account_name.isnot(None),
                    Beneficiary.removed_at.is_(None),
                    KycCase.legal_name.isnot(None),
                )
            )
        ).all()
        for ben_id, user_id, account_name, last4, bank, legal in names:
            if not names_share_a_word(account_name, legal):
                raised += await self._raise(
                    user_id,
                    "payout_name_mismatch",
                    str(ben_id),
                    {"bank": bank, "last4": last4},
                )
        await self._db.commit()
        return raised

    # --- staff ----------------------------------------------------------------------------

    def _need(self, principal: StaffPrincipal, permission: str) -> None:
        if not principal.can(permission):
            raise forbidden()

    def _audit(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        action: str,
        target: uuid.UUID,
        detail: dict[str, Any] | None = None,
    ) -> None:
        self._db.add(
            StaffAuditEntry(
                at=self._clock(),
                staff_id=principal.staff_id,
                action=action,
                target_type="fraud_alert",
                target_id=str(target),
                detail=detail,
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )

    @staticmethod
    def _customer_name() -> Any:
        return (
            select(KycCase.legal_name)
            .where(KycCase.user_id == FraudAlert.user_id, KycCase.status == "approved")
            .order_by(KycCase.decided_at.desc())
            .limit(1)
            .scalar_subquery()
        )

    def _row(self, a: FraudAlert, email: str, name: str | None) -> dict[str, Any]:
        return {
            "id": a.id,
            "ref": ref(a.id),
            "user_id": a.user_id,
            "customer": name or email,
            "customer_email": email,
            "rule": a.rule,
            "severity": a.severity,
            "status": a.status,
            "details": a.details,
            "created_at": a.created_at,
            "resolved_at": a.resolved_at,
            "resolution": a.resolution,
        }

    async def list(
        self,
        principal: StaffPrincipal,
        *,
        search: str | None,
        status_in: str | None,
        rule: str | None,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        self._need(principal, "fraud_alerts.read")
        name = self._customer_name()
        q = select(FraudAlert, User.email, name.label("name")).join(
            User, User.id == FraudAlert.user_id
        )
        if status_in:
            q = q.where(FraudAlert.status == status_in)
        if rule:
            q = q.where(FraudAlert.rule == rule)
        if search:
            s = search.strip()
            like = f"%{s.lower()}%"
            named = select(KycCase.id).where(
                KycCase.user_id == FraudAlert.user_id, func.lower(KycCase.legal_name).like(like)
            )
            conditions = [User.email.like(like), named.exists()]
            hexpart = s.upper().lstrip("#")
            if re.fullmatch(r"[0-9A-F]{4,8}", hexpart):
                conditions.append(func.upper(cast(FraudAlert.id, String)).like(f"{hexpart}%"))
            q = q.where(or_(*conditions))
        total = await self._db.scalar(select(func.count()).select_from(q.subquery()))
        rows = (
            await self._db.execute(
                q.order_by(FraudAlert.created_at.desc(), FraudAlert.id).offset(offset).limit(limit)
            )
        ).all()
        items = [self._row(a, email, n) for a, email, n in rows]
        await self._db.rollback()
        return {"total": int(total or 0), "items": items}

    async def stats(self, principal: StaffPrincipal) -> dict[str, Any]:
        self._need(principal, "fraud_alerts.read")
        rows = (
            await self._db.execute(
                select(FraudAlert.status, FraudAlert.severity, func.count()).group_by(
                    FraudAlert.status, FraudAlert.severity
                )
            )
        ).all()
        await self._db.rollback()
        out = {"open": 0, "in_progress": 0, "resolved": 0, "high_open": 0}
        for st, sev, n in rows:
            out[st] += int(n)
            if st != "resolved" and sev == "high":
                out["high_open"] += int(n)
        return out

    async def get(self, principal: StaffPrincipal, alert_id: uuid.UUID) -> dict[str, Any]:
        self._need(principal, "fraud_alerts.read")
        found = (
            await self._db.execute(
                select(FraudAlert, User.email, self._customer_name().label("name"))
                .join(User, User.id == FraudAlert.user_id)
                .where(FraudAlert.id == alert_id)
            )
        ).first()
        if found is None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That alert was not found.", 404)
        a, email, name = found
        view = self._row(a, email, name)
        user = await self._db.get(User, a.user_id)
        view["customer_status"] = user.status if user else None
        view["customer_phone"] = user.phone if user else None
        view["note"] = a.note
        view["resolution_note"] = a.resolution_note
        raised = await self._db.get(StaffAccount, a.raised_by) if a.raised_by else None
        resolved = await self._db.get(StaffAccount, a.resolved_by) if a.resolved_by else None
        view["raised_by"] = raised.name if raised else None
        view["resolved_by"] = resolved.name if resolved else None
        if a.rule == "payout_name_mismatch" and a.subject:
            ben = await self._db.get(Beneficiary, uuid.UUID(a.subject))
            view["account_name"] = ben.account_name if ben else None
            view["verified_name"] = name
        await self._db.rollback()
        return view

    async def report(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        *,
        user_id: uuid.UUID,
        severity: str,
        note: str,
    ) -> dict[str, Any]:
        """A staff member raises an alert about a customer by hand."""
        self._need(principal, "fraud_alerts.create")
        user = await self._db.get(User, user_id)
        if user is None or user.status == "pending_verification":
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That customer was not found.", 404)
        now = self._clock()
        a = FraudAlert(
            id=uuid.uuid4(),
            user_id=user_id,
            rule="staff_report",
            severity=severity,
            status="open",
            subject=None,
            details={},
            note=note,
            raised_by=principal.staff_id,
            created_at=now,
            updated_at=now,
        )
        self._db.add(a)
        await self._db.flush()
        self._audit(principal, info, "fraud_alert_raised", a.id, {"severity": severity})
        out = {"id": a.id, "ref": ref(a.id)}
        await self._db.commit()
        return out

    async def _open_alert(self, alert_id: uuid.UUID) -> FraudAlert:
        a = await self._db.scalar(
            select(FraudAlert).where(FraudAlert.id == alert_id).with_for_update()
        )
        if a is None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That alert was not found.", 404)
        if a.status == "resolved":
            await self._db.rollback()
            raise _err(
                "RES_409_ALERT_RESOLVED",
                "This alert is already resolved.",
                status.HTTP_409_CONFLICT,
            )
        return a

    async def start(
        self, principal: StaffPrincipal, info: RequestInfo, alert_id: uuid.UUID
    ) -> None:
        self._need(principal, "fraud_alerts.update")
        a = await self._open_alert(alert_id)
        if a.status == "open":
            a.status = "in_progress"
            a.updated_at = self._clock()
            self._audit(principal, info, "fraud_alert_in_progress", a.id)
        await self._db.commit()

    async def resolve(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        alert_id: uuid.UUID,
        *,
        resolution: str,
        note: str,
    ) -> None:
        self._need(principal, "fraud_alerts.update")
        a = await self._open_alert(alert_id)
        now = self._clock()
        a.status, a.resolved_at, a.resolved_by = "resolved", now, principal.staff_id
        a.resolution, a.resolution_note, a.updated_at = resolution, note, now
        self._audit(principal, info, "fraud_alert_resolved", a.id, {"resolution": resolution})
        await self._db.commit()
