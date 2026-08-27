"""A. connection · B. session transaction · C. rollback.

Infrastructure-level only. Nothing here defines or touches a domain table -- Milestone
4.1A has none, and these tests must not invent one to have something to write to.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession

from app.core.config import Settings
from app.db.session import DatabaseNotConfiguredError, build_engine

#: `asyncio` is applied per class rather than module-wide: `TestUnconfiguredDatabase`
#: below is synchronous by nature -- it asserts that constructing an engine without a URL
#: raises -- and marking a sync test as asyncio is a pytest warning, not a no-op.
pytestmark = pytest.mark.integration


@pytest.mark.asyncio
class TestConnection:
    """A. The engine reaches a real PostgreSQL 16 server."""

    async def test_connects_and_answers(self, connection: AsyncConnection) -> None:
        result = await connection.execute(text("SELECT 1"))
        assert result.scalar_one() == 1

    async def test_server_is_postgresql_16_or_newer(self, connection: AsyncConnection) -> None:
        """Guards the approved baseline. Older servers lack behaviour later batches rely on."""
        version = (await connection.execute(text("SHOW server_version_num"))).scalar_one()
        assert int(version) >= 160000, (
            f"expected PostgreSQL >= 16, got server_version_num={version}"
        )

    async def test_dialect_is_asyncpg(self, engine: AsyncEngine) -> None:
        assert engine.dialect.name == "postgresql"
        assert engine.dialect.driver == "asyncpg"


@pytest.mark.asyncio
class TestSessionTransaction:
    """B. An `AsyncSession` commits, and the commit is visible afterwards."""

    async def test_commit_persists_within_the_session(
        self, session: AsyncSession, connection: AsyncConnection
    ) -> None:
        await session.execute(
            text('CREATE TEMPORARY TABLE "_xspeeria_commit_probe" (id INTEGER PRIMARY KEY)')
        )
        await session.execute(text('INSERT INTO "_xspeeria_commit_probe" (id) VALUES (1)'))
        await session.commit()

        # A temporary table lives for the connection's session, so the read must happen on
        # the same session that created it.
        count = (
            await session.execute(text('SELECT COUNT(*) FROM "_xspeeria_commit_probe"'))
        ).scalar_one()
        assert count == 1

    async def test_expire_on_commit_is_false(self, db_settings: Settings) -> None:
        """The acceptance boundary binds its response from the committed row (step 11).

        With `expire_on_commit=True` that read triggers a lazy refresh, which raises
        `MissingGreenlet` on an async session.
        """
        from app.db.session import get_sessionmaker

        factory = get_sessionmaker(db_settings)
        assert factory.kw["expire_on_commit"] is False


@pytest.mark.asyncio
class TestRollback:
    """C. A rollback discards the work, and the connection stays usable."""

    async def test_rollback_discards_inserted_rows(
        self, connection: AsyncConnection, scratch_table: str
    ) -> None:
        await connection.execute(text(f'INSERT INTO "{scratch_table}" (id) VALUES (1)'))
        await connection.rollback()

        count = (
            await connection.execute(text(f'SELECT COUNT(*) FROM "{scratch_table}"'))
        ).scalar_one()
        assert count == 0

    async def test_connection_is_usable_after_rollback(
        self, connection: AsyncConnection, scratch_table: str
    ) -> None:
        await connection.execute(text(f'INSERT INTO "{scratch_table}" (id) VALUES (2)'))
        await connection.rollback()

        await connection.execute(text(f'INSERT INTO "{scratch_table}" (id) VALUES (3)'))
        await connection.commit()

        ids = (
            await connection.execute(text(f'SELECT id FROM "{scratch_table}" ORDER BY id'))
        ).scalars().all()
        assert list(ids) == [3]

    async def test_failed_statement_rolls_back_cleanly(
        self, connection: AsyncConnection, scratch_table: str
    ) -> None:
        """A constraint violation must not leave the connection wedged."""
        from sqlalchemy.exc import IntegrityError

        await connection.execute(text(f'INSERT INTO "{scratch_table}" (id) VALUES (10)'))
        with pytest.raises(IntegrityError):
            await connection.execute(text(f'INSERT INTO "{scratch_table}" (id) VALUES (10)'))
        await connection.rollback()

        assert (await connection.execute(text("SELECT 1"))).scalar_one() == 1


class TestUnconfiguredDatabase:
    """The application boots with no database; only DB work fails, and it fails loudly."""

    def test_build_engine_without_url_raises_explicitly(self) -> None:
        settings = Settings(_env_file=None, database_url=None)  # type: ignore[call-arg]
        with pytest.raises(DatabaseNotConfiguredError):
            build_engine(settings)
