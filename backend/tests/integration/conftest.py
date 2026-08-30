"""Integration-test fixtures. **PostgreSQL only -- SQLite is never acceptable here.**

SQLite cannot express what these tests exist to prove: `SELECT ... FOR UPDATE` row
locking, partial unique indexes, deferred constraints, or the CHECK constraints that the
acceptance boundary relies on. A green SQLite run would be evidence of nothing, so the
fixtures below refuse any URL that is not PostgreSQL rather than quietly degrading.

**Skip vs fail.** With no `DATABASE_URL`, these tests skip -- a developer without a local
Postgres still gets a usable unit run. In CI that would be a false green, so setting
`XSPEERIA_REQUIRE_DB=1` converts the skip into a hard failure. CI sets it.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession

from app.core.config import Settings
from app.db.session import build_engine, dispose_engine, get_sessionmaker

REQUIRE_DB_ENV = "XSPEERIA_REQUIRE_DB"


def _resolve_database_url() -> str | None:
    """Read the configured URL, or `None` when no database is available."""
    return Settings().database_url


def database_url_or_skip() -> str:
    """Return a PostgreSQL URL, or skip -- unless CI has demanded a real database."""
    url = _resolve_database_url()
    required = os.environ.get(REQUIRE_DB_ENV) == "1"

    if not url:
        message = (
            "DATABASE_URL is not configured; integration tests need PostgreSQL 16. "
            "Start one with `docker compose up -d postgres`."
        )
        if required:
            pytest.fail(f"{REQUIRE_DB_ENV}=1 but {message}")
        pytest.skip(message)

    if not url.startswith("postgresql"):
        # Never a skip: a non-PostgreSQL URL is a misconfiguration that would silently
        # invalidate every guarantee these tests are here to check.
        pytest.fail(
            f"integration tests require PostgreSQL, got {url.split('://', 1)[0]!r}. "
            "SQLite is explicitly prohibited for the money path (DECISION S4-3)."
        )
    return url


@pytest.fixture(scope="session")
def database_url() -> str:
    return database_url_or_skip()


@pytest.fixture(scope="session")
def db_settings(database_url: str) -> Settings:
    """Settings pinned to the integration database, independent of any `.env` file."""
    return Settings(_env_file=None, database_url=database_url)  # type: ignore[call-arg]


@pytest_asyncio.fixture
async def engine(db_settings: Settings) -> AsyncIterator[AsyncEngine]:
    """A dedicated engine per test, disposed afterwards.

    Deliberately not the process-wide cached engine: a test must not leave a disposed
    engine behind in `app.db.session`'s module cache for the next one to pick up.
    """
    created = build_engine(db_settings)
    try:
        yield created
    finally:
        await created.dispose()


@pytest_asyncio.fixture
async def connection(engine: AsyncEngine) -> AsyncIterator[AsyncConnection]:
    async with engine.connect() as conn:
        yield conn


@pytest_asyncio.fixture
async def session(db_settings: Settings) -> AsyncIterator[AsyncSession]:
    """An `AsyncSession` from the application's own factory.

    Uses `get_sessionmaker` so the tests exercise the real factory configuration --
    `expire_on_commit=False` above all -- rather than a bespoke one that could drift from
    it.

    **That factory is process-wide and cached, so the fixture must dispose it on
    teardown.** `pytest-asyncio` runs each async test on its own function-scoped event
    loop; a cached engine left in place hands the next test an asyncpg pool holding
    connections bound to a loop that has since closed, surfacing as
    `RuntimeError: Event loop is closed` or `Future attached to a different loop` as
    integration coverage grows. `dispose_engine()` is the application's own sanctioned
    reset -- it clears both the cached engine and the cached factory -- so no bespoke
    teardown path can drift from production shutdown behaviour.
    Regression guard: `backend/tests/integration/test_session_lifecycle.py`.
    """
    factory = get_sessionmaker(db_settings)
    try:
        async with factory() as db_session:
            yield db_session
    finally:
        await dispose_engine()


@pytest_asyncio.fixture
async def scratch_table(connection: AsyncConnection) -> AsyncIterator[str]:
    """A throwaway table for transaction-behaviour tests.

    **Not a domain table.** Milestone 4.1A defines no domain persistence, so transaction
    and rollback semantics are proven against a temporary scratch table that is dropped
    afterwards and never appears in `Base.metadata` or in any migration.
    """
    name = "_xspeeria_scratch_4_1a"
    await connection.execute(text(f'CREATE TEMPORARY TABLE "{name}" (id INTEGER PRIMARY KEY)'))
    await connection.commit()
    try:
        yield name
    finally:
        await connection.execute(text(f'DROP TABLE IF EXISTS "{name}"'))
        await connection.commit()
