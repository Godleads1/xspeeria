"""Staff bell: work waiting for the signed-in staff member (ADR-070; owner 2026-10-27).

Nothing is copied into a notifications table: every item is read live from its own queue, so
the bell can never show work that is already done, and each person sees only what their role
lets them act on:

- ``kyc_confirm`` (kyc.approve): a held identity check someone else recommended approving.
- ``kyc_recommend`` (kyc.update): a held identity check nobody has picked up yet.
- ``reversal`` (reversals.approve): a refund someone else asked for, waiting for a second person.
- ``fraud`` (fraud_alerts.update): a new fraud alert nobody has started on.
- ``dispute`` (disputes.update): a new dispute or support case, unassigned or assigned to you.
- ``ops_alert`` (monitoring.read): an operations alert nobody has acknowledged (ADR-074).

The badge counts items newer than the last time the person opened the panel. Display only —
every action is checked again on its own page.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any

from sqlalchemy import Select, func, null, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.disputes import Dispute
from app.models.fraud import FraudAlert
from app.models.kyc import KycCase
from app.models.kyc_reviews import KycReview
from app.models.ops_alerts import OpsAlert
from app.models.reversals import Reversal
from app.models.staff import StaffAccount
from app.services import dispute_admin, fraud, kyc_review, ops_alerts, reversals
from app.services.staff import StaffPrincipal

__all__ = ["FEED_LIMIT", "StaffWorkService"]

#: Most items listed in the panel; the counts cover everything.
FEED_LIMIT = 50


class StaffWorkService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    def _queues(
        self, p: StaffPrincipal
    ) -> list[tuple[str, Select[Any], Any, Callable[[Any], str]]]:
        """(kind, query of (id, at, detail), the "at" column, ref) for each queue this person
        may act on."""
        out: list[tuple[str, Select[Any], Any, Callable[[Any], str]]] = []
        if p.can("kyc.approve"):
            out.append(
                (
                    "kyc_confirm",
                    select(KycReview.kyc_case_id, KycReview.recommended_at, null())
                    .join(KycCase, KycCase.id == KycReview.kyc_case_id)
                    .where(
                        KycReview.status == "pending",
                        KycReview.recommended_by != p.staff_id,
                        KycCase.status == "under_review",
                    ),
                    KycReview.recommended_at,
                    kyc_review.ref,
                )
            )
        if p.can("kyc.update"):
            waiting = select(KycReview.id).where(
                KycReview.kyc_case_id == KycCase.id, KycReview.status == "pending"
            )
            out.append(
                (
                    "kyc_recommend",
                    select(KycCase.id, KycCase.updated_at, null()).where(
                        KycCase.status == "under_review",
                        KycCase.review_reason.isnot(None),
                        ~waiting.exists(),
                    ),
                    KycCase.updated_at,
                    kyc_review.ref,
                )
            )
        if p.can("reversals.approve"):
            out.append(
                (
                    "reversal",
                    select(Reversal.id, Reversal.requested_at, null()).where(
                        Reversal.status == "pending", Reversal.requested_by != p.staff_id
                    ),
                    Reversal.requested_at,
                    reversals.ref,
                )
            )
        if p.can("fraud_alerts.update"):
            out.append(
                (
                    "fraud",
                    select(FraudAlert.id, FraudAlert.created_at, FraudAlert.severity).where(
                        FraudAlert.status == "open"
                    ),
                    FraudAlert.created_at,
                    fraud.ref,
                )
            )
        if p.can("disputes.update"):
            out.append(
                (
                    "dispute",
                    select(Dispute.id, Dispute.created_at, Dispute.priority).where(
                        Dispute.status == "open",
                        or_(
                            Dispute.assigned_staff_id.is_(None),
                            Dispute.assigned_staff_id == p.staff_id,
                        ),
                    ),
                    Dispute.created_at,
                    dispute_admin.ref,
                )
            )
        if p.can("monitoring.read"):
            out.append(
                (
                    "ops_alert",
                    select(OpsAlert.id, OpsAlert.first_seen_at, OpsAlert.severity).where(
                        OpsAlert.status == "open"
                    ),
                    OpsAlert.first_seen_at,
                    ops_alerts.ref,
                )
            )
        return out

    async def feed(self, p: StaffPrincipal) -> dict[str, Any]:
        seen = (
            await self._db.execute(
                select(StaffAccount.notifications_seen_at).where(StaffAccount.id == p.staff_id)
            )
        ).scalar_one_or_none()
        items: list[dict[str, Any]] = []
        total = new = 0
        for kind, query, at, make_ref in self._queues(p):
            counted = query.with_only_columns(
                func.count(),
                func.count().filter(at > seen) if seen is not None else func.count(),
            ).order_by(None)
            n, fresh = (await self._db.execute(counted)).one()
            total += n
            new += fresh
            for row_id, row_at, detail in (
                await self._db.execute(query.order_by(at.desc()).limit(FEED_LIMIT))
            ).all():
                items.append(
                    {
                        "kind": kind,
                        "id": row_id,
                        "ref": make_ref(row_id),
                        "at": row_at,
                        "detail": detail,
                        "new": seen is None or row_at > seen,
                    }
                )
        items.sort(key=lambda i: i["at"], reverse=True)
        return {"items": items[:FEED_LIMIT], "total": total, "new": new, "seen_at": seen}

    async def mark_seen(self, p: StaffPrincipal) -> None:
        await self._db.execute(
            update(StaffAccount)
            .where(StaffAccount.id == p.staff_id)
            .values(notifications_seen_at=self._clock())
        )
        await self._db.commit()
