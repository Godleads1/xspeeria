"""Delete account — ADR-095 (owner 2026-11-03; record keeping DEC-106; 14-day grace).

**Asking** (``request``; the route has already checked the PIN-backed second check,
step-up action ``account.delete``):

* Refused while anything is still open: a deal being prepared or settling, a dispute, a refund
  waiting for a decision, a fraud review, or an account that isn't active (frozen or suspended).
  The customer is told which, never the other party's details.
* Otherwise, at once and in one transaction: open offers and requests are withdrawn (nobody
  waits in their queues), the customer leaves every queue, every session ends, trusted phones,
  fingerprint keys and payout accounts are switched off, phone push stops, and the account is
  **closed** with ``deletion_requested_at``. An email says what happens and until when it can
  be undone.

**Restoring** (``AuthService.login`` with ``restore_account``): signing in with the PIN within
14 days reopens the account. The second check is still asked before a session. Payout
accounts and trusted phones are not brought back: the customer adds them again.

**After 14 days** (``purge_due``, the hourly clean-up job): the data with no legal reason to
keep is removed -- in-app notifications and their push delivery records, phone-push tokens, and
the names of the trusted phones (the rows stay, revoked: sign-in history refers to them) -- and
``deleted_at`` is set. Fingerprint keys live on the sessions, which ended at the request.

**Kept** (DEC-106): identity, identity-check results and ID images, payout accounts used,
deals, disputes, refunds and fraud alerts, 5 years from closing, for Compliance only; the staff
audit log and deal events 7 years; the activity log 5 years (ADR-073, enforced by the
database). Removing the personal details after 5 years is a later job (the first account
reaches it in 2031) and is listed in PENDING_ACTIONS.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import status
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity
from app.core.exceptions import AppError
from app.domain.settlement_rules import TERMINAL_PHASES
from app.models.disputes import Dispute
from app.models.fraud import FraudAlert
from app.models.identity import AuthSession, MfaFactor, TrustedDevice, User
from app.models.marketplace import Match, Offer, OfferQueueEntry
from app.models.notifications import Notification, PushDelivery, PushToken
from app.models.payouts import Beneficiary
from app.models.reversals import Reversal
from app.models.settlement import Settlement, SettlementLeg

__all__ = ["GRACE", "AccountDeletionService", "Blocker", "restore_until"]

#: Owner, 2026-11-03: "14 days" to undo.
GRACE = timedelta(days=14)

#: What stops a deletion, in the order the app explains them.
Blocker = Literal[
    "account_not_active", "deal_in_progress", "dispute_open", "refund_pending", "under_review"
]
_OPEN_OFFER = ("open", "partially_matched")
_QUEUE_ACTIVE = ("waiting", "notified")


def restore_until(user: User) -> datetime | None:
    if user.deletion_requested_at is None or user.deleted_at is not None:
        return None
    return user.deletion_requested_at + GRACE


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


class AccountDeletionService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    # --- what stops it ------------------------------------------------------------------

    def _my_settlements(self, user_id: uuid.UUID) -> Any:
        return select(SettlementLeg.settlement_id).where(
            or_(SettlementLeg.funder_user_id == user_id, SettlementLeg.payee_user_id == user_id)
        )

    async def blockers(self, user: User) -> list[Blocker]:
        uid = user.id
        found: list[Blocker] = []
        if user.status != "active":
            found.append("account_not_active")
        preparing = await self._db.scalar(
            select(Match.id)
            .join(Offer, Offer.id == Match.offer_id)
            .where(
                or_(Offer.user_id == uid, Match.counterparty_user_id == uid),
                Match.preparation_state == "awaiting_payout_accounts",
            )
            .limit(1)
        )
        settling = await self._db.scalar(
            select(Settlement.id)
            .where(
                Settlement.id.in_(self._my_settlements(uid)),
                Settlement.phase.not_in(tuple(TERMINAL_PHASES)),
            )
            .limit(1)
        )
        if preparing is not None or settling is not None:
            found.append("deal_in_progress")
        my_transactions = select(Settlement.transaction_id).where(
            Settlement.id.in_(self._my_settlements(uid))
        )
        dispute = await self._db.scalar(
            select(Dispute.id)
            .where(
                Dispute.kind == "dispute",
                Dispute.status != "resolved",
                or_(
                    Dispute.initiator_user_id == uid,
                    Dispute.transaction_id.in_(my_transactions),
                ),
            )
            .limit(1)
        )
        if dispute is not None:
            found.append("dispute_open")
        refund = await self._db.scalar(
            select(Reversal.id)
            .where(
                Reversal.status == "pending",
                Reversal.settlement_id.in_(self._my_settlements(uid)),
            )
            .limit(1)
        )
        if refund is not None:
            found.append("refund_pending")
        review = await self._db.scalar(
            select(FraudAlert.id)
            .where(FraudAlert.user_id == uid, FraudAlert.status != "resolved")
            .limit(1)
        )
        if review is not None:
            found.append("under_review")
        return found

    async def check(self, user_id: uuid.UUID) -> list[Blocker]:
        """What would stop a deletion now (the app shows it before asking for the PIN)."""
        user = await self._db.get(User, user_id)
        if user is None:  # pragma: no cover - a live session implies the user exists
            await self._db.rollback()
            return ["account_not_active"]
        found = await self.blockers(user)
        await self._db.rollback()
        return found

    # --- asking -------------------------------------------------------------------------

    async def request(self, user_id: uuid.UUID) -> datetime:
        """Close the account now; returns the last moment it can be restored. Commits."""
        user = await self._db.get(User, user_id, with_for_update=True)
        if user is None:  # pragma: no cover
            await self._db.rollback()
            raise _err("AUTH_401_UNAUTHORIZED", "Please log in again.", 401)
        found = await self.blockers(user)
        if found:
            await self._db.rollback()
            raise _err(
                "RES_409_ACCOUNT_DELETE_BLOCKED",
                "Your account can't be deleted yet: finish or close what is still open first.",
                status.HTTP_409_CONFLICT,
                {"blockers": found},
            )
        now = self._clock()
        # Open offers and requests leave the market; nobody waits for them.
        withdrawn = (
            await self._db.scalars(
                update(Offer)
                .where(Offer.user_id == user_id, Offer.status.in_(_OPEN_OFFER))
                .values(status="withdrawn", withdrawn_at=now, version=Offer.version + 1)
                .returning(Offer.id)
            )
        ).all()
        if withdrawn:
            await self._db.execute(
                update(OfferQueueEntry)
                .where(
                    OfferQueueEntry.offer_id.in_(withdrawn),
                    OfferQueueEntry.status.in_(_QUEUE_ACTIVE),
                )
                .values(status="ended", ended_at=now)
            )
        # They leave every queue they wait in.
        await self._db.execute(
            update(OfferQueueEntry)
            .where(OfferQueueEntry.user_id == user_id, OfferQueueEntry.status.in_(_QUEUE_ACTIVE))
            .values(status="left", ended_at=now)
        )
        await self._db.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now, revoke_reason="account_closed")
        )
        await self._db.execute(
            update(TrustedDevice)
            .where(TrustedDevice.user_id == user_id, TrustedDevice.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await self._db.execute(
            update(MfaFactor)
            .where(MfaFactor.user_id == user_id, MfaFactor.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await self._db.execute(
            update(Beneficiary)
            .where(Beneficiary.user_id == user_id, Beneficiary.removed_at.is_(None))
            .values(removed_at=now)
        )
        await self._db.execute(
            update(PushToken)
            .where(PushToken.user_id == user_id, PushToken.disabled_at.is_(None))
            .values(disabled_at=now)
        )
        user.status = "closed"
        user.deletion_requested_at = now
        until = now + GRACE
        row = activity.entry(
            user_id,
            "account_deletion_requested",
            "security",
            detail={"offers_withdrawn": len(withdrawn), "restore_until": until.isoformat()},
            at=now,
        )
        self._db.add(row)
        notice = activity.notice_for(row)
        if notice is not None:
            self._db.add(notice)
        await self._db.commit()
        return until

    # --- after 14 days ------------------------------------------------------------------

    async def purge_due(self, limit: int = 100) -> int:
        """Remove the data with no legal reason to keep, for accounts past the 14 days.
        Runs in the clean-up job (system scope). Commits per account."""
        now = self._clock()
        due = (
            await self._db.scalars(
                select(User.id)
                .where(
                    User.status == "closed",
                    User.deletion_requested_at.is_not(None),
                    User.deleted_at.is_(None),
                    User.deletion_requested_at <= now - GRACE,
                )
                .order_by(User.deletion_requested_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )
        ).all()
        done = 0
        for uid in due:
            # Marked first: the notifications guard allows deletes only for a deleted account.
            await self._db.execute(update(User).where(User.id == uid).values(deleted_at=now))
            mine = select(Notification.id).where(Notification.user_id == uid)
            await self._db.execute(
                delete(PushDelivery).where(PushDelivery.notification_id.in_(mine))
            )
            await self._db.execute(delete(Notification).where(Notification.user_id == uid))
            await self._db.execute(delete(PushToken).where(PushToken.user_id == uid))
            await self._db.execute(
                update(TrustedDevice)
                .where(TrustedDevice.user_id == uid)
                .values(device_id=None, user_agent=None)
            )
            self._db.add(activity.entry(uid, "account_deleted", "security", at=now))
            done += 1
        await self._db.commit()
        return done
