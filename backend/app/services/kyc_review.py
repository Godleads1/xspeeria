"""Admin console: identity-check review (ADR-069; owner 2026-10-27).

Two kinds of case wait for a person:

* **Held by Xspeeria** (``review_reason`` set): the same person is already verified on another
  account (ADR-041), a second country's ID doesn't match the account (ADR-042), or the checks
  were incomplete. Staff decide here.
* **Being reviewed in Didit** (``review_reason`` empty, Didit said "In Review"): owner decision —
  decided in Didit's console; shown here read-only, and Didit's answer arrives by webhook.

Permissions (checked here, from the database role, on every call):

* ``kyc.read``    — the list and one case.
* ``kyc.update``  — recommend approval (with a reason), or reject (one person; the reason is shown
  to the customer, contract §3.3).
* ``kyc.approve`` — confirm or decline someone else's recommendation. **Never your own**
  (owner: two people; also a database CHECK).

Approving needs the name and date of birth from the ID (kept on held cases since ADR-069); a
case without them can only be rejected (the customer checks again). One ID document is approved
on one account only (ADR-041, database unique index): if the other account's case is still
approved, this one can't be. Every step is in the staff audit log; nothing personal is logged.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.domain.kyc_rules import COUNTRIES
from app.models.identity import User
from app.models.kyc import KycCase
from app.models.kyc_reviews import KycReview
from app.models.staff import StaffAccount, StaffAuditEntry
from app.services.identity_redo import finish_redo
from app.services.kyc import UNKNOWN_ACCOUNT
from app.services.notifications import notify
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = ["KycReviewService", "ref"]

#: What the list can show.
QUEUES = ("held", "in_didit", "decided")


def ref(case_id: uuid.UUID) -> str:
    return "KYC-" + str(case_id).split("-")[0].upper()


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


def _not_found() -> AppError:
    return _err("RES_404_CASE_NOT_FOUND", "That identity check was not found.", 404)


class KycReviewService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

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
                target_type="kyc_case",
                target_id=str(target),
                detail=detail,
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )

    # --- reading --------------------------------------------------------------------------

    async def list(
        self, principal: StaffPrincipal, *, queue: str, search: str | None, offset: int, limit: int
    ) -> dict[str, Any]:
        self._need(principal, "kyc.read")
        pending = (
            select(KycReview.id)
            .where(KycReview.kyc_case_id == KycCase.id, KycReview.status == "pending")
            .exists()
        )
        q = select(KycCase, User.email, pending.label("awaiting_second")).join(
            User, User.id == KycCase.user_id
        )
        if queue == "held":
            q = q.where(KycCase.status == "under_review", KycCase.review_reason.isnot(None))
        elif queue == "in_didit":
            q = q.where(KycCase.status == "under_review", KycCase.review_reason.is_(None))
        else:
            q = q.where(
                KycCase.status.in_(("approved", "rejected")), KycCase.review_reason.isnot(None)
            )
        if search:
            like = f"%{search.strip().lower()}%"
            q = q.where(or_(User.email.like(like), func.lower(KycCase.legal_name).like(like)))
        total = await self._db.scalar(select(func.count()).select_from(q.subquery()))
        rows = (
            await self._db.execute(
                q.order_by(
                    KycCase.updated_at.asc() if queue != "decided" else KycCase.updated_at.desc()
                )
                .offset(offset)
                .limit(limit)
            )
        ).all()
        items = [
            {
                "id": c.id,
                "ref": ref(c.id),
                "customer": c.legal_name or email,
                "customer_email": email,
                "country": c.country,
                "status": c.status,
                "review_reason": c.review_reason,
                "awaiting_second": bool(waiting),
                "waiting_since": c.updated_at,
                "decided_at": c.decided_at,
            }
            for c, email, waiting in rows
        ]
        counts = (
            await self._db.execute(
                select(
                    func.count().filter(
                        KycCase.status == "under_review", KycCase.review_reason.isnot(None)
                    ),
                    func.count().filter(
                        KycCase.status == "under_review", KycCase.review_reason.is_(None)
                    ),
                )
            )
        ).one()
        await self._db.rollback()
        return {
            "total": int(total or 0),
            "items": items,
            "held": int(counts[0]),
            "in_didit": int(counts[1]),
        }

    async def get(self, principal: StaffPrincipal, case_id: uuid.UUID) -> dict[str, Any]:
        self._need(principal, "kyc.read")
        c = await self._db.get(KycCase, case_id)
        if c is None:
            await self._db.rollback()
            raise _not_found()
        user = await self._db.get(User, c.user_id)
        review_rows = (
            (
                await self._db.execute(
                    select(KycReview)
                    .where(KycReview.kyc_case_id == c.id)
                    .order_by(KycReview.recommended_at.desc())
                )
            )
            .scalars()
            .all()
        )
        names: dict[uuid.UUID, str] = {}
        for r in review_rows:
            for sid in (r.recommended_by, r.decided_by):
                if sid and sid not in names:
                    staff = await self._db.get(StaffAccount, sid)
                    names[sid] = staff.name if staff else "—"
        # The same ID document approved (or once approved) on another account (ADR-041).
        others: list[dict[str, Any]] = []
        if c.identity_key:
            for other, email, ustatus in (
                await self._db.execute(
                    select(KycCase, User.email, User.status)
                    .join(User, User.id == KycCase.user_id)
                    .where(KycCase.identity_key == c.identity_key, KycCase.user_id != c.user_id)
                )
            ).all():
                others.append(
                    {
                        "user_id": other.user_id,
                        "email": email,
                        "account_status": ustatus,
                        "check_status": other.status,
                        "name": other.legal_name,
                    }
                )
        # ADR-042: what the account already has verified (for a second country's check).
        account = (
            await self._db.execute(
                select(KycCase.country, KycCase.legal_name, KycCase.date_of_birth).where(
                    KycCase.user_id == c.user_id,
                    KycCase.id != c.id,
                    KycCase.status.in_(("approved", "expired")),
                    KycCase.legal_name.isnot(None),
                )
            )
        ).all()
        view = {
            "id": c.id,
            "ref": ref(c.id),
            "status": c.status,
            "review_reason": c.review_reason,
            "in_didit": c.status == "under_review" and c.review_reason is None,
            "country": c.country,
            "country_name": COUNTRIES.get(c.country, ("", c.country))[1],
            "provider_status": c.provider_status,
            "identity": {
                "legal_name": c.legal_name,
                "date_of_birth": c.date_of_birth.isoformat() if c.date_of_birth else None,
                "id_type": c.id_type,
                "issuing_country": c.issuing_country,
            },
            "can_approve": c.status == "under_review"
            and c.review_reason is not None
            and c.legal_name is not None
            and c.date_of_birth is not None,
            "customer": {
                "user_id": c.user_id,
                "email": user.email if user else None,
                "phone": user.phone if user else None,
                "account_status": user.status if user else None,
            },
            "same_document_elsewhere": others,
            "account_identity": [
                {"country": co, "legal_name": n, "date_of_birth": d.isoformat() if d else None}
                for co, n, d in account
            ],
            "decision_reason": c.decision_reason,
            "decided_at": c.decided_at,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "reviews": [
                {
                    "id": r.id,
                    "status": r.status,
                    "reason": r.reason,
                    "recommended_by": names.get(r.recommended_by),
                    "recommended_by_id": r.recommended_by,
                    "recommended_at": r.recommended_at,
                    "decided_by": names.get(r.decided_by) if r.decided_by else None,
                    "decided_at": r.decided_at,
                    "decision_note": r.decision_note,
                }
                for r in review_rows
            ],
        }
        await self._db.rollback()
        return view

    # --- deciding -------------------------------------------------------------------------

    async def _held_case(self, case_id: uuid.UUID) -> KycCase:
        c = await self._db.scalar(select(KycCase).where(KycCase.id == case_id).with_for_update())
        if c is None:
            await self._db.rollback()
            raise _not_found()
        if c.status != "under_review":
            await self._db.rollback()
            raise _err(
                "RES_409_CASE_DECIDED",
                "This identity check is no longer waiting for a decision.",
                status.HTTP_409_CONFLICT,
            )
        if c.review_reason is None:
            await self._db.rollback()
            raise _err(
                "RES_409_DECIDED_IN_DIDIT",
                "Didit is reviewing this check; decide it in Didit's console.",
                status.HTTP_409_CONFLICT,
            )
        return c

    async def recommend(
        self, principal: StaffPrincipal, info: RequestInfo, case_id: uuid.UUID, reason: str
    ) -> None:
        """First person: recommend approval, with a reason. A second person must confirm."""
        self._need(principal, "kyc.update")
        c = await self._held_case(case_id)
        if c.legal_name is None or c.date_of_birth is None:
            await self._db.rollback()
            raise _err(
                "RES_409_IDENTITY_MISSING",
                "The name or date of birth from the ID is missing, so this check can't be "
                "approved. Reject it so the customer can check again.",
                status.HTTP_409_CONFLICT,
            )
        now = self._clock()
        row = KycReview(
            id=uuid.uuid4(),
            kyc_case_id=c.id,
            status="pending",
            reason=reason,
            recommended_by=principal.staff_id,
            recommended_at=now,
        )
        self._db.add(row)
        try:
            await self._db.flush()
        except IntegrityError:
            await self._db.rollback()
            raise _err(
                "RES_409_REVIEW_PENDING",
                "An approval for this check is already waiting for a second person.",
                status.HTTP_409_CONFLICT,
            ) from None
        self._audit(principal, info, "kyc_approval_recommended", c.id, {"review": str(row.id)})
        await self._db.commit()

    async def _pending_review(self, principal: StaffPrincipal, case_id: uuid.UUID) -> KycReview:
        row = await self._db.scalar(
            select(KycReview)
            .where(KycReview.kyc_case_id == case_id, KycReview.status == "pending")
            .with_for_update()
        )
        if row is None:
            await self._db.rollback()
            raise _err(
                "RES_409_NO_RECOMMENDATION",
                "Nobody has recommended approving this check yet.",
                status.HTTP_409_CONFLICT,
            )
        if row.recommended_by == principal.staff_id:
            await self._db.rollback()
            raise _err(
                "AUTH_403_OWN_REQUEST",
                "Another staff member must confirm an approval you recommended.",
                status.HTTP_403_FORBIDDEN,
            )
        return row

    async def _refuse_if_matched_account_verified(self, c: KycCase) -> None:
        """F-008: the document-key index can't see approvals made before the key existed, so
        the accounts Didit matched to this person are checked too. While any of them still
        holds an approved check, this one can't be approved; a match whose account Didit didn't
        name can't be cleared here at all."""
        ids = [i for i in (c.matched_user_ids or []) if i != c.user_id]
        if not ids:
            return
        if UNKNOWN_ACCOUNT in ids:
            await self._db.rollback()
            raise _err(
                "RES_409_DOCUMENT_ALREADY_VERIFIED",
                "Didit matched this person to another account it didn't name, so this check "
                "can't be approved here. Reject it, or ask Didit which account it is.",
                status.HTTP_409_CONFLICT,
            )
        verified = await self._db.scalar(
            select(func.count(KycCase.id)).where(
                KycCase.user_id.in_(ids), KycCase.status == "approved"
            )
        )
        if verified:
            await self._db.rollback()
            raise _err(
                "RES_409_DOCUMENT_ALREADY_VERIFIED",
                "This ID document is still verified on another account, so it can't be approved "
                "here. Reject this check, or have that account's check expire first.",
                status.HTTP_409_CONFLICT,
            )

    async def confirm(
        self, principal: StaffPrincipal, info: RequestInfo, case_id: uuid.UUID, note: str | None
    ) -> None:
        """Second person: confirm the recommendation; the customer is verified."""
        self._need(principal, "kyc.approve")
        c = await self._held_case(case_id)
        row = await self._pending_review(principal, case_id)
        if (
            c.legal_name is None or c.date_of_birth is None
        ):  # pragma: no cover - checked on recommend
            await self._db.rollback()
            raise _err("RES_409_IDENTITY_MISSING", "The name or date of birth is missing.", 409)
        await self._refuse_if_matched_account_verified(c)
        now = self._clock()
        row.status, row.decided_by, row.decided_at = "confirmed", principal.staff_id, now
        row.decision_note = note
        if c.purpose == "redo":
            await finish_redo(self._db, c, now)  # ADR-104: the older check ends first
        c.status, c.decided_at, c.decision_reason, c.updated_at = "approved", now, None, now
        try:
            await self._db.flush()
        except IntegrityError:
            await self._db.rollback()
            raise _err(
                "RES_409_DOCUMENT_ALREADY_VERIFIED",
                "This ID document is still verified on another account, so it can't be approved "
                "here. Reject this check, or have that account's check expire first.",
                status.HTTP_409_CONFLICT,
            ) from None
        self._audit(principal, info, "kyc_approved", c.id, {"review": str(row.id)})
        await notify(
            self._db,
            user_id=c.user_id,
            event="kyc.approved",
            dedupe_key=f"kyc:{c.id}:approved",
            now=now,
            kyc_case_id=str(c.id),
            country=c.country,
        )
        await self._db.commit()

    async def decline(
        self, principal: StaffPrincipal, info: RequestInfo, case_id: uuid.UUID, note: str
    ) -> None:
        """Second person: don't confirm. The case stays held; it can be recommended again or
        rejected."""
        self._need(principal, "kyc.approve")
        c = await self._held_case(case_id)
        row = await self._pending_review(principal, case_id)
        now = self._clock()
        row.status, row.decided_by, row.decided_at = "declined", principal.staff_id, now
        row.decision_note = note
        c.updated_at = now
        self._audit(principal, info, "kyc_recommendation_declined", c.id, {"review": str(row.id)})
        await self._db.commit()

    async def reject(
        self, principal: StaffPrincipal, info: RequestInfo, case_id: uuid.UUID, reason: str
    ) -> None:
        """One person: reject, with the reason the customer will read."""
        self._need(principal, "kyc.update")
        c = await self._held_case(case_id)
        now = self._clock()
        waiting = await self._db.scalar(
            select(KycReview)
            .where(KycReview.kyc_case_id == c.id, KycReview.status == "pending")
            .with_for_update()
        )
        if waiting is not None:
            if waiting.recommended_by == principal.staff_id:
                # The second-person rule: you can't close your own recommendation.
                await self._db.rollback()
                raise _err(
                    "RES_409_REVIEW_PENDING",
                    "You recommended approving this check, so another staff member must reject "
                    "it or decline your recommendation.",
                    status.HTTP_409_CONFLICT,
                )
            waiting.status, waiting.decided_by, waiting.decided_at = (
                "declined",
                principal.staff_id,
                now,
            )
            waiting.decision_note = "Closed: the check was rejected."
        c.status, c.decided_at, c.decision_reason, c.updated_at = "rejected", now, reason, now
        self._audit(principal, info, "kyc_rejected", c.id, None)
        await notify(
            self._db,
            user_id=c.user_id,
            event="kyc.rejected",
            dedupe_key=f"kyc:{c.id}:rejected",
            now=now,
            kyc_case_id=str(c.id),
            country=c.country,
        )
        await self._db.commit()
