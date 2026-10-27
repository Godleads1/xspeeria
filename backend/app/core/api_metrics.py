"""API monitoring: count and time every API call and background job (ADR-072, owner 2026-10-27).

Owner: "build an api monitoring features to help track api health, process etc … all api used
should be monitored". Three kinds of call are recorded:

* ``own`` — every route of Xspeeria's own API (the app's and the console's), by route template;
* ``webhook`` — messages other systems send us (Didit, the partner bank);
* ``outside`` — every call Xspeeria makes to another system (Didit, face check, BVN/address
  checks, phone push, SMS, email, the partner bank), by service and normalised path.

Only counts and timings are kept, per minute: no user, no body, no query string, no headers and
no identifiers (path segments that look like IDs become ``{id}``). Background jobs record when
they ran, how long they took, and on failure the error's *type* only (never its message, which
could quote data).

Each server keeps its figures in memory and adds them to the database once a minute
(``flush``), so several servers add up instead of overwriting each other.
"""

from __future__ import annotations

import re
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

__all__ = [
    "RETENTION",
    "SLOW_MS",
    "MetricsRecorder",
    "TrackedTransport",
    "recorder",
    "track_job",
    "track_outside",
    "tracked_transport",
]

#: A call slower than this counts as slow.
SLOW_MS = 1000
#: Per-minute figures are kept this long, then deleted.
RETENTION = timedelta(days=30)

_ID_SEGMENT = re.compile(
    r"^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    r"|[0-9a-fA-F]{16,}|[0-9]+|[A-Za-z0-9_\-]{24,})$"
)


def normalise_path(path: str) -> str:
    """``/v3/session/7f3c…/decision/`` → ``/v3/session/{id}/decision/`` (no IDs kept)."""
    parts = path.split("?", 1)[0].split("/")
    return "/".join("{id}" if p and _ID_SEGMENT.match(p) else p for p in parts)[:120] or "/"


@dataclass
class _Counts:
    calls: int = 0
    client_errors: int = 0
    server_errors: int = 0
    network_errors: int = 0
    total_ms: int = 0
    max_ms: int = 0
    slow_calls: int = 0


@dataclass
class _Job:
    interval_s: int = 0
    runs: int = 0
    failures: int = 0
    last_started_at: datetime | None = None
    last_ok_at: datetime | None = None
    last_failed_at: datetime | None = None
    last_error: str | None = None
    last_duration_ms: int | None = None


@dataclass
class MetricsRecorder:
    """In-memory figures for this server, added to the database by ``flush``."""

    calls: dict[tuple[datetime, str, str, str], _Counts] = field(default_factory=dict)
    jobs: dict[str, _Job] = field(default_factory=dict)
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    _last_cleanup: datetime | None = None

    def record(
        self,
        kind: str,
        name: str,
        method: str,
        status: int | None,
        duration_ms: float,
        at: datetime | None = None,
    ) -> None:
        """``status`` None means the call never got an answer (timeout, connection refused)."""
        minute = (at or datetime.now(UTC)).replace(second=0, microsecond=0)
        c = self.calls.setdefault((minute, kind, name[:160], method[:8]), _Counts())
        ms = int(round(duration_ms))
        c.calls += 1
        c.total_ms += ms
        c.max_ms = max(c.max_ms, ms)
        if ms >= SLOW_MS:
            c.slow_calls += 1
        if status is None:
            c.network_errors += 1
        elif status >= 500:
            c.server_errors += 1
        elif status >= 400:
            c.client_errors += 1

    def job_started(self, name: str, interval_s: int, at: datetime) -> None:
        j = self.jobs.setdefault(name, _Job())
        j.interval_s = interval_s
        j.last_started_at = at

    def job_finished(
        self, name: str, at: datetime, duration_ms: float, error: BaseException | None
    ) -> None:
        j = self.jobs.setdefault(name, _Job())
        j.runs += 1
        j.last_duration_ms = int(round(duration_ms))
        if error is None:
            j.last_ok_at = at
        else:
            j.failures += 1
            j.last_failed_at = at
            j.last_error = type(error).__name__[:80]

    async def flush(self, db: AsyncSession, now: datetime | None = None) -> int:
        """Add this server's figures to the database; returns the rows written."""
        now = now or datetime.now(UTC)
        calls, self.calls = self.calls, {}
        jobs, self.jobs = self.jobs, {}
        for (minute, kind, name, method), c in calls.items():
            await db.execute(
                text(
                    "INSERT INTO api_metrics (minute, kind, name, method, calls, client_errors, "
                    "server_errors, network_errors, total_ms, max_ms, slow_calls) VALUES "
                    "(:minute, :kind, :name, :method, :calls, :ce, :se, :ne, :total, :max, :slow) "
                    "ON CONFLICT (minute, kind, name, method) DO UPDATE SET "
                    "calls = api_metrics.calls + EXCLUDED.calls, "
                    "client_errors = api_metrics.client_errors + EXCLUDED.client_errors, "
                    "server_errors = api_metrics.server_errors + EXCLUDED.server_errors, "
                    "network_errors = api_metrics.network_errors + EXCLUDED.network_errors, "
                    "total_ms = api_metrics.total_ms + EXCLUDED.total_ms, "
                    "max_ms = GREATEST(api_metrics.max_ms, EXCLUDED.max_ms), "
                    "slow_calls = api_metrics.slow_calls + EXCLUDED.slow_calls"
                ),
                {
                    "minute": minute,
                    "kind": kind,
                    "name": name,
                    "method": method,
                    "calls": c.calls,
                    "ce": c.client_errors,
                    "se": c.server_errors,
                    "ne": c.network_errors,
                    "total": c.total_ms,
                    "max": c.max_ms,
                    "slow": c.slow_calls,
                },
            )
        for name, j in jobs.items():
            await db.execute(
                text(
                    "INSERT INTO job_status (name, interval_s, runs, failures, last_started_at, "
                    "last_ok_at, last_failed_at, last_error, last_duration_ms, updated_at) VALUES "
                    "(:name, :interval, :runs, :failures, :started, :ok, :failed, :error, "
                    ":duration, :now) ON CONFLICT (name) DO UPDATE SET "
                    "interval_s = EXCLUDED.interval_s, "
                    "runs = job_status.runs + EXCLUDED.runs, "
                    "failures = job_status.failures + EXCLUDED.failures, "
                    "last_started_at = GREATEST(job_status.last_started_at, "
                    "EXCLUDED.last_started_at), "
                    "last_ok_at = GREATEST(job_status.last_ok_at, EXCLUDED.last_ok_at), "
                    "last_failed_at = GREATEST(job_status.last_failed_at, "
                    "EXCLUDED.last_failed_at), "
                    "last_error = CASE WHEN EXCLUDED.last_failed_at IS NOT NULL "
                    "AND EXCLUDED.last_failed_at >= COALESCE(job_status.last_failed_at, "
                    "EXCLUDED.last_failed_at) THEN EXCLUDED.last_error "
                    "ELSE job_status.last_error END, "
                    "last_duration_ms = COALESCE(EXCLUDED.last_duration_ms, "
                    "job_status.last_duration_ms), updated_at = EXCLUDED.updated_at"
                ),
                {
                    "name": name,
                    "interval": j.interval_s,
                    "runs": j.runs,
                    "failures": j.failures,
                    "started": j.last_started_at,
                    "ok": j.last_ok_at,
                    "failed": j.last_failed_at,
                    "error": j.last_error,
                    "duration": j.last_duration_ms,
                    "now": now,
                },
            )
        if self._last_cleanup is None or now - self._last_cleanup >= timedelta(hours=1):
            await db.execute(
                text("DELETE FROM api_metrics WHERE minute < :cutoff"),
                {"cutoff": now - RETENTION},
            )
            self._last_cleanup = now
        await db.commit()
        return len(calls) + len(jobs)


#: This server's recorder.
recorder = MetricsRecorder()


class TrackedTransport(httpx.AsyncBaseTransport):
    """Wraps an httpx transport so every outside call is counted and timed (ADR-072)."""

    def __init__(self, service: str, inner: httpx.AsyncBaseTransport | None = None) -> None:
        self.service = service
        self._inner = inner if inner is not None else httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        started = time.perf_counter()
        name = f"{self.service}: {normalise_path(request.url.path)}"
        try:
            response = await self._inner.handle_async_request(request)
        except Exception:
            recorder.record("outside", name, request.method, None, _ms(started))
            raise
        recorder.record("outside", name, request.method, response.status_code, _ms(started))
        return response

    async def aclose(self) -> None:
        await self._inner.aclose()


def tracked_transport(
    service: str, inner: httpx.AsyncBaseTransport | None = None
) -> TrackedTransport:
    """``httpx.AsyncClient(transport=tracked_transport("Didit", injected_or_None))``."""
    if isinstance(inner, TrackedTransport):
        return inner
    return TrackedTransport(service, inner)


@asynccontextmanager
async def track_outside(service: str, operation: str) -> AsyncIterator[None]:
    """For outside systems not reached over HTTP here (the pretend bank, developer senders)."""
    started = time.perf_counter()
    try:
        yield
    except Exception:
        recorder.record("outside", f"{service}: {operation}", "CALL", 500, _ms(started))
        raise
    recorder.record("outside", f"{service}: {operation}", "CALL", 200, _ms(started))


@contextmanager
def track_job(name: str, interval_s: int) -> Iterator[None]:
    """Wrap one round of a background job."""
    now = datetime.now(UTC)
    started = time.perf_counter()
    recorder.job_started(name, interval_s, now)
    try:
        yield
    except BaseException as e:
        recorder.job_finished(name, datetime.now(UTC), _ms(started), e)
        raise
    recorder.job_finished(name, datetime.now(UTC), _ms(started), None)


def _ms(started: float) -> float:
    return (time.perf_counter() - started) * 1000
