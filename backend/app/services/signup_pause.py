"""Pause sign-ups and text messages (B&A 39; security check, owner 2026-11-23: "go").

An emergency switch beside "Pause all deals" (ADR-075), for an attack on sign-up or a text-
message bill running up (SMS pumping). While a pause is open:

* new sign-ups are refused, and so is every text-message code: sign-up, PIN reset by text,
  phone change, and the text part of a code check (``SYS_503_SERVICE_UNAVAILABLE``, details
  ``{"reason": "signups_paused"}``);
* everything else keeps working: signing in with the PIN, the face check, email codes, deals.

Only a Super Admin (checked here on every call) can pause or resume, with a reason of 5–500
characters; both are in the staff audit log and raise a P1 alert for the other Super Admins
(``emergency_control_used``).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import TYPE_CHECKING, Any

from fastapi import status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.models.signup_pauses import SignupPause
from app.models.staff import StaffAuditEntry

if TYPE_CHECKING:  # the staff module imports auth, which uses the gate below
    from app.services.staff import RequestInfo, StaffPrincipal

__all__ = ["SignupPauseService", "refuse_if_signups_paused", "signups_paused"]

_logger = get_logger(__name__)


async def signups_paused(db: AsyncSession) -> bool:
    """Is a pause open right now? One indexed read."""
    return (
        await db.scalar(select(SignupPause.id).where(SignupPause.ended_at.is_(None)).limit(1))
    ) is not None


async def refuse_if_signups_paused(db: AsyncSession) -> None:
    if await signups_paused(db):
        await db.rollback()
        raise AppError(
            "SYS_503_SERVICE_UNAVAILABLE",
            "New sign-ups and text-message codes are paused for a short while for safety. "
            "Please try again later.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details={"reason": "signups_paused"},
        )


def _reason(text: str) -> str:
    clean = " ".join(text.split())
    if not 5 <= len(clean) <= 500:
        raise AppError(
            "VAL_422_MISSING_FIELD",
            "Give a reason (5 to 500 characters).",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            details={"field": "reason"},
        )
    return clean


def _view(p: SignupPause | None) -> dict[str, Any]:
    if p is None:
        return {"paused": False, "pause": None}
    return {
        "paused": p.ended_at is None,
        "pause": {
            "id": p.id,
            "started_at": p.started_at,
            "started_by": p.started_by,
            "reason": p.reason,
            "ended_at": p.ended_at,
            "ended_by": p.ended_by,
            "end_reason": p.end_reason,
        },
    }


class SignupPauseService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    def _need_super_admin(self, principal: StaffPrincipal) -> None:
        from app.services.staff import forbidden

        if not principal.is_super_admin:
            raise forbidden()

    def _audit(
        self, principal: StaffPrincipal, info: RequestInfo, action: str, row: SignupPause
    ) -> None:
        self._db.add(
            StaffAuditEntry(
                at=self._clock(),
                staff_id=principal.staff_id,
                action=action,
                target_type="signup_pause",
                target_id=str(row.id),
                detail={"reason": row.end_reason or row.reason},
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )

    async def status(self, principal: StaffPrincipal) -> dict[str, Any]:
        self._need_super_admin(principal)
        latest = await self._db.scalar(
            select(SignupPause).order_by(SignupPause.started_at.desc()).limit(1)
        )
        out = _view(latest)
        await self._db.rollback()
        return out

    async def pause(
        self, principal: StaffPrincipal, info: RequestInfo, reason: str
    ) -> dict[str, Any]:
        self._need_super_admin(principal)
        row = SignupPause(
            id=uuid.uuid4(),
            started_at=self._clock(),
            started_by=principal.staff_id,
            reason=_reason(reason),
        )
        self._db.add(row)
        try:
            await self._db.flush()
        except IntegrityError:
            await self._db.rollback()
            raise AppError(
                "RES_409_ALREADY_PAUSED",
                "Sign-ups are already paused.",
                status_code=status.HTTP_409_CONFLICT,
            ) from None
        self._audit(principal, info, "signups_paused", row)
        out = _view(row)
        await self._db.commit()
        _logger.warning("signups_paused", extra={"staff_id": str(principal.staff_id)})
        return out

    async def resume(
        self, principal: StaffPrincipal, info: RequestInfo, reason: str
    ) -> dict[str, Any]:
        self._need_super_admin(principal)
        why = _reason(reason)
        row = await self._db.scalar(
            select(SignupPause).where(SignupPause.ended_at.is_(None)).with_for_update()
        )
        if row is None:
            await self._db.rollback()
            raise AppError(
                "RES_409_NOT_PAUSED",
                "Sign-ups are not paused.",
                status_code=status.HTTP_409_CONFLICT,
            )
        row.ended_at = self._clock()
        row.ended_by = principal.staff_id
        row.end_reason = why
        self._audit(principal, info, "signups_resumed", row)
        out = _view(row)
        await self._db.commit()
        _logger.warning("signups_resumed", extra={"staff_id": str(principal.staff_id)})
        return out
