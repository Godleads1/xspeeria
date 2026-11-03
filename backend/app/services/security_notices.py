"""Security notice emails and the "this wasn't me" link — ADR-084 (owner 2026-11-02).

Owner: "for every login, and important process done on the app, xspeeria sends email to
notifies the users and add if you are not the one raise a fraud. this trigger an alert and the
admin can switch one the user accounts." Answers (2026-11-02): every log-in, account changes,
payout accounts and deals; a link in the email; reporting freezes the account at once.

* ``app.core.activity.notice_for`` turns an activity-log row (ADR-073) of one of
  ``NOTICE_KINDS`` into a notice row, added to the same transaction as the activity row.
* :class:`SecurityNoticeSender` (background job) emails each notice once, with a one-time
  link. The token is made at send time; only its SHA-256 is stored. A failed send is tried
  again (new link) up to ``MAX_ATTEMPTS`` times.
* :class:`NotMeService` is behind the link. Opening the link changes nothing (mail scanners
  open links); pressing the button on that page freezes the account: status ``suspended``,
  every session and trusted phone ended, a RISK hold on each deal not yet released, a high
  fraud alert, and a confirmation email. Staff switch it back on (Super Admin, Customers ›
  Reactivate), which also lifts those holds.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import activity
from app.core.activity import NOTICE_KINDS, notice_for
from app.core.logging import get_logger
from app.models.identity import AuthSession, TrustedDevice, User
from app.models.security_notices import SecurityNotice
from app.providers.email import ALERT_TEXT, EmailSender
from app.services.fraud import FraudService
from app.services.settlement import SettlementService

__all__ = [
    "MAX_ATTEMPTS",
    "NOTICE_KINDS",
    "REPORT_PATH",
    "TOKEN_LIFE",
    "NotMeService",
    "ReportOutcome",
    "SecurityNoticeSender",
    "not_me_hold_reason",
    "notice_for",
]

_logger = get_logger(__name__)


#: The confirmation after a report. No link in it.
FROZEN = "account_frozen"
#: Emails with no "this wasn't me" link: the account is already frozen, or already closed
#: by a deletion (ADR-095; the email says how to restore it instead).
NO_LINK = frozenset({FROZEN, "account_deletion_requested"})

REPORT_PATH = "/api/v1/security/not-me/"
TOKEN_LIFE = timedelta(days=7)
MAX_ATTEMPTS = 5
RETRY_AFTER = timedelta(minutes=2)
#: Notices are deleted after this (a link lasts 7 days); the activity log and any fraud
#: alert keep the facts.
KEEP_FOR = timedelta(days=30)
BATCH = 50

_TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def not_me_hold_reason(user_id: uuid.UUID) -> str:
    """The reason on the RISK holds of one customer's freeze; reactivation closes exactly
    these (the other party may have frozen their own account too)."""
    return f"account frozen after a 'not me' report ({user_id})"


class SecurityNoticeSender:
    """Background job: send due notices. Never holds a database transaction open while
    talking to the email service (L-19)."""

    def __init__(
        self,
        db: AsyncSession,
        clock: Callable[[], datetime],
        email: EmailSender,
        public_api_url: str,
    ) -> None:
        self._db, self._clock, self._email = db, clock, email
        self._base = public_api_url.rstrip("/")

    async def run_once(self) -> int:
        now = self._clock()
        due = (
            await self._db.execute(
                select(SecurityNotice, User.email)
                .join(User, User.id == SecurityNotice.user_id)
                .where(
                    SecurityNotice.sent_at.is_(None),
                    SecurityNotice.gave_up_at.is_(None),
                    or_(SecurityNotice.next_try_at.is_(None), SecurityNotice.next_try_at <= now),
                )
                .order_by(SecurityNotice.created_at)
                .limit(BATCH)
                .with_for_update(of=SecurityNotice, skip_locked=True)
            )
        ).all()
        work: list[tuple[uuid.UUID, str, str, str | None, str | None, int]] = []
        for notice, email in due:
            notice.attempts += 1
            notice.next_try_at = now + RETRY_AFTER * notice.attempts
            link: str | None = None
            if notice.kind not in NO_LINK:
                token = secrets.token_urlsafe(32)
                notice.token_hash = _hash(token)
                notice.token_expires_at = now + TOKEN_LIFE
                link = f"{self._base}{REPORT_PATH}{token}"
            work.append((notice.id, email, notice.kind, notice.device, link, notice.attempts))
        await self._db.commit()

        sent = 0
        for notice_id, email, kind, device, link, attempts in work:
            try:
                await self._email.send_alert(email, kind, device, link)
            except Exception as exc:  # noqa: BLE001 - one failure must not stop the others
                _logger.error(
                    "security_notice_not_sent",
                    extra={"notice_id": str(notice_id), "error": type(exc).__name__},
                )
                if attempts >= MAX_ATTEMPTS:
                    await self._db.execute(
                        update(SecurityNotice)
                        .where(SecurityNotice.id == notice_id)
                        .values(gave_up_at=now, token_hash=None, token_expires_at=None)
                    )
                    await self._db.commit()
                continue
            await self._db.execute(
                update(SecurityNotice).where(SecurityNotice.id == notice_id).values(sent_at=now)
            )
            await self._db.commit()
            sent += 1

        await self._db.execute(
            delete(SecurityNotice).where(SecurityNotice.created_at < now - KEEP_FOR)
        )
        await self._db.commit()
        return sent


ReportOutcome = Literal["ask", "frozen", "already", "invalid"]


class NotMeService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db, self._clock = db, clock

    async def _find(self, token: str, *, lock: bool) -> SecurityNotice | None:
        if not _TOKEN.fullmatch(token):
            return None
        q = select(SecurityNotice).where(SecurityNotice.token_hash == _hash(token))
        if lock:
            q = q.with_for_update()
        notice = await self._db.scalar(q)
        if (
            notice is None
            or notice.token_expires_at is None
            or notice.token_expires_at <= self._clock()
        ):
            return None
        return notice

    async def look(self, token: str) -> tuple[ReportOutcome, str | None]:
        """Opening the link: changes nothing. Returns the outcome and the notice's subject."""
        notice = await self._find(token, lock=False)
        found = None if notice is None else (notice.kind, notice.reported_at is not None)
        await self._db.rollback()  # read before this: rows expire with the transaction
        if found is None:
            return "invalid", None
        kind, reported = found
        return ("already" if reported else "ask"), ALERT_TEXT.get(kind)

    async def report(self, token: str) -> ReportOutcome:
        """The button on that page: freeze the account. Safe to press twice."""
        notice = await self._find(token, lock=True)
        if notice is None:
            await self._db.rollback()
            return "invalid"
        if notice.reported_at is not None:
            await self._db.rollback()
            return "already"
        now = self._clock()
        user = await self._db.get(User, notice.user_id, with_for_update=True)
        if user is None:  # pragma: no cover - foreign key
            await self._db.rollback()
            return "invalid"
        notice.reported_at = now
        froze = user.status == "active"
        if froze:
            user.status = "suspended"
        await self._db.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now, revoke_reason="account_suspended")
        )
        await self._db.execute(
            update(TrustedDevice)
            .where(TrustedDevice.user_id == user.id, TrustedDevice.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        held = await SettlementService(self._db, self._clock, None).hold_for_customer(
            user.id, not_me_hold_reason(user.id)
        )
        await FraudService(self._db, self._clock).customer_reported_not_me(
            user.id,
            notice.id,
            {
                "kind": notice.kind,
                "device": notice.device,
                "notice_at": notice.created_at.isoformat(),
                "account_was": "active" if froze else user.status,
                "deals_held": held,
            },
        )
        self._db.add(
            activity.entry(
                user.id, "reported_not_me", "security", detail={"kind": notice.kind}, at=now
            )
        )
        self._db.add(
            SecurityNotice(
                id=uuid.uuid4(), user_id=user.id, kind=FROZEN, created_at=now, attempts=0
            )
        )
        await self._db.commit()
        _logger.warning(
            "customer_reported_not_me",
            extra={"user_id": str(user.id), "frozen": froze, "deals_held": held},
        )
        return "frozen"
