"""Adverts in the app's advert slot (ADR-067; ADR-056 decision 2).

Owner (2026-10-20): "the place advert here is done from the web admin, and then everyone using
the app sees it in that same location. the size must fit the advert placeholder."

Permissions (new ``adverts`` module; checked here, from the database role, on every call):
``adverts.read`` list and preview, ``adverts.create`` add, ``adverts.update`` change dates, link
or name, or switch on/off.

The picture: JPEG, PNG or WebP only (read from the file's own bytes, never SVG), at most 5 MB,
hidden details (camera data, GPS) removed (ADR-049 rules), and the shape of the app's slot
(342 × 113, within 3 %) at 342 pixels wide or more. It is kept in the object store, never in
PostgreSQL. The link must be https.

Which advert shows: switched on, inside its dates; if several, the one that started last.
"""

from __future__ import annotations

import base64
import binascii
import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.domain.image_rules import PhotoError, clean_photo, image_size
from app.models.adverts import Advert
from app.models.staff import StaffAccount, StaffAuditEntry
from app.providers.object_store import ObjectStore, new_key
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = [
    "MAX_SHOWING",
    "ROTATE_SECONDS",
    "SLOT_HEIGHT",
    "SLOT_WIDTH",
    "AdvertService",
    "advert_problem",
    "current_advert",
    "showing_adverts",
]

#: ADR-086 (owner 2026-11-03): several adverts can show; the app slides through them by itself.
#: Seconds each advert stays before the next slides in, and how many take turns at most (the
#: newest first). Starting values; changing them is an owner decision.
ROTATE_SECONDS = 5
MAX_SHOWING = 10

#: The app's advert slot (Figma node 787:4204; product owner's artwork 342 × 113).
SLOT_WIDTH = 342
SLOT_HEIGHT = 113
_RATIO = SLOT_WIDTH / SLOT_HEIGHT
_TOLERANCE = 0.03


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


def advert_problem(width: int, height: int) -> str | None:
    """Why a picture doesn't fit the app's slot, or ``None``. Pure."""
    if width < SLOT_WIDTH or height < SLOT_HEIGHT:
        return f"The picture must be at least {SLOT_WIDTH} × {SLOT_HEIGHT} pixels."
    if abs(width / height - _RATIO) / _RATIO > _TOLERANCE:
        return (
            f"The picture must have the slot's shape, {SLOT_WIDTH} × {SLOT_HEIGHT} "
            f"(for example 1026 × 339). This one is {width} × {height}."
        )
    return None


def _check_link(url: str | None) -> str | None:
    if url is None:
        return None
    url = url.strip()
    if not url:
        return None
    if not url.startswith("https://") or any(c in url for c in ' <>"\\\n\r\t'):
        raise _err(
            "VAL_422_INVALID_FIELD",
            "The link must be a full https:// address.",
            422,
            {"field": "link_url"},
        )
    return url


def _view(
    a: Advert, who: str | None, now: datetime, showing_ids: list[uuid.UUID]
) -> dict[str, Any]:
    in_dates = a.active and a.starts_at <= now < a.ends_at
    # ADR-086: inside its dates but past the newest MAX_SHOWING -> waiting for a free place.
    state = (
        ("showing" if a.id in showing_ids else "covered")
        if in_dates
        else ("off" if not a.active else ("ended" if now >= a.ends_at else "scheduled"))
    )
    return {
        "id": a.id,
        "name": a.name,
        "width": a.width,
        "height": a.height,
        "starts_at": a.starts_at,
        "ends_at": a.ends_at,
        "link_url": a.link_url,
        "active": a.active,
        "state": state,
        "position": showing_ids.index(a.id) + 1 if a.id in showing_ids else None,
        "created_by": who,
        "created_at": a.created_at,
        "updated_at": a.updated_at,
    }


async def showing_adverts(db: AsyncSession, now: datetime) -> list[Advert]:
    """ADR-086: the adverts the app slides through now: switched on, inside their dates, the
    newest start first, at most ``MAX_SHOWING``."""
    rows = await db.scalars(
        select(Advert)
        .where(Advert.active.is_(True), Advert.starts_at <= now, Advert.ends_at > now)
        .order_by(Advert.starts_at.desc(), Advert.created_at.desc())
        .limit(MAX_SHOWING)
    )
    return list(rows.all())


async def current_advert(db: AsyncSession, now: datetime) -> Advert | None:
    """The first advert of the rotation (older app builds show only this one)."""
    showing = await showing_adverts(db, now)
    return showing[0] if showing else None


class AdvertService:
    def __init__(
        self, db: AsyncSession, clock: Callable[[], datetime], store: ObjectStore | None
    ) -> None:
        self._db = db
        self._clock = clock
        self._store = store

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
                target_type="advert",
                target_id=str(target),
                detail=detail,
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )

    def _storage(self) -> ObjectStore:
        if self._store is None:
            raise _err(
                "SYS_503_SERVICE_UNAVAILABLE",
                "Picture storage is not set up on this server yet.",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return self._store

    @staticmethod
    def _picture(image_b64: str) -> tuple[bytes, str, int, int]:
        try:
            raw = base64.b64decode(image_b64, validate=True)
        except (binascii.Error, ValueError):
            raise _err(
                "VAL_422_INVALID_FIELD", "That file could not be read.", 422, {"field": "image"}
            ) from None
        try:
            cleaned, content_type = clean_photo(raw)
            width, height = image_size(cleaned)
        except PhotoError as exc:
            raise _err(
                "VAL_422_INVALID_FIELD",
                str(exc).replace("photo", "picture"),
                422,
                {"field": "image"},
            ) from None
        problem = advert_problem(width, height)
        if problem:
            raise _err("VAL_422_INVALID_FIELD", problem, 422, {"field": "image"})
        return cleaned, content_type, width, height

    @staticmethod
    def _check_dates(starts: datetime, ends: datetime) -> None:
        if ends <= starts:
            raise _err(
                "VAL_422_INVALID_FIELD",
                "The end date must be after the post date.",
                422,
                {"field": "ends_at"},
            )

    async def list(self, principal: StaffPrincipal) -> dict[str, Any]:
        self._need(principal, "adverts.read")
        rows = (
            await self._db.execute(
                select(Advert, StaffAccount.name)
                .join(StaffAccount, StaffAccount.id == Advert.created_by)
                .order_by(Advert.starts_at.desc(), Advert.created_at.desc())
                .limit(200)
            )
        ).all()
        now = self._clock()
        showing_ids = [a.id for a in await showing_adverts(self._db, now)]  # before the rollback
        items = [_view(a, who, now, showing_ids) for a, who in rows]
        total = await self._db.scalar(select(func.count(Advert.id)))
        await self._db.rollback()
        return {
            "now": now,
            "total": int(total or 0),
            "showing_id": showing_ids[0] if showing_ids else None,
            "showing_ids": showing_ids,
            "rotate_seconds": ROTATE_SECONDS,
            "max_showing": MAX_SHOWING,
            "slot": {"width": SLOT_WIDTH, "height": SLOT_HEIGHT},
            "items": items,
        }

    async def create(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        *,
        name: str,
        image_b64: str,
        starts_at: datetime,
        ends_at: datetime,
        link_url: str | None,
    ) -> dict[str, Any]:
        self._need(principal, "adverts.create")
        store = self._storage()
        self._check_dates(starts_at, ends_at)
        link = _check_link(link_url)
        data, content_type, width, height = self._picture(image_b64)
        now = self._clock()
        key = new_key("advert")
        store.put(key, data)
        a = Advert(
            id=uuid.uuid4(),
            name=name,
            image_key=key,
            content_type=content_type,
            width=width,
            height=height,
            starts_at=starts_at,
            ends_at=ends_at,
            link_url=link,
            active=True,
            created_by=principal.staff_id,
            created_at=now,
            updated_at=now,
        )
        self._db.add(a)
        self._audit(
            principal,
            info,
            "advert_created",
            a.id,
            {"name": name, "size": f"{width}x{height}", "link": link},
        )
        out = {"id": a.id}
        try:
            await self._db.commit()
        except Exception:
            store.delete(key)  # nothing points at it
            raise
        return out

    async def change(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        advert_id: uuid.UUID,
        changes: dict[str, Any],
    ) -> None:
        self._need(principal, "adverts.update")
        a = await self._db.scalar(select(Advert).where(Advert.id == advert_id).with_for_update())
        if a is None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That advert was not found.", 404)
        try:
            starts = changes.get("starts_at", a.starts_at)
            ends = changes.get("ends_at", a.ends_at)
            self._check_dates(starts, ends)
            if "link_url" in changes:
                changes["link_url"] = _check_link(changes["link_url"])
        except AppError:
            await self._db.rollback()
            raise
        new_image: tuple[bytes, str, int, int] | None = None
        if "image" in changes:
            store = self._storage()
            try:
                new_image = self._picture(changes.pop("image"))
            except AppError:
                await self._db.rollback()
                raise
        old_key = a.image_key
        new_key_value: str | None = None
        if new_image is not None:
            data, content_type, width, height = new_image
            new_key_value = new_key("advert")
            store.put(new_key_value, data)
            a.image_key, a.content_type, a.width, a.height = (
                new_key_value,
                content_type,
                width,
                height,
            )
        for field in ("name", "starts_at", "ends_at", "link_url", "active"):
            if field in changes:
                setattr(a, field, changes[field])
        a.updated_at = self._clock()
        fields = sorted(changes) + (["image"] if new_image else [])
        action = (
            "advert_switched_off"
            if changes.get("active") is False
            else "advert_switched_on"
            if changes.get("active") is True and len(changes) == 1
            else "advert_updated"
        )
        self._audit(principal, info, action, a.id, {"fields": fields})
        try:
            await self._db.commit()
        except Exception:
            if new_key_value:
                self._storage().delete(new_key_value)
            raise
        if new_key_value:
            # The old picture is kept: rows are history, and an app may still have it cached.
            del old_key

    async def picture(
        self, principal: StaffPrincipal | None, advert_id: uuid.UUID
    ) -> tuple[bytes, str] | None:
        """Staff with adverts.read see any picture; the app only the adverts showing now."""
        if principal is not None:
            self._need(principal, "adverts.read")
            a = await self._db.get(Advert, advert_id)
        else:
            showing = await showing_adverts(self._db, self._clock())
            a = next((x for x in showing if x.id == advert_id), None)
        key = a.image_key if a else None
        content_type = a.content_type if a else None
        await self._db.rollback()
        if key is None or content_type is None or self._store is None:
            return None
        data = self._store.get(key)
        return (data, content_type) if data is not None else None
