"""Service outage notices (ADR-066; owner 2026-10-26: "Show a notice only").

Permissions (checked here, from the database role, on every call):

* ``outages.read``   — the list.
* ``outages.create`` — report an outage (the app shows its notice from the start time).
* ``outages.update`` — change it, mark it in progress, or resolve it (the notice disappears).

A notice blocks nothing: trades, sign-in and payouts carry on. App users see only the service
name, the message, how serious it is and the times — never who reported it. Every change is in
the staff audit log; outages are never deleted.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.outages import OUTAGE_STATUSES, ServiceOutage
from app.models.staff import StaffAccount, StaffAuditEntry
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = ["OutageService", "active_notices", "ref"]


def ref(outage_id: uuid.UUID) -> str:
    return "#" + str(outage_id).split("-")[0].upper()


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


def _row(o: ServiceOutage, reporter: str | None, now: datetime) -> dict[str, Any]:
    end = o.resolved_at or now
    return {
        "id": o.id,
        "ref": ref(o.id),
        "service": o.service,
        "message": o.message,
        "severity": o.severity,
        "status": o.status,
        "started_at": o.started_at,
        "expected_end_at": o.expected_end_at,
        "resolved_at": o.resolved_at,
        # How long it has lasted so far (or lasted), in whole seconds; 0 before it starts.
        "duration_seconds": max(0, int((end - o.started_at).total_seconds())),
        "reported_by": reporter,
        "created_at": o.created_at,
        "updated_at": o.updated_at,
    }


async def active_notices(db: AsyncSession, now: datetime) -> list[dict[str, Any]]:
    """What signed-in app users see: started, not resolved. Most serious first."""
    rows = (
        await db.scalars(
            select(ServiceOutage)
            .where(ServiceOutage.status != "resolved", ServiceOutage.started_at <= now)
            .order_by(ServiceOutage.started_at.desc())
            .limit(5)
        )
    ).all()
    rank = {"high": 0, "medium": 1, "low": 2}
    out = [
        {
            "id": str(o.id),
            "service": o.service,
            "message": o.message,
            "severity": o.severity,
            "started_at": o.started_at.isoformat(),
            "expected_end_at": o.expected_end_at.isoformat() if o.expected_end_at else None,
        }
        for o in sorted(rows, key=lambda o: rank.get(o.severity, 3))
    ]
    await db.rollback()
    return out


class OutageService:
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
                target_type="outage",
                target_id=str(target),
                detail=detail,
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )

    @staticmethod
    def _check_times(started: datetime, expected_end: datetime | None) -> None:
        if expected_end is not None and expected_end <= started:
            raise _err(
                "VAL_422_INVALID_FIELD",
                "The expected end must be after the start.",
                422,
                {"field": "expected_end_at"},
            )

    async def list(
        self,
        principal: StaffPrincipal,
        *,
        search: str | None,
        status_in: str | None,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        self._need(principal, "outages.read")
        q = select(ServiceOutage, StaffAccount.name).join(
            StaffAccount, StaffAccount.id == ServiceOutage.created_by
        )
        if status_in in OUTAGE_STATUSES:
            q = q.where(ServiceOutage.status == status_in)
        if search:
            s = search.strip()
            conditions = [func.lower(ServiceOutage.service).like(f"%{s.lower()}%")]
            hexpart = s.upper().lstrip("#")
            if re.fullmatch(r"[0-9A-F]{4,8}", hexpart):
                conditions.append(func.upper(cast(ServiceOutage.id, String)).like(f"{hexpart}%"))
            q = q.where(or_(*conditions))
        total = await self._db.scalar(select(func.count()).select_from(q.subquery()))
        rows = (
            await self._db.execute(
                q.order_by(ServiceOutage.started_at.desc(), ServiceOutage.id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
        now = self._clock()
        items = [_row(o, who, now) for o, who in rows]
        await self._db.rollback()
        return {"now": now, "total": int(total or 0), "items": items}

    async def create(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        *,
        service: str,
        message: str,
        severity: str,
        started_at: datetime | None,
        expected_end_at: datetime | None,
    ) -> dict[str, Any]:
        self._need(principal, "outages.create")
        now = self._clock()
        started = started_at or now
        self._check_times(started, expected_end_at)
        o = ServiceOutage(
            id=uuid.uuid4(),
            service=service,
            message=message,
            severity=severity,
            status="open",
            started_at=started,
            expected_end_at=expected_end_at,
            created_by=principal.staff_id,
            created_at=now,
            updated_at=now,
        )
        self._db.add(o)
        await self._db.flush()
        self._audit(
            principal, info, "outage_reported", o.id, {"service": service, "severity": severity}
        )
        out = {"id": o.id, "ref": ref(o.id)}
        await self._db.commit()
        return out

    async def change(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        outage_id: uuid.UUID,
        *,
        changes: dict[str, Any],
    ) -> None:
        """Update the words, severity, times or status. Resolving sets the end time."""
        self._need(principal, "outages.update")
        o = await self._db.scalar(
            select(ServiceOutage).where(ServiceOutage.id == outage_id).with_for_update()
        )
        if o is None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That outage was not found.", 404)
        if o.status == "resolved":
            await self._db.rollback()
            raise _err(
                "RES_409_OUTAGE_RESOLVED",
                "This outage is already resolved.",
                status.HTTP_409_CONFLICT,
            )
        now = self._clock()
        started = changes.get("started_at", o.started_at)
        expected = changes.get("expected_end_at", o.expected_end_at)
        try:
            self._check_times(started, expected)
            if changes.get("status") == "resolved" and now < started:
                raise _err(
                    "VAL_422_INVALID_FIELD",
                    "An outage can't be resolved before it starts.",
                    422,
                    {"field": "status"},
                )
        except AppError:
            await self._db.rollback()
            raise
        for field in ("service", "message", "severity", "started_at", "expected_end_at"):
            if field in changes:
                setattr(o, field, changes[field])
        new_status = changes.get("status")
        if new_status is not None and new_status != o.status:
            o.status = new_status
            if new_status == "resolved":
                o.resolved_at = now
        o.updated_at = now
        action = "outage_resolved" if new_status == "resolved" else "outage_updated"
        self._audit(
            principal,
            info,
            action,
            o.id,
            {"fields": sorted(k for k in changes if k != "status"), "status": o.status},
        )
        await self._db.commit()
