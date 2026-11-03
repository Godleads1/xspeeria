"""ADR-088: the readiness check a load balancer uses. PostgreSQL."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1 import health
from app.core.config import Settings
from app.db.session import dispose_engine
from app.main import create_app
from tests.integration.test_auth_api import migrated  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


@pytest.fixture(autouse=True)
def fresh_answer() -> Iterator[None]:
    health._last = None  # the one-second memory must not leak between tests
    yield
    health._last = None


async def _get(settings: Settings) -> tuple[int, dict[str, str], str]:
    app = create_app(settings)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/health/ready")
    await dispose_engine()
    return r.status_code, r.json(), r.headers.get("cache-control", "")


async def test_ready_when_the_database_answers(db_settings: Settings) -> None:
    code, body, cache = await _get(
        Settings(_env_file=None, database_url=db_settings.database_url)  # type: ignore[call-arg]
    )
    assert (code, body, cache) == (200, {"status": "ready"}, "no-store")


async def test_not_ready_when_the_database_is_unreachable(db_settings: Settings) -> None:
    # Same server, a port nothing listens on: the database can't be reached.
    url = str(db_settings.database_url).replace(":5432/", ":1/")
    code, body, _ = await _get(Settings(_env_file=None, database_url=url))  # type: ignore[call-arg]
    assert (code, body) == (503, {"status": "not_ready"})
    assert "postgres" not in str(body) and "5432" not in str(body)


async def test_not_ready_without_a_database() -> None:
    code, body, _ = await _get(Settings(_env_file=None, database_url=None))  # type: ignore[call-arg]
    assert (code, body) == (503, {"status": "not_ready"})


async def test_the_answer_is_kept_for_a_second(db_settings: Settings) -> None:
    """A load balancer (or anyone) calling in a loop costs one query a second at most."""
    settings = Settings(_env_file=None, database_url=db_settings.database_url)  # type: ignore[call-arg]
    app = create_app(settings)
    calls = 0
    real = health._database_answers

    async def counted(s: Settings) -> bool:
        nonlocal calls
        calls += 1
        return await real(s)

    health._database_answers = counted  # type: ignore[assignment]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            for _ in range(20):
                assert (await c.get("/health/ready")).status_code == 200
    finally:
        health._database_answers = real  # type: ignore[assignment]
        await dispose_engine()
    assert calls == 1
