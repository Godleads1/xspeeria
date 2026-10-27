# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""API monitoring and System Health (ADR-072; owner 2026-10-27: all APIs, Super Admin only)."""

from __future__ import annotations

import re
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from httpx import AsyncClient

from app.core.api_metrics import (
    SLOW_MS,
    normalise_path,
    recorder,
    track_job,
    track_outside,
    tracked_transport,
)
from app.core.config import Settings
from tests.integration.test_admin_staff import Admin, H, admin, boss  # noqa: F401
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

URL = "/api/v1/admin/system-health"
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-")


@pytest.fixture(autouse=True)
def fresh_recorder() -> Iterator[None]:
    recorder.calls.clear()
    recorder.jobs.clear()
    yield
    recorder.calls.clear()
    recorder.jobs.clear()


async def _health(c: AsyncClient, window: str = "1h") -> dict[str, Any]:
    r = await c.get(f"{URL}?window={window}", headers=H)
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


def _find(items: list[dict[str, Any]], name: str, method: str | None = None) -> dict[str, Any]:
    for i in items:
        if i["name"] == name and (method is None or i["method"] == method):
            return i
    raise AssertionError(f"{name} not in {[i['name'] for i in items]}")


async def test_every_call_to_our_own_api_is_counted_without_identifiers(
    admin: Admin, boss: AsyncClient
) -> None:
    for _ in range(3):
        assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 200
    missing = "/api/v1/admin/staff/00000000-0000-0000-0000-000000000000/photo"
    assert (await boss.get(missing, headers=H)).status_code == 404
    body = await _health(boss)
    me = _find(body["apis"]["own"], "/api/v1/admin/me", "GET")
    assert me["calls"] >= 3 and me["server_errors"] == 0
    photo = _find(body["apis"]["own"], "/api/v1/admin/staff/{staff_id}/photo", "GET")
    assert photo["client_errors"] == 1
    # Route templates only: no ID from the URL is ever stored.
    for kind in ("own", "webhook", "outside"):
        for item in body["apis"][kind]:
            assert not UUID_RE.search(item["name"]), item["name"]
    stored = await _sql(admin.db_settings, "SELECT string_agg(name, ' ') FROM api_metrics")
    assert not UUID_RE.search(stored or "")
    assert body["database"]["ok"] is True and body["totals"]["calls"] >= 4
    assert body["series"] and sum(p["calls"] for p in body["series"]) >= 4


async def test_outside_services_are_counted_including_failures(boss: AsyncClient) -> None:
    def answer(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/decision/"):
            raise httpx.ConnectError("no route")
        return httpx.Response(503 if "fail" in request.url.path else 200, json={})

    transport = tracked_transport("Didit identity check", httpx.MockTransport(answer))
    async with httpx.AsyncClient(transport=transport) as c:
        await c.post("https://verification.didit.me/v3/session/")
        await c.post("https://verification.didit.me/v3/fail/")
        with pytest.raises(httpx.ConnectError):
            await c.get(
                "https://verification.didit.me/v3/session/7f3c1f9e-1111-2222-3333-444455556666/decision/"
            )
    async with track_outside("Pretend bank", "open escrow"):
        pass
    body = await _health(boss)
    outside = body["apis"]["outside"]
    assert _find(outside, "Didit identity check: /v3/session/", "POST")["calls"] == 1
    assert _find(outside, "Didit identity check: /v3/fail/", "POST")["server_errors"] == 1
    gone = _find(outside, "Didit identity check: /v3/session/{id}/decision/", "GET")
    assert gone["network_errors"] == 1
    assert _find(outside, "Pretend bank: open escrow")["calls"] == 1
    codes = [(w["level"], w["code"]) for w in body["warnings"]]
    assert ("red", "outside_failing") in codes and body["status"] == "problem"


async def test_background_jobs_report_ok_failing_and_late(admin: Admin, boss: AsyncClient) -> None:
    with track_job("Escrow processing", 5):
        pass
    with pytest.raises(RuntimeError), track_job("Fraud scan", 30):
        raise RuntimeError("boom with secret data")
    body = await _health(boss)
    jobs = {j["name"]: j for j in body["jobs"]}
    assert jobs["Escrow processing"]["state"] == "ok"
    assert jobs["Fraud scan"]["state"] == "failing"
    # The error's type only, never its message.
    assert jobs["Fraud scan"]["last_error"] == "RuntimeError"
    stored = await _sql(
        admin.db_settings, "SELECT string_agg(coalesce(last_error, ''), ' ') FROM job_status"
    )
    assert "secret" not in (stored or "")
    # A job that hasn't worked for a long time is late.
    await _sql(
        admin.db_settings,
        "UPDATE job_status SET last_ok_at = now() - interval '1 hour' WHERE name = 'Escrow processing'",
    )
    jobs = {j["name"]: j for j in (await _health(boss))["jobs"]}
    assert jobs["Escrow processing"]["state"] == "late"


async def test_only_the_super_admin_sees_it(admin: Admin, boss: AsyncClient) -> None:
    for role in ("ops_admin", "support_agent", "compliance_officer"):
        other = await admin.invite(boss, f"{role.split('_')[0]}@xspeeria.test", role)
        r = await other.get(URL, headers=H)
        assert r.status_code == 403, role
    async with admin.client() as anon:
        assert (await anon.get(URL, headers=H)).status_code == 401
    assert (await boss.get(URL)).status_code == 403  # the console header is required
    assert (await boss.get(f"{URL}?window=1y", headers=H)).status_code == 422
    for window in ("1h", "24h", "7d"):
        assert (await _health(boss, window))["window"] == window


async def test_figures_add_up_across_servers_and_old_ones_are_deleted(
    admin: Admin, db_settings: Settings
) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.db.session import build_engine

    minute = datetime.now(UTC).replace(second=0, microsecond=0)
    engine = build_engine(db_settings)
    try:
        maker = async_sessionmaker(engine, expire_on_commit=False)
        for ms in (100, 2 * SLOW_MS):  # two servers, same minute
            recorder.record("own", "/api/v1/x", "GET", 200, ms, at=minute)
            async with maker() as db:
                await recorder.flush(db, minute)
        old = minute - timedelta(days=31)
        recorder.record("own", "/api/v1/old", "GET", 200, 5, at=old)
        recorder._last_cleanup = None  # noqa: SLF001 - force the hourly clean-up now
        async with maker() as db:
            await recorder.flush(db, minute)
    finally:
        await engine.dispose()
    row = await _sql(
        db_settings,
        "SELECT calls || ',' || slow_calls || ',' || max_ms FROM api_metrics WHERE name = '/api/v1/x'",
    )
    assert row == f"2,1,{2 * SLOW_MS}"
    assert (
        await _sql(db_settings, "SELECT count(*) FROM api_metrics WHERE name = '/api/v1/old'") == 0
    )


def test_paths_lose_their_identifiers() -> None:
    assert normalise_path("/v3/session/7f3c1f9e-1111-2222-3333-444455556666/decision/") == (
        "/v3/session/{id}/decision/"
    )
    assert normalise_path("/v2/push/send?token=abc") == "/v2/push/send"
    assert normalise_path("/accounts/12345678/check") == "/accounts/{id}/check"
    assert normalise_path("/x/" + "a" * 30) == "/x/{id}"
