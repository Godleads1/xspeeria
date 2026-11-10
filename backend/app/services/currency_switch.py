"""Currency on/off switches — ADR-106 (owner 2026-11-10).

* **Who:** one Super Admin ("One Super Admin"), with a reason; recorded here and in the staff
  audit log.
* **Off means** ("Hide offers, finish deals"): the currency has no rate limit in force, so its
  offers leave the market, can't be taken, queued for or re-priced, and no new offers or
  payout accounts in it can be made. Deals already matched finish as normal.
* **China** ("Both must be on"): the yuan needs this switch **and** the server's
  ``CHINA_ENABLED`` legal lock (ADR-105). The switch can't turn it on while the lock is off,
  and the routes keep refusing it.
* Naira can't be switched off (every deal has a naira side).
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.domain.offer_rules import AFRICAN, FOREIGN
from app.models.currency_switch import CurrencySwitch
from app.models.staff import StaffAuditEntry
from app.services.staff import RequestInfo, StaffPrincipal

__all__ = [
    "DEFAULT_OFF",
    "CurrencySwitchService",
    "default_off",
    "refuse_if_switched_off",
    "switched_off",
]

#: Off until a Super Admin switches them on (and, for the yuan, CHINA_ENABLED is on).
DEFAULT_OFF = frozenset({"CNY"})


def default_off() -> frozenset[str]:
    """ADR-107 (owner 2026-11-10: "On for testing, off when live"): on the live server the
    African currencies also start off, until a Super Admin switches each one on."""
    if get_settings().app_env == "production":
        return DEFAULT_OFF | AFRICAN
    return DEFAULT_OFF


async def switched_off(db: AsyncSession) -> frozenset[str]:
    """The built-in foreign currencies that are off right now."""
    result = await db.execute(select(CurrencySwitch.currency, CurrencySwitch.enabled))
    rows = {c: on for c, on in result.all()}
    off = default_off()
    return frozenset(c for c in FOREIGN if not rows.get(c, c not in off))


async def refuse_if_switched_off(db: AsyncSession, *codes: str | None) -> None:
    """403 when any of ``codes`` is a currency switched off (the caller rolls nothing back)."""
    off = await switched_off(db)
    hit = next((c.upper() for c in codes if c and c.upper() in off), None)
    if hit is not None:
        await db.rollback()
        raise AppError(
            "BUS_403_NOT_AVAILABLE",
            f"{hit} isn't available right now.",
            status_code=status.HTTP_403_FORBIDDEN,
        )


def _err(code: str, message: str, status_code: int) -> AppError:
    return AppError(code, message, status_code=status_code)


class CurrencySwitchService:
    def __init__(
        self, db: AsyncSession, clock: Callable[[], datetime], china_enabled: bool
    ) -> None:
        self._db, self._clock, self._china = db, clock, china_enabled

    def _need_super(self, principal: StaffPrincipal) -> None:
        if not principal.is_super_admin:
            raise _err(
                "ADMIN_403_SUPER_ADMIN_ONLY",
                "Only a Super Admin can do this.",
                status.HTTP_403_FORBIDDEN,
            )

    async def list(self, principal: StaffPrincipal) -> list[dict[str, Any]]:
        """Every built-in currency, naira first. Any staff member may look."""
        rows = {r.currency: r for r in (await self._db.scalars(select(CurrencySwitch))).all()}
        off = await switched_off(self._db)
        out: list[dict[str, Any]] = [
            {
                "currency": "NGN",
                "enabled": True,
                "locked": "naira",
                "reason": None,
                "changed_at": None,
            }
        ]
        for c in sorted(FOREIGN):
            r = rows.get(c)
            out.append(
                {
                    "currency": c,
                    "enabled": c not in off,
                    # ADR-105: the yuan also needs CHINA_ENABLED on the server.
                    "locked": "china" if c == "CNY" and not self._china else None,
                    "reason": r.reason if r else None,
                    "changed_at": r.changed_at if r else None,
                }
            )
        return out

    async def set(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        currency: str,
        enabled: bool,
        reason: str,
    ) -> dict[str, Any]:
        self._need_super(principal)
        c = currency.upper()
        reason = " ".join(reason.split())
        if not 5 <= len(reason) <= 300:
            raise _err(
                "VAL_422_MISSING_FIELD",
                "Write the reason (5 to 300 characters).",
                status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        if c == "NGN":
            raise _err(
                "RES_409_INVALID_STATE",
                "Naira can't be switched off: every deal has a naira side.",
                status.HTTP_409_CONFLICT,
            )
        if c not in FOREIGN:
            raise _err("RES_404_NOT_FOUND", "That currency isn't built in.", 404)
        if enabled and c == "CNY" and not self._china:
            raise _err(
                "RES_409_INVALID_STATE",
                "The yuan stays off until China is cleared (CHINA_ENABLED on the server).",
                status.HTTP_409_CONFLICT,
            )
        now = self._clock()
        row = await self._db.get(CurrencySwitch, c, with_for_update=True)
        if row is None:
            row = CurrencySwitch(currency=c)
            self._db.add(row)
        row.enabled, row.reason, row.changed_at = enabled, reason, now
        row.changed_by_staff_id = principal.staff_id
        self._db.add(
            StaffAuditEntry(
                at=now,
                staff_id=principal.staff_id,
                action="currency_switched_on" if enabled else "currency_switched_off",
                target_type="currency",
                target_id=c,
                detail={"reason": reason},
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )
        await self._db.commit()
        return {"currency": c, "enabled": enabled}
