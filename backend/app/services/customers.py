"""Admin console: customers (ADR-051 A-3, ADR-062).

* Reading the list needs ``users.read``.
* Suspending, reactivating and closing a customer is for a **Super Admin only** (owner decision
  2026-10-26), with a written reason, audit-logged in ``staff_audit_log``.
* Suspended: can't log in or trade until a Super Admin lifts it; sessions end at once; their
  offers leave the market. Deals already under way keep settling — escrow is never touched.
* Closed: for good. The console can't reopen it; the phone and email stay taken.
* ADR-095: an account the customer asked to delete shows as "deleting" (with the date it can
  be restored until) or "deleted". Its kept records are for Compliance only (DEC-106): staff
  without ``kyc.read`` see no name, email or phone for it, and can't find it by them.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import status
from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.identity import AuthSession, User
from app.models.kyc import KycCase
from app.models.staff import StaffAuditEntry
from app.services.account_deletion import GRACE
from app.services.security_notices import not_me_hold_reason
from app.services.settlement import SettlementService
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = ["CustomerAdminService", "CustomerAction"]

CustomerAction = Literal["suspend", "reactivate", "close"]
#: Allowed moves: from status → (to status, audit action, session revoke reason).
_MOVES: dict[CustomerAction, tuple[tuple[str, ...], str, str, str | None]] = {
    "suspend": (("active",), "suspended", "customer_suspended", "account_suspended"),
    "reactivate": (("suspended",), "active", "customer_reactivated", None),
    "close": (("active", "suspended"), "closed", "customer_closed", "account_closed"),
}
INACTIVE_AFTER = timedelta(days=30)


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


class CustomerAdminService:
    def __init__(self, db: AsyncSession, clock: Any) -> None:
        self._db = db
        self._clock = clock

    # --- reading -------------------------------------------------------------------------

    def _rows(self) -> Select[Any]:
        name = (
            select(KycCase.legal_name)
            .where(KycCase.user_id == User.id, KycCase.status == "approved")
            .order_by(KycCase.decided_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        kyc = (
            select(KycCase.status)
            .where(KycCase.user_id == User.id)
            .order_by(KycCase.created_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        last_login = (
            select(func.max(AuthSession.created_at))
            .where(AuthSession.user_id == User.id)
            .scalar_subquery()
        )
        return select(
            User.id,
            User.email,
            User.phone,
            User.status,
            User.created_at,
            name.label("name"),
            kyc.label("kyc_status"),
            last_login.label("last_login_at"),
            User.deletion_requested_at,
            User.deleted_at,
        ).where(User.status != "pending_verification")

    async def list(
        self,
        principal: StaffPrincipal,
        *,
        search: str | None,
        status_in: str | None,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        if not principal.can("users.read"):
            raise forbidden()
        compliance = principal.can("kyc.read")
        q = self._rows()
        if status_in:
            q = q.where(User.status == status_in)
        if search:
            like = f"%{search.strip().lower()}%"
            digits = "".join(ch for ch in search if ch.isdigit())
            name_match = select(KycCase.id).where(
                KycCase.user_id == User.id,
                KycCase.status == "approved",
                func.lower(KycCase.legal_name).like(like),
            )
            conditions = [User.email.like(like), name_match.exists()]
            if len(digits) >= 4:
                conditions.append(User.phone.like(f"%{digits}%"))
            q = q.where(or_(*conditions))
            if not compliance:
                q = q.where(User.deletion_requested_at.is_(None))
        total = await self._db.scalar(select(func.count()).select_from(q.subquery()))
        rows = (
            await self._db.execute(
                q.order_by(User.created_at.desc(), User.id).offset(offset).limit(limit)
            )
        ).all()
        await self._db.rollback()
        return {
            "total": int(total or 0),
            "items": [self._item(r, compliance) for r in rows],
        }

    @staticmethod
    def _item(r: Any, compliance: bool) -> dict[str, Any]:
        hidden = r.deletion_requested_at is not None and not compliance
        return {
            "id": r.id,
            "ref": str(r.id).split("-")[0].upper(),
            "name": None if hidden else r.name,
            "email": None if hidden else r.email,
            "phone": None if hidden else r.phone,
            "status": r.status,
            "kyc_status": None if hidden else r.kyc_status,
            "created_at": r.created_at,
            "last_login_at": r.last_login_at,
            # ADR-095: "deleting" (restorable until), "deleted", or none.
            "deletion": (
                None
                if r.deletion_requested_at is None
                else {
                    "state": "deleted" if r.deleted_at is not None else "deleting",
                    "requested_at": r.deletion_requested_at,
                    "restore_until": r.deletion_requested_at + GRACE,
                }
            ),
        }

    async def stats(self, principal: StaffPrincipal) -> dict[str, int]:
        if not principal.can("users.read"):
            raise forbidden()
        since = self._clock() - INACTIVE_AFTER
        recent = select(AuthSession.id).where(
            AuthSession.user_id == User.id, AuthSession.last_active_at >= since
        )
        finished = User.status != "pending_verification"
        total = await self._db.scalar(select(func.count()).where(finished))
        active = await self._db.scalar(
            select(func.count()).where(User.status == "active", recent.exists())
        )
        inactive = await self._db.scalar(
            select(func.count()).where(User.status == "active", ~recent.exists())
        )
        suspended = await self._db.scalar(select(func.count()).where(User.status == "suspended"))
        kyc = await self._db.scalar(
            select(func.count(func.distinct(KycCase.user_id))).where(
                KycCase.status.in_(("pending_documents", "under_review"))
            )
        )
        await self._db.rollback()
        return {
            "total": int(total or 0),
            "active_30_days": int(active or 0),
            "inactive_30_days": int(inactive or 0),
            "suspended": int(suspended or 0),
            "kyc_waiting": int(kyc or 0),
        }

    # --- changing ------------------------------------------------------------------------

    async def change(
        self,
        principal: StaffPrincipal,
        user_id: uuid.UUID,
        action: CustomerAction,
        reason: str,
        info: RequestInfo,
    ) -> dict[str, Any]:
        if not principal.is_super_admin:
            raise forbidden()
        reason = " ".join(reason.split())
        if not 5 <= len(reason) <= 300:
            raise _err(
                "VAL_422_MISSING_FIELD",
                "Write the reason (5 to 300 characters).",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                {"field": "reason"},
            )
        allowed_from, to, audit_action, revoke = _MOVES[action]
        user = await self._db.get(User, user_id, with_for_update=True)
        if user is None or user.status == "pending_verification":
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That customer was not found.", 404)
        before = user.status
        if before not in allowed_from:
            await self._db.rollback()
            raise _err(
                "RES_409_INVALID_STATE",
                "This customer's account can't be changed that way now.",
                status.HTTP_409_CONFLICT,
                {"status": before},
            )
        now: datetime = self._clock()
        user.status = to
        if revoke is not None:
            # Every session ends now; refresh tokens die with their session.
            await self._db.execute(
                update(AuthSession)
                .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
                .values(revoked_at=now, revoke_reason=revoke)
            )
        released = 0
        if action == "reactivate":
            # ADR-084: a freeze from a "this wasn't me" report held the customer's deals; staff
            # switching the account back on lets them go on (or still expire unpaid).
            released = await SettlementService(self._db, self._clock, None).release_customer_holds(
                user_id, not_me_hold_reason(user_id)
            )
        detail: dict[str, Any] = {"from": before, "to": to, "reason": reason}
        if released:
            detail["deals_released"] = released
        self._db.add(
            StaffAuditEntry(
                at=now,
                staff_id=principal.staff_id,
                action=audit_action,
                target_type="customer",
                target_id=str(user_id),
                detail=detail,
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )
        await self._db.commit()
        return {"id": user_id, "status": to}
