"""Engine/session lifecycle regressions for the integration `session` fixture.

The `session` fixture hands out an `AsyncSession` from the application's **process-wide
cached** factory (`app.db.session.get_sessionmaker`), which builds and caches a
process-wide `AsyncEngine`. `pytest-asyncio` runs each async test on its own
function-scoped event loop. If the fixture leaves that cached engine in place, the next
test receives an asyncpg pool holding connections bound to an event loop that has since
closed -- surfacing as `RuntimeError: Event loop is closed` or
`Future attached to a different loop`.

The fixture therefore disposes the cache on teardown via the application's own
`dispose_engine()`. These tests are the regression guard for that contract:

* **R1** -- sequential tests using the fixture each execute a real query successfully.
* **R2** -- the cached engine and sessionmaker are cleared once the fixture tears down.

Nothing here creates a domain table. `SELECT 1` is deliberate: the point is the *engine
lifecycle*, not any schema.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Imported as a module, not `from ... import _engine`: the cache is rebound by
# `dispose_engine()`, so a name imported by value would capture a stale reference and the
# assertions below would test nothing.
from app.db import session as app_db_session

pytestmark = pytest.mark.integration

#: Set by the first R2 test. The second R2 test refuses to run without it, so a reordering
#: that put the teardown assertion first fails loudly instead of passing vacuously against
#: a cache that was simply never populated.
_ENGINE_WAS_BUILT = False


class TestSequentialSessionUse:
    """R1. Two tests in a row, each on its own event loop, each issuing a real query.

    This is the regression that motivated the fix: before the fixture disposed the cached
    engine, the second test inherited a pool bound to the first test's closed loop.
    """

    @pytest.mark.asyncio
    async def test_first_session_executes_a_query(self, session: AsyncSession) -> None:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1

    @pytest.mark.asyncio
    async def test_second_session_executes_a_query(self, session: AsyncSession) -> None:
        """The failure case: a stale pooled connection from the previous test's loop."""
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1


class TestCachedEngineIsDisposed:
    """R2. The fixture must leave no cached engine behind.

    **Why this inspects a private module attribute.** `app.db.session` exposes no public
    accessor reporting whether the cache is populated, and adding one purely for a test
    would widen the production surface to serve the suite -- the module deliberately
    exports a *factory*, never live state. The private read is confined to this file and
    goes no further.
    """

    @pytest.mark.asyncio
    async def test_session_fixture_populates_the_cache(self, session: AsyncSession) -> None:
        await session.execute(text("SELECT 1"))
        assert app_db_session._engine is not None, (
            "the `session` fixture should build the process-wide cached engine"
        )
        assert app_db_session._sessionmaker is not None
        global _ENGINE_WAS_BUILT
        _ENGINE_WAS_BUILT = True

    def test_cache_is_cleared_after_the_fixture_tears_down(self, database_url: str) -> None:
        """Synchronous on purpose -- it inspects state *after* an async fixture tore down.

        It takes `database_url` solely to inherit the suite's skip/fail policy: without it
        this test neither uses nor needs a database fixture, so on a developer machine with
        no PostgreSQL it would run anyway and fail the guard below, breaking the
        "skip when no DATABASE_URL" contract the other tests honour.
        """
        assert _ENGINE_WAS_BUILT, (
            "must run after test_session_fixture_populates_the_cache; without it this "
            "assertion would pass against a cache that was never populated"
        )
        assert app_db_session._engine is None, (
            "the `session` fixture left a cached engine behind; the next test would "
            "receive connections bound to a closed event loop"
        )
        assert app_db_session._sessionmaker is None, (
            "the `session` fixture left a cached sessionmaker behind"
        )
