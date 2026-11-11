"""Help requests from people who can't log in — ADR-103 (owner 2026-11-09).

**Customer side (no log-in).** The "Need help?" form sends phone, email and a first message.
The answer is the same whether or not an account has that phone (no account discovery): a
request id and a private key (256 random bits) the phone keeps. Reading the thread or replying
needs the id **and** the key; only the key's SHA-256 is stored, compared in constant time.
A customer can't send more than ``MAX_UNANSWERED`` messages in a row without a staff reply,
nor write to a closed request.

**Staff side (admin console).** ``disputes.read`` lists and opens requests; ``disputes.update``
replies and closes. Staff see the phone and email as typed and, when the phone matches an
account, that account and whether the typed email matches its email too. Every reply and
close is in the staff audit log. Nothing proves who wrote the form: the approved procedure
says staff never confirm or share account details in it.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.domain.auth_rules import normalise_email, normalise_phone
from app.models.help import HelpMessage, HelpRequest
from app.models.identity import User
from app.models.staff import StaffAuditEntry
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = ["CLOSED_KEPT_FOR", "MAX_UNANSWERED", "HelpService", "HelpThread", "NewHelpRequest"]

#: Customer messages in a row before staff must answer.
MAX_UNANSWERED = 5

#: Owner 2026-11-10: "it must be deleted on 12 hours". A closed request (phone, email and every
#: message) is deleted this long after closing; the database refuses anything sooner (0052).
CLOSED_KEPT_FOR = timedelta(hours=12)


def _err(code: str, message: str, status_code: int) -> AppError:
    return AppError(code, message, status_code=status_code)


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _not_found() -> AppError:
    # The same answer for "no such request" and "wrong key".
    return _err("RES_404_NOT_FOUND", "That help request was not found.", 404)


@dataclass(frozen=True)
class NewHelpRequest:
    request_id: uuid.UUID
    key: str


@dataclass(frozen=True)
class HelpThread:
    request_id: uuid.UUID
    status: str
    messages: list[dict[str, Any]]


class HelpService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db, self._clock = db, clock

    # --- customer (no log-in) ------------------------------------------------------------

    async def open(self, phone: str, email: str, message: str) -> NewHelpRequest:
        p, e = normalise_phone(phone), normalise_email(email)
        if p is None:
            raise _err("VAL_422_INVALID_FIELD", "Enter a valid phone number.", 422)
        if e is None:
            raise _err("VAL_422_INVALID_FIELD", "Enter a valid email address.", 422)
        now = self._clock()
        matched = await self._db.scalar(select(User.id).where(User.phone == p))
        key = secrets.token_urlsafe(32)
        req = HelpRequest(
            id=uuid.uuid4(),
            phone=p,
            email=e,
            matched_user_id=matched,
            key_hash=_hash(key),
            status="open",
            created_at=now,
            last_message_at=now,
        )
        self._db.add(req)
        await self._db.flush()
        self._db.add(self._message(req.id, "customer", None, message, now))
        await self._db.commit()
        return NewHelpRequest(req.id, key)

    async def _by_key(self, request_id: uuid.UUID, key: str) -> HelpRequest:
        req = await self._db.get(HelpRequest, request_id)
        if req is None or not hmac.compare_digest(req.key_hash, _hash(key)):
            raise _not_found()
        return req

    async def thread(self, request_id: uuid.UUID, key: str) -> HelpThread:
        req = await self._by_key(request_id, key)
        rows = await self._messages(req.id)
        return HelpThread(
            req.id,
            req.status,
            [
                {
                    "message_id": str(m.id),
                    "author": "you" if m.author == "customer" else "staff",
                    "body": m.body,
                    "created_at": m.created_at,
                }
                for m in rows
            ],
        )

    async def customer_reply(self, request_id: uuid.UUID, key: str, body: str) -> None:
        req = await self._by_key(request_id, key)
        if req.status != "open":
            raise _err(
                "BUS_409_HELP_CLOSED",
                "This request is closed. Please send a new one if you still need help.",
                409,
            )
        rows = await self._messages(req.id)
        unanswered = 0
        for m in reversed(rows):
            if m.author == "staff":
                break
            unanswered += 1
        if unanswered >= MAX_UNANSWERED:
            raise _err(
                "BUS_429_HELP_WAIT",
                "Please wait for our team to answer before sending more.",
                429,
            )
        now = self._clock()
        self._db.add(self._message(req.id, "customer", None, body, now))
        req.last_message_at = now
        await self._db.commit()

    # --- staff ---------------------------------------------------------------------------

    def _need(self, principal: StaffPrincipal, permission: str) -> None:
        if not principal.can(permission):
            raise forbidden()

    async def list_requests(
        self, principal: StaffPrincipal, status: str | None
    ) -> list[dict[str, Any]]:
        self._need(principal, "disputes.read")
        q = select(HelpRequest).order_by(HelpRequest.last_message_at.desc()).limit(200)
        if status is not None:
            q = q.where(HelpRequest.status == status)
        reqs = list((await self._db.scalars(q)).all())
        counts: dict[uuid.UUID, int] = {}
        if reqs:
            rows = await self._db.execute(
                select(HelpMessage.request_id, func.count())
                .where(HelpMessage.request_id.in_([r.id for r in reqs]))
                .group_by(HelpMessage.request_id)
            )
            counts = {rid: int(n) for rid, n in rows.all()}
        return [await self._summary(r, counts.get(r.id, 0)) for r in reqs]

    async def _summary(self, r: HelpRequest, messages: int) -> dict[str, Any]:
        account_email = (
            await self._db.scalar(select(User.email).where(User.id == r.matched_user_id))
            if r.matched_user_id
            else None
        )
        return {
            "request_id": str(r.id),
            "phone": r.phone,
            "email": r.email,
            "status": r.status,
            "created_at": r.created_at,
            "last_message_at": r.last_message_at,
            "messages": messages,
            "matched_user_id": str(r.matched_user_id) if r.matched_user_id else None,
            "email_matches_account": account_email is not None and account_email == r.email,
        }

    async def detail(self, principal: StaffPrincipal, request_id: uuid.UUID) -> dict[str, Any]:
        self._need(principal, "disputes.read")
        r = await self._db.get(HelpRequest, request_id)
        if r is None:
            raise _not_found()
        rows = await self._messages(r.id)
        out = await self._summary(r, len(rows))
        out["thread"] = [
            {
                "message_id": str(m.id),
                "author": m.author,
                "staff_id": str(m.staff_id) if m.staff_id else None,
                "body": m.body,
                "created_at": m.created_at,
            }
            for m in rows
        ]
        return out

    async def staff_reply(
        self, principal: StaffPrincipal, info: RequestInfo, request_id: uuid.UUID, body: str
    ) -> None:
        self._need(principal, "disputes.update")
        r = await self._db.get(HelpRequest, request_id)
        if r is None:
            raise _not_found()
        if r.status != "open":
            raise _err("BUS_409_HELP_CLOSED", "This request is closed.", 409)
        now = self._clock()
        self._db.add(self._message(r.id, "staff", principal.staff_id, body, now))
        r.last_message_at = now
        self._audit(principal, info, "help_replied", r.id, now)
        await self._db.commit()

    async def close(
        self, principal: StaffPrincipal, info: RequestInfo, request_id: uuid.UUID
    ) -> None:
        self._need(principal, "disputes.update")
        r = await self._db.get(HelpRequest, request_id)
        if r is None:
            raise _not_found()
        if r.status == "closed":
            return  # already closed: nothing to change (idempotent)
        now = self._clock()
        r.status, r.closed_at, r.closed_by_staff_id = "closed", now, principal.staff_id
        self._audit(principal, info, "help_closed", r.id, now)
        await self._db.commit()

    # --- retention -----------------------------------------------------------------------

    async def purge_closed(self) -> int:
        """Delete requests closed at least 12 hours ago, with their messages; returns how many.

        Open requests are never deleted, however old. Run by the hourly clean-up job.
        """
        cutoff = self._clock() - CLOSED_KEPT_FOR
        result = await self._db.execute(
            delete(HelpRequest).where(
                HelpRequest.status == "closed", HelpRequest.closed_at <= cutoff
            )
        )
        await self._db.commit()
        return int(getattr(result, "rowcount", 0) or 0)

    # --- helpers -------------------------------------------------------------------------

    async def _messages(self, request_id: uuid.UUID) -> list[HelpMessage]:
        return list(
            (
                await self._db.scalars(
                    select(HelpMessage)
                    .where(HelpMessage.request_id == request_id)
                    .order_by(HelpMessage.created_at, HelpMessage.id)
                )
            ).all()
        )

    @staticmethod
    def _message(
        request_id: uuid.UUID, author: str, staff_id: uuid.UUID | None, body: str, now: datetime
    ) -> HelpMessage:
        return HelpMessage(
            id=uuid.uuid4(),
            request_id=request_id,
            author=author,
            staff_id=staff_id,
            body=body,
            created_at=now,
        )

    def _audit(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        action: str,
        target: uuid.UUID,
        now: datetime,
    ) -> None:
        self._db.add(
            StaffAuditEntry(
                at=now,
                staff_id=principal.staff_id,
                action=action,
                target_type="help_request",
                target_id=str(target),
                detail=None,
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )
