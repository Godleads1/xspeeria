"""In-process sliding-window rate limiter (ADR-025 §1.2, §4).

**Correct for a single server instance only.** Counts live in this process's memory, so two
instances each allow the full limit and a restart forgets them. Redis (or another shared
store) must replace this before running more than one instance — recorded as a known limit
in ADR-025 §4. Keys are opaque strings chosen by the caller; never put a raw PIN, code or
token in a key.
"""

from __future__ import annotations

import threading
from collections import deque
from datetime import datetime, timedelta

__all__ = ["SlidingWindowLimiter"]


class SlidingWindowLimiter:
    def __init__(self, *, limit: int, window: timedelta, max_keys: int = 100_000) -> None:
        if limit < 1:
            raise ValueError("limit must be at least 1")
        self._limit = limit
        self._window = window
        self._max_keys = max_keys
        self._hits: dict[str, deque[datetime]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, now: datetime) -> bool:
        """Record one attempt; ``True`` if it is within the limit."""
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

    def count(self, key: str, now: datetime) -> int:
        with self._lock:
            hits = self._hits.get(key)
            if not hits:
                return 0
            cutoff = now - self._window
            return sum(1 for t in hits if t > cutoff)

    def clear(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def _evict(self, now: datetime) -> None:
        """Bound memory: drop keys with no recent hits, then the oldest if still full."""
        cutoff = now - self._window
        for k in [k for k, v in self._hits.items() if not v or v[-1] <= cutoff]:
            del self._hits[k]
        while len(self._hits) >= self._max_keys:
            del self._hits[next(iter(self._hits))]
