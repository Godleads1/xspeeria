"""Rate limiters (ADR-025 §1.2; shared store: ADR-080).

Two implementations with the same async interface (:class:`RateLimiter`):

* :class:`DatabaseRateLimiter` -- **used whenever a database is configured.** Each attempt is a
  row in ``rate_limit_hits``, so every server counts the same attempts and a restart forgets
  nothing (readiness review H-1). Keys are stored only as SHA-256 hashes: no network address,
  phone number or email address is written.
* :class:`SlidingWindowLimiter` -- in this process's memory. Kept for a server with no
  database (``/health`` only) and for unit tests. **Correct for one server only.**

Both are sliding windows: an attempt counts for exactly ``window`` after it was made. Keys are
opaque strings chosen by the caller; never put a raw PIN, code or token in a key.
"""

from __future__ import annotations

import hashlib
import threading
from collections import deque
from datetime import datetime, timedelta
from typing import Protocol

from sqlalchemy import (
    ColumnElement,
    DateTime,
    LargeBinary,
    String,
    and_,
    delete,
    func,
    insert,
    literal,
    select,
    text,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.rate_limits import RateLimitHit

__all__ = [
    "PRUNE_AFTER",
    "DatabaseRateLimiter",
    "RateLimiter",
    "SlidingWindowLimiter",
    "prune_rate_limit_hits",
]

#: Rows older than this are deleted by the hourly job. Longer than any window in use
#: (the longest is the 15-minute PIN lock).
PRUNE_AFTER = timedelta(hours=1)


class RateLimiter(Protocol):
    _limit: int

    async def hit(self, key: str, now: datetime) -> bool:
        """Record one attempt; ``True`` if it is within the limit."""
        ...

    async def count(self, key: str, now: datetime) -> int:
        """Attempts still inside the window."""
        ...

    async def clear(self, key: str) -> None: ...


class SlidingWindowLimiter:
    """In-process limiter. One server only; a restart forgets every count."""

    def __init__(self, *, limit: int, window: timedelta, max_keys: int = 100_000) -> None:
        if limit < 1:
            raise ValueError("limit must be at least 1")
        self._limit = limit
        self._window = window
        self._max_keys = max_keys
        self._hits: dict[str, deque[datetime]] = {}
        self._lock = threading.Lock()

    async def hit(self, key: str, now: datetime) -> bool:
        with self._lock:
            hits = self._hits.get(key)
            if hits is None:
                if len(self._hits) >= self._max_keys:
                    self._evict(now)
                hits = deque()
                self._hits[key] = hits
            cutoff = now - self._window
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self._limit:
                return False
            hits.append(now)
            return True

    async def count(self, key: str, now: datetime) -> int:
        with self._lock:
            hits = self._hits.get(key)
            if not hits:
                return 0
            cutoff = now - self._window
            return sum(1 for t in hits if t > cutoff)

    async def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def _evict(self, now: datetime) -> None:
        """Bound memory: drop keys with no recent hits, then the oldest if still full."""
        cutoff = now - self._window
        for k in [k for k, v in self._hits.items() if not v or v[-1] <= cutoff]:
            del self._hits[k]
        while len(self._hits) >= self._max_keys:
            del self._hits[next(iter(self._hits))]


def _digest(name: str, key: str) -> bytes:
    return hashlib.sha256(f"{name}\x00{key}".encode()).digest()


class DatabaseRateLimiter:
    """Shared limiter: every server and every restart see the same attempts (ADR-080).

    Each call runs in its **own short transaction**, never the request's, so a request that
    fails and rolls back still counts as an attempt. Attempts on one key are serialised with
    a transaction-level advisory lock, so two servers can't both let the last attempt through.
    """

    def __init__(
        self,
        *,
        name: str,
        limit: int,
        window: timedelta,
        sessions: async_sessionmaker[AsyncSession],
    ) -> None:
        if limit < 1:
            raise ValueError("limit must be at least 1")
        if not name or len(name) > 32:
            raise ValueError("name must be 1-32 characters")
        self._name = name
        self._limit = limit
        self._window = window
        self._sessions = sessions

    async def _lock(self, db: AsyncSession, digest: bytes) -> None:
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:k)"),
            {"k": int.from_bytes(digest[:8], "big", signed=True)},
        )

    def _mine(self, digest: bytes) -> ColumnElement[bool]:
        return and_(RateLimitHit.limiter == self._name, RateLimitHit.key_hash == digest)

    async def hit(self, key: str, now: datetime) -> bool:
        digest = _digest(self._name, key)
        cutoff = now - self._window
        async with self._sessions() as db, db.begin():
            await self._lock(db, digest)
            # ADR-091: count this key's attempts inside the window and add this one only if
            # under the limit, in one statement (a new snapshot after the lock, so two servers
            # can't both let the last attempt through). Old attempts are pruned by the hourly
            # job (``prune_rate_limit_hits``); the window filter ignores them meanwhile.
            added = await db.scalar(
                insert(RateLimitHit)
                .from_select(
                    ["limiter", "key_hash", "at"],
                    select(
                        literal(self._name, String()),
                        literal(digest, LargeBinary()),
                        literal(now, DateTime(timezone=True)),
                    ).where(
                        select(func.count())
                        .select_from(RateLimitHit)
                        .where(self._mine(digest), RateLimitHit.at > cutoff)
                        .scalar_subquery()
                        < self._limit
                    ),
                )
                .returning(RateLimitHit.id)
            )
        return added is not None

    async def count(self, key: str, now: datetime) -> int:
        digest = _digest(self._name, key)
        async with self._sessions() as db:
            found = await db.scalar(
                select(func.count())
                .select_from(RateLimitHit)
                .where(self._mine(digest), RateLimitHit.at > now - self._window)
            )
        return int(found or 0)

    async def clear(self, key: str) -> None:
        digest = _digest(self._name, key)
        async with self._sessions() as db, db.begin():
            await db.execute(delete(RateLimitHit).where(self._mine(digest)))


async def prune_rate_limit_hits(db: AsyncSession, now: datetime) -> int:
    """Delete attempts older than :data:`PRUNE_AFTER` (hourly job). Returns how many."""
    result = await db.execute(delete(RateLimitHit).where(RateLimitHit.at < now - PRUNE_AFTER))
    await db.commit()
    return int(result.rowcount or 0)  # type: ignore[attr-defined]
