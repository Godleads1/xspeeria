"""Alembic environment -- async SQLAlchemy, PostgreSQL, no committed credentials.

The database URL comes from `Settings.database_url` (the same `pydantic-settings` object
the application uses), never from `alembic.ini`. That keeps one configuration authority
and guarantees no connection string is committed.

Online migrations run through the async engine and `connection.run_sync`, because the
project's engine is `asyncpg` and Alembic's migration API is synchronous.

`compare_type` and `compare_server_default` are enabled so the drift guard actually
detects a changed column type or default, not merely an added or dropped table. On a
schema where `amount_minor BIGINT` versus a decimal type is the difference between exact
and rounded money, an autogenerate run that ignores type changes would be a false green.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.db.base import Base
from app.db.session import build_engine

config = context.config

# `disable_existing_loggers=False` is load-bearing, not tidiness. `fileConfig` defaults it
# to True, which sets `disabled = True` on every logger that already exists and is not named
# in `alembic.ini` -- `app.core.exceptions` and `app.main` among them, both created at import
# time. Alembic runs in-process in two places that matter: the integration suite drives
# `alembic.command` directly, and a deployment that migrates on startup imports the
# application first. In both, the default silently switches the application's logging off for
# the rest of the process, so the unhandled-exception record the security tests exist to
# prove is emitted would never be written at all -- a logging outage with no log line
# announcing it. Reproduced 2026-08-26: CI ran the integration suite before
# backend/tests/unit/test_logging.py and turned 7 passing tests into 7 errors, "expected
# exactly one record, got 0". Regression test:
# backend/tests/unit/test_logging.py::TestLoggingSurvivesAlembicConfiguration.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Autogenerate and the drift guard compare against this. MILESTONE 4.1A: it is
# intentionally EMPTY -- no domain model subclasses `Base` yet. Models become visible
# here only when 4.1B-4.1H import them into `app.models`.
target_metadata = Base.metadata


def _database_url() -> str:
    """Resolve the URL the same way the application does.

    `x_argument` (`alembic -x database_url=...`) takes precedence so a test or an
    operator can point a migration run at a specific database without mutating the
    environment.
    """
    override = context.get_x_argument(as_dictionary=True).get("database_url")
    if override:
        return str(override)
    # Programmatic callers (the integration tests drive `alembic.command` directly) pass
    # the URL through config attributes rather than argv.
    attribute = config.attributes.get("database_url")
    if attribute:
        return str(attribute)
    url = Settings().database_url
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not configured; Alembic cannot run without a target "
            "database. Set DATABASE_URL or pass -x database_url=..."
        )
    return url


def run_migrations_offline() -> None:
    """Emit SQL without a DBAPI connection (`alembic upgrade head --sql`)."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    engine: AsyncEngine = build_engine(Settings(database_url=_database_url()))
    try:
        async with engine.connect() as connection:
            await connection.run_sync(_run_migrations)
            await connection.commit()
    finally:
        await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(_run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
