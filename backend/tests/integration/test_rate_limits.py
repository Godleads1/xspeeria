# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Shared rate limits (readiness review H-1, ADR-080), against PostgreSQL.

The point: every server counts the same attempts, a restart forgets nothing, and two servers
can't both let the last attempt through.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.core.rate_limit import (
    DatabaseRateLimiter,
    SlidingWindowLimiter,
    prune_rate_limit_hits,
)
from app.db.session import build_engine
from app.main import build_auth_runtime, create_app
from tests.integration.test_auth_api import (  # noqa: F401
    PHONE,
    Clock,
    _runtime,
    _sql,
    clean,
    migrated,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

T0 = datetime(2026, 11, 2, 12, 0, tzinfo=UTC)
MINUTE = timedelta(minutes=1)


async def _limiters(
    db_settings: Settings, n: int, *, name: str = "addr", limit: int = 10
) -> tuple[list[DatabaseRateLimiter], list[object]]:
    """``n`` limiters on ``n`` separate engines: ``n`` servers sharing one database."""
    engines = [build_engine(db_settings) for _ in range(n)]
    limiters = [
        DatabaseRateLimiter(
            name=name,
            limit=limit,
            window=MINUTE,
            sessions=async_sessionmaker(e, expire_on_commit=False),
        )
        for e in engines
    ]
    return limiters, engines  # type: ignore[return-value]


async def _dispose(engines: list[object]) -> None:
    for e in engines:
        await e.dispose()  # type: ignore[attr-defined]


async def test_allows_the_limit_then_refuses_then_recovers(
    db_settings: Settings, clean: None
) -> None:
    (lim,), engines = await _limiters(db_settings, 1)
    try:
        assert all([await lim.hit("a", T0 + timedelta(seconds=i)) for i in range(10)])
        assert not await lim.hit("a", T0 + timedelta(seconds=30))
        assert await lim.count("a", T0 + timedelta(seconds=30)) == 10
        assert await lim.hit("b", T0 + timedelta(seconds=30))  # keys are independent
        # Each attempt counts for exactly one minute after it was made.
        assert await lim.hit("a", T0 + timedelta(seconds=60, microseconds=1))
        await lim.clear("a")
        assert await lim.count("a", T0 + timedelta(seconds=61)) == 0
    finally:
        await _dispose(engines)


async def test_every_server_counts_the_same_attempts(db_settings: Settings, clean: None) -> None:
    (one, two), engines = await _limiters(db_settings, 2)
    try:
        for i in range(5):
            assert await one.hit("addr:10.0.0.1", T0 + timedelta(seconds=i))
            assert await two.hit("addr:10.0.0.1", T0 + timedelta(seconds=i))
        # 10 attempts, split across two servers: both now refuse.
        assert not await one.hit("addr:10.0.0.1", T0 + timedelta(seconds=10))
        assert not await two.hit("addr:10.0.0.1", T0 + timedelta(seconds=10))
    finally:
        await _dispose(engines)


async def test_a_restart_forgets_nothing(db_settings: Settings, clean: None) -> None:
    (before,), engines = await _limiters(db_settings, 1)
    for i in range(10):
        assert await before.hit("k", T0 + timedelta(seconds=i))
    await _dispose(engines)  # the server stops
    (after,), engines = await _limiters(db_settings, 1)  # and starts again
    try:
        assert not await after.hit("k", T0 + timedelta(seconds=20))
    finally:
        await _dispose(engines)


async def test_simultaneous_attempts_never_exceed_the_limit(
    db_settings: Settings, clean: None
) -> None:
    servers, engines = await _limiters(db_settings, 4)
    try:
        results = await asyncio.gather(
            *[servers[i % 4].hit("race", T0 + timedelta(milliseconds=i)) for i in range(40)]
        )
        assert sum(results) == 10
    finally:
        await _dispose(engines)


async def test_an_attempt_counts_even_when_the_request_rolls_back(
    db_settings: Settings, clean: None
) -> None:
    (lim,), engines = await _limiters(db_settings, 1)
    request_engine = build_engine(db_settings)
    try:
        async with request_engine.connect() as request:
            await request.execute(text("SELECT 1"))  # the request's own transaction
            assert await lim.hit("k", T0)
            await request.rollback()  # the request fails
        assert await lim.count("k", T0) == 1
    finally:
        await request_engine.dispose()
        await _dispose(engines)


async def test_no_address_phone_or_email_is_stored(db_settings: Settings, clean: None) -> None:
    (lim,), engines = await _limiters(db_settings, 1)
    try:
        await lim.hit("addr:203.0.113.7", T0)
        await lim.hit("id:ada.demo@example.com", T0)
    finally:
        await _dispose(engines)
    dump = await _sql(
        db_settings,
        "SELECT string_agg(limiter || encode(key_hash, 'escape'), ' ') FROM rate_limit_hits",
    )
    assert "203.0.113.7" not in dump and "example.com" not in dump
    assert await _sql(
        db_settings, "SELECT bool_and(octet_length(key_hash) = 32) FROM rate_limit_hits"
    )


async def test_limiters_with_different_names_are_independent(
    db_settings: Settings, clean: None
) -> None:
    (addr,), e1 = await _limiters(db_settings, 1, name="addr", limit=1)
    (user,), e2 = await _limiters(db_settings, 1, name="user", limit=1)
    try:
        assert await addr.hit("same-key", T0)
        assert await user.hit("same-key", T0)
        assert not await addr.hit("same-key", T0)
    finally:
        await _dispose(e1 + e2)


async def test_the_hourly_job_deletes_only_old_attempts(db_settings: Settings, clean: None) -> None:
    (lim,), engines = await _limiters(db_settings, 1)
    try:
        await lim.hit("old", T0)
        await lim.hit("new", T0 + timedelta(minutes=59))
        engine = build_engine(db_settings)
        try:
            async with async_sessionmaker(engine)() as db:
                assert await prune_rate_limit_hits(db, T0 + timedelta(minutes=61)) == 1
        finally:
            await engine.dispose()
        assert await lim.count("new", T0 + timedelta(minutes=59, seconds=30)) == 1
    finally:
        await _dispose(engines)


async def test_the_server_uses_the_shared_limiter_when_a_database_is_set(
    db_settings: Settings,
) -> None:
    with_db = build_auth_runtime(db_settings)
    for limiter in (
        with_db.address_limiter,
        with_db.unknown_identifier_limiter,
        with_db.user_limiter,
    ):
        assert isinstance(limiter, DatabaseRateLimiter)
    without = build_auth_runtime(Settings(_env_file=None, database_url=None))  # type: ignore[call-arg]
    assert isinstance(without.address_limiter, SlidingWindowLimiter)


async def test_sign_in_limits_hold_across_two_servers(db_settings: Settings, clean: None) -> None:
    """The real sign-in route, on two servers behind one address: 10 a minute in total."""
    clock = Clock()
    (shared_a, shared_b), engines = await _limiters(db_settings, 2)
    settings = Settings(_env_file=None, database_url=db_settings.database_url)  # type: ignore[call-arg]
    apps = []
    for shared in (shared_a, shared_b):
        runtime = _runtime(clock, None, 10)
        runtime.address_limiter = shared
        apps.append(create_app(settings, auth_runtime=runtime))
    try:
        clients = [
            AsyncClient(transport=ASGITransport(app=a), base_url="http://test") for a in apps
        ]
        codes = []
        for i in range(12):
            r = await clients[i % 2].post(
                "/api/v1/auth/login",
                json={"identifier": f"+23480900000{i:02d}", "pin": "739152"},
            )
            codes.append(r.status_code)
        assert codes[:10] == [401] * 10 and codes[10:] == [429, 429]
        for c in clients:
            await c.aclose()
    finally:
        await _dispose(engines)
    assert PHONE  # (imported for the shared fixtures' module)
