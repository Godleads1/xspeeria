"""Phone push — Milestone N-3 (ADR-052).

* ``PushTokenService``: the app registers this phone's push token for its signed-in session,
  or removes it.
* ``PushDispatcher``: sends each new in-app notification (ADR-044) to the user's phones. A
  notification is pushed at most once (a ``push_deliveries`` row is written in the same
  transaction), only to tokens whose session is still live, and only while it is fresh: one
  that waited longer than ``FRESH_FOR`` (server or push service down) stays in-app only.

Push words are English for now (languages work replaces them). They never contain names,
amounts or account numbers: they show on a locked screen.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timedelta

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.identity import AuthSession
from app.models.notifications import Notification, PushDelivery, PushToken
from app.providers.push import PushMessage, PushSender
from app.services.auth import Principal

__all__ = ["FRESH_FOR", "PUSH_COPY", "PushDispatcher", "PushTokenService"]

_logger = get_logger(__name__)

FRESH_FOR = timedelta(hours=1)
ROUND = 200

#: event -> (title, body). Mirrors the app's notification words (notificationCopy.ts).
PUSH_COPY: dict[str, tuple[str, str]] = {
    "kyc.approved": ("Identity verified", "Your identity check passed. You can trade now."),
    "kyc.rejected": ("Identity check not passed", "Open your identity check to see why."),
    "kyc.in_review": ("Identity check in review", "We will let you know the result."),
    "kyc.expired": ("Identity check expired", "Verify your identity again to keep trading."),
    "match.created": ("Someone took your offer", "Choose where you will receive your money."),
    "settlement.awaiting_funding": ("Time to pay in", "Pay into escrow to complete your deal."),
    "settlement.releasing": ("Both sides have paid", "Your money is on its way."),
    "settlement.completed": ("Deal complete", "Your money has been paid out."),
    "settlement.cancelled": ("Deal cancelled", "This deal was cancelled before money moved."),
    "settlement.unwinding": ("Refund under way", "Any money paid in is being returned."),
    "settlement.refunded": ("Refund complete", "Any money paid in has been returned."),
    "dispute.opened": (
        "A deal is under review",
        "The other side reported a problem. Open Xspeeria.",
    ),
    "queue.your_turn": (
        "It’s your turn",
        "The offer you waited for is free. Take it within 5 minutes.",
    ),
}


class PushTokenService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db, self._clock = db, clock

    async def register(self, principal: Principal, token: str, platform: str) -> None:
        """Point this token at my current session. A token another session or account held
        moves here (the phone changed hands or logged in again)."""
        now = self._clock()
        row = (
            await self._db.execute(
                select(PushToken).where(PushToken.token == token).with_for_update()
            )
        ).scalar_one_or_none()
        if row is None:
            self._db.add(
                PushToken(
                    id=uuid.uuid4(),
                    user_id=principal.user_id,
                    session_id=principal.session_id,
                    token=token,
                    platform=platform,
                    created_at=now,
                )
            )
        else:
            row.user_id = principal.user_id
            row.session_id = principal.session_id
            row.platform = platform
            row.created_at = now
            row.disabled_at = None
        await self._db.commit()

    async def remove(self, principal: Principal) -> None:
        """Stop pushes to this session's phone (the user turned notifications off)."""
        now = self._clock()
        await self._db.execute(
            update(PushToken)
            .where(
                PushToken.session_id == principal.session_id,
                PushToken.user_id == principal.user_id,
                PushToken.disabled_at.is_(None),
            )
            .values(disabled_at=now)
        )
        await self._db.commit()


class PushDispatcher:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime], sender: PushSender) -> None:
        self._db, self._clock, self._sender = db, clock, sender

    async def run_once(self) -> int:
        """Push the fresh notifications nobody has pushed yet. Returns how many were handled.

        On a transport failure nothing is recorded, so the next round tries again.
        """
        now = self._clock()
        pending = (
            (
                await self._db.execute(
                    select(Notification)
                    .outerjoin(PushDelivery, PushDelivery.notification_id == Notification.id)
                    .where(
                        PushDelivery.notification_id.is_(None),
                        Notification.created_at > now - FRESH_FOR,
                        Notification.read_at.is_(None),
                    )
                    .order_by(Notification.seq)
                    .limit(ROUND)
                    .with_for_update(of=Notification, skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
        if not pending:
            await self._db.rollback()
            return 0
        users = {n.user_id for n in pending}
        tokens = (
            (
                await self._db.execute(
                    select(PushToken)
                    .join(AuthSession, AuthSession.id == PushToken.session_id)
                    .where(
                        PushToken.user_id.in_(users),
                        PushToken.disabled_at.is_(None),
                        and_(
                            AuthSession.user_id == PushToken.user_id,
                            AuthSession.revoked_at.is_(None),
                            AuthSession.expires_at > now,
                        ),
                    )
                )
            )
            .scalars()
            .all()
        )
        by_user: dict[uuid.UUID, list[PushToken]] = {}
        for t in tokens:
            by_user.setdefault(t.user_id, []).append(t)

        messages: list[PushMessage] = []
        owners: list[PushToken] = []
        for n in pending:
            event = str(n.payload.get("event", ""))
            title, body = PUSH_COPY.get(event, ("Xspeeria", "Open Xspeeria for details."))
            data = {
                "notification_id": str(n.id),
                "event": event,
                "data": n.payload.get("data", {}),
            }
            for t in by_user.get(n.user_id, []):
                messages.append(PushMessage(token=t.token, title=title, body=body, data=data))
                owners.append(t)

        result = await self._sender.send(messages) if messages else None
        if result is not None:
            for token, outcome in zip(owners, result.outcomes, strict=False):
                if outcome == "unregistered":
                    token.disabled_at = now
        for n in pending:
            count = len(by_user.get(n.user_id, []))
            self._db.add(
                PushDelivery(
                    notification_id=n.id,
                    state="sent" if count else "no_device",
                    devices=count,
                    handled_at=now,
                )
            )
        await self._db.commit()
        _logger.info("push_round", extra={"notifications": len(pending), "messages": len(messages)})
        return len(pending)
