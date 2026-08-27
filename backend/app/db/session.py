"""Async engine and session factory.

**The application must still boot with no database.** `Settings.database_url` is
`str | None`, `/health` must answer without persistence, and the whole unit-test suite
runs with no server anywhere. So nothing here connects, or even constructs an engine, at
import time: the engine is built on first request and cached, and a caller that needs a
database without one configured gets `DatabaseNotConfiguredError` rather than a
`None`-dereference or a connection attempt against an empty URL.

**No pool sizing is configured.** SQLAlchemy's defaults apply. Pool size, overflow,
recycle and timeout are deployment facts -- they depend on instance count, connection
limits and the managed-Postgres tier, none of which is decided (Decision 4 and the
infrastructure milestone own them). Writing numbers here would encode a production
deployment assumption this batch has no authority to make, and a wrong pool ceiling on a
money path is a queue of stalled transactions, not a tuning inconvenience.

`expire_on_commit=False` is required, not preferred: with it left on, reading any
attribute after `commit()` triggers a lazy refresh, which on an async session raises
`MissingGreenlet`. The acceptance boundary must bind its response from the committed
`Match` (step 11 of the §9.4 order) without a second round trip.

**Session exposure.** This module exports a *factory*, never a live session. The
`UnitOfWork` that owns transaction boundaries is 4.1I; until it exists there is
deliberately no FastAPI dependency handing a session to a route, so the layering rule --
nothing outside `repositories/` touches a session -- cannot be broken by accident.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings

__all__ = [
    "DatabaseNotConfiguredError",
    "build_engine",
    "dispose_engine",
    "get_engine",
    "get_sessionmaker",
]


class DatabaseNotConfiguredError(RuntimeError):
    """Raised when a database operation is attempted with no `DATABASE_URL` set.

    Explicit and loud: the alternative is a driver-level failure whose message points at
    a malformed URL rather than at the missing configuration that caused it.
    """


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _require_url(settings: Settings) -> str:
    url = settings.database_url
    if not url:
        raise DatabaseNotConfiguredError(
            "DATABASE_URL is not configured; this operation requires a database. "
            "The application itself boots and serves /health without one."
        )
    return url


def build_engine(settings: Settings | None = None) -> AsyncEngine:
    """Construct a **new**, uncached engine.

    Used by tests and by the Alembic environment, both of which need an engine with a
    lifetime they control rather than the process-wide cached one.
    """
    resolved = settings or get_settings()
    return create_async_engine(_require_url(resolved), future=True, pool_pre_ping=True)


def get_engine(settings: Settings | None = None) -> AsyncEngine:
    """Return the process-wide engine, building it on first use."""
    global _engine
    if _engine is None:
        _engine = build_engine(settings)
    return _engine


def get_sessionmaker(settings: Settings | None = None) -> async_sessionmaker[AsyncSession]:
    """Return the process-wide session factory, building it on first use."""
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            bind=get_engine(settings),
            expire_on_commit=False,
            autoflush=False,
        )
    return _sessionmaker


async def dispose_engine() -> None:
    """Dispose the cached engine and clear the cached factory.

    Called on application shutdown and between tests that build their own engine, so a
    disposed engine is never handed out again by `get_engine`.
    """
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
