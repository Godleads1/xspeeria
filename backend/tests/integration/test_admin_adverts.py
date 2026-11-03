# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Adverts in the app's advert slot (ADR-067; ADR-056 decision 2).

Owner: "the place advert here is done from the web admin, and then everyone using the app sees
it in that same location. the size must fit the advert placeholder."
"""

from __future__ import annotations

import base64
import struct
import zlib
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from app.providers.object_store import LocalFolderStore
from tests.integration.test_admin_disputes import boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_escrow_api import esc, owner, partners, taker  # noqa: F401
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


def png(width: int, height: int, text: bytes | None = None) -> bytes:
    """A real, tiny PNG of the given size (optionally with a hidden text chunk)."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    raw = b"".join(b"\x00" + b"\x00" * width for _ in range(height))
    out = b"\x89PNG\r\n\x1a\n" + chunk(
        b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    )
    if text:
        out += chunk(b"tEXt", b"Comment\x00" + text)
    return out + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


@pytest.fixture
def store(staff: Admin, owner: Party, tmp_path: Any) -> LocalFolderStore:
    s = LocalFolderStore(tmp_path)
    staff.runtime.object_store = s
    owner.env.runtime.object_store = s
    return s


def advert(**over: Any) -> dict[str, Any]:
    return {
        "name": "Lagos launch",
        "image": b64(png(1026, 339, b"secret GPS 6.5244,3.3792")),
        "starts_at": "2026-10-18T00:00:00+01:00",
        "ends_at": "2026-11-30T00:00:00+01:00",
        "link_url": "https://xspeeria.com/launch",
        **over,
    }


async def _current(p: Party) -> Any:
    r = await p.env.client.get("/api/v1/adverts/current", headers=p._h())
    assert r.status_code == 200, r.text
    return r.json()


async def test_an_advert_shows_in_the_app_slot_with_hidden_details_removed(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party, store: LocalFolderStore
) -> None:
    assert await _current(owner) is None
    r = await boss.post("/api/v1/admin/adverts", json=advert(), headers=H)
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    cur = await _current(owner)
    assert cur == {
        "id": aid,
        "name": "Lagos launch",
        "link_url": "https://xspeeria.com/launch",
        "width": 1026,
        "height": 339,
        "image_path": f"/api/v1/adverts/{aid}/image",
    }
    pic = await owner.env.client.get(cur["image_path"], headers=owner._h())
    assert pic.status_code == 200 and pic.headers["content-type"] == "image/png"
    assert pic.content.startswith(b"\x89PNG") and b"GPS" not in pic.content
    assert pic.headers["x-content-type-options"] == "nosniff"
    # Not in PostgreSQL: only the key, type and size.
    assert (
        await _sql(db_settings, "SELECT content_type || ' ' || width || 'x' || height FROM adverts")
        == "image/png 1026x339"
    )
    listed = (await boss.get("/api/v1/admin/adverts", headers=H)).json()
    assert listed["showing_id"] == aid and listed["items"][0]["state"] == "showing"
    assert listed["slot"] == {"width": 342, "height": 113}
    # A newer one that starts later takes the slot from its start; switched off, the first returns.
    later = (
        await boss.post(
            "/api/v1/admin/adverts",
            json=advert(name="Promo", starts_at="2026-10-18T12:00:00+01:00", link_url=None),
            headers=H,
        )
    ).json()["id"]
    assert (await _current(owner))["id"] == aid  # not started yet (the clock is at 10:00)
    staff.clock.advance(hours=3)
    owner.env.clock.advance(hours=3)
    async with staff.client() as again:
        from tests.integration.test_admin_staff import BOSS, BOSS_PW

        assert (await staff.login(again, BOSS, BOSS_PW)).status_code == 200
        await owner.relogin()
        assert (await _current(owner))["id"] == later
        # ADR-086: both are inside their dates, so both take turns; the newest comes first.
        states = {
            i["id"]: (i["state"], i["position"])
            for i in (await again.get("/api/v1/admin/adverts", headers=H)).json()["items"]
        }
        assert states == {later: ("showing", 1), aid: ("showing", 2)}
        assert (
            await again.patch(f"/api/v1/admin/adverts/{later}", json={"active": False}, headers=H)
        ).status_code == 204
        assert (await _current(owner))["id"] == aid
        # The app can't fetch a picture that isn't showing.
        assert (
            await owner.env.client.get(f"/api/v1/adverts/{later}/image", headers=owner._h())
        ).status_code == 404
        # Staff can.
        assert (
            await again.get(f"/api/v1/admin/adverts/{later}/image", headers=H)
        ).status_code == 200
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY at, action) FROM staff_audit_log WHERE target_type = 'advert'",
    )
    assert actions == "advert_created,advert_created,advert_switched_off"


async def test_the_picture_must_fit_the_slot(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party, store: LocalFolderStore
) -> None:
    for image, words in (
        (png(1080, 1080), "shape"),  # square
        (png(300, 99), "at least"),  # too small
        (
            b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
            "JPG, PNG or WebP",
        ),
        (b"GIF89a....", "JPG, PNG or WebP"),
    ):
        r = await boss.post("/api/v1/admin/adverts", json=advert(image=b64(image)), headers=H)
        assert r.status_code == 422 and words in r.json()["error"]["message"], r.text
    # The exact slot size and 3x both fit.
    for w, h in ((342, 113), (1026, 339)):
        assert (
            await boss.post("/api/v1/admin/adverts", json=advert(image=b64(png(w, h))), headers=H)
        ).status_code == 201


async def test_validation_and_access(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party, store: LocalFolderStore
) -> None:
    for bad in (
        advert(link_url="http://plain.example"),
        advert(link_url="javascript:alert(1)"),
        advert(link_url="https://x.example/<script>"),
        advert(ends_at="2026-10-01T00:00:00+01:00"),
        advert(starts_at="2026-10-18T00:00:00"),  # no time zone
        advert(name="x"),
        advert(audience="everyone"),
        advert(image="not base64!"),
    ):
        r = await boss.post("/api/v1/admin/adverts", json=bad, headers=H)
        assert r.status_code == 422, (bad.get("link_url"), r.text)
    # Only staff given the adverts permissions; the Super Admin has them from the migration.
    agent = await staff.invite(boss, "ops@xspeeria.test", "ops_admin")
    assert (await agent.get("/api/v1/admin/adverts", headers=H)).status_code == 403
    assert (await agent.post("/api/v1/admin/adverts", json=advert(), headers=H)).status_code == 403
    perms = await _sql(
        db_settings,
        "SELECT array_to_string(permissions, ',') FROM staff_roles WHERE name = 'super_admin'",
    )
    assert {"adverts.read", "adverts.create", "adverts.update"} <= set(perms.split(","))
    # Signed-out app: nothing.
    assert (await owner.env.client.get("/api/v1/adverts/current")).status_code == 401
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'adverts'",
    )
    assert grants == "INSERT,SELECT,UPDATE"


async def test_without_picture_storage_adding_says_so(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party
) -> None:
    staff.runtime.object_store = None
    r = await boss.post("/api/v1/admin/adverts", json=advert(), headers=H)
    assert r.status_code == 503 and "storage" in r.json()["error"]["message"]


async def _showing(p: Party) -> Any:
    r = await p.env.client.get("/api/v1/adverts/showing", headers=p._h())
    assert r.status_code == 200, r.text
    return r.json()


async def test_several_adverts_take_turns_newest_first(
    staff: Admin, boss: AsyncClient, owner: Party, store: LocalFolderStore
) -> None:
    """ADR-086 (owner 2026-11-03): many adverts can be posted; the app slides through them."""
    from app.services.adverts import MAX_SHOWING, ROTATE_SECONDS

    assert await _showing(owner) == {"rotate_seconds": ROTATE_SECONDS, "items": []}
    ids = []
    for i in range(MAX_SHOWING + 1):  # 11: one more than can take turns
        r = await boss.post(
            "/api/v1/admin/adverts",
            json=advert(name=f"Ad {i}", starts_at=f"2026-10-{1 + i:02d}T00:00:00+01:00"),
            headers=H,
        )
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    # One that hasn't started yet is never sent.
    future = await boss.post(
        "/api/v1/admin/adverts",
        json=advert(name="Next month", starts_at="2026-11-10T00:00:00+01:00"),
        headers=H,
    )
    assert future.status_code == 201, future.text
    got = await _showing(owner)
    assert got["rotate_seconds"] == ROTATE_SECONDS
    shown = [a["id"] for a in got["items"]]
    assert shown == list(reversed(ids))[:MAX_SHOWING]  # the newest start first
    # The app can fetch every picture in the rotation, and nothing else.
    for aid in shown:
        r = await owner.env.client.get(f"/api/v1/adverts/{aid}/image", headers=owner._h())
        assert r.status_code == 200
    for aid in (ids[0], future.json()["id"]):
        r = await owner.env.client.get(f"/api/v1/adverts/{aid}/image", headers=owner._h())
        assert r.status_code == 404
    # Staff see which are taking turns, in order, and which one waits for a free place.
    listed = (await boss.get("/api/v1/admin/adverts", headers=H)).json()
    by_id = {i["id"]: i for i in listed["items"]}
    assert listed["showing_ids"] == shown and listed["max_showing"] == MAX_SHOWING
    assert by_id[ids[-1]]["position"] == 1 and by_id[ids[1]]["position"] == MAX_SHOWING
    assert (by_id[ids[0]]["state"], by_id[ids[0]]["position"]) == ("covered", None)
    assert by_id[future.json()["id"]]["state"] == "scheduled"
    # Switching one off frees its place: the waiting one joins at the end.
    r = await boss.patch(f"/api/v1/admin/adverts/{ids[-1]}", json={"active": False}, headers=H)
    assert r.status_code == 204
    assert [a["id"] for a in (await _showing(owner))["items"]][-1] == ids[0]


async def test_the_showing_list_needs_a_login(owner: Party) -> None:
    assert (await owner.env.client.get("/api/v1/adverts/showing")).status_code == 401
