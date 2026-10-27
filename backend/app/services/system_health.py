"""System Health for the admin console (ADR-072; owner 2026-10-27, "Super Admin see it").

Reads the per-minute API figures and job status that ``app.core.api_metrics`` records, checks
the database and the escrow work queues, and lists warnings. Needs ``monitoring.read``.
Counts and timings only: nothing here names a customer or shows what anyone sent.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_metrics import SLOW_MS, recorder
from app.core.config import Settings
from app.services.staff import StaffPrincipal, forbidden

__all__ = ["WINDOWS", "SystemHealthService", "Window"]

Window = Literal["1h", "24h", "7d"]
#: How far back each window looks, and the chart's bucket size.
WINDOWS: dict[str, tuple[timedelta, timedelta]] = {
    "1h": (timedelta(hours=1), timedelta(minutes=5)),
    "24h": (timedelta(hours=24), timedelta(hours=1)),
    "7d": (timedelta(days=7), timedelta(hours=6)),
}

# Warning thresholds (ADR-072). Small samples are ignored so one bad call isn't an alarm.
_MIN_CALLS = 20
_SERVER_ERROR_RATE = 0.01  # more than 1% of calls answered 5xx
_SLOW_AVG_MS = SLOW_MS  # an average over one second
_DB_SLOW_MS = 200


def _rate(part: int, whole: int) -> float:
    return round(part / whole, 4) if whole else 0.0


class SystemHealthService:
    def __init__(self, db: AsyncSession, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    async def view(self, principal: StaffPrincipal, window: str) -> dict[str, Any]:
        if not principal.can("monitoring.read"):
            raise forbidden()
        span, bucket = WINDOWS.get(window, WINDOWS["1h"])
        # Real time: the figures are filed under the real minute they happened in.
        now = datetime.now(UTC)
        since = now - span

        # This server's last minute isn't in the database yet: add it first.
        await recorder.flush(self._db, now)

        started = time.perf_counter()
        await self._db.execute(text("SELECT 1"))
        db_ms = round((time.perf_counter() - started) * 1000, 1)

        rows = (
            await self._db.execute(
                text(
                    "SELECT kind, name, method, sum(calls), sum(client_errors), "
                    "sum(server_errors), sum(network_errors), sum(total_ms), max(max_ms), "
                    "sum(slow_calls), max(minute) FROM api_metrics WHERE minute >= :since "
                    "GROUP BY kind, name, method ORDER BY sum(calls) DESC"
                ),
                {"since": since},
            )
        ).all()
        apis: dict[str, list[dict[str, Any]]] = {"own": [], "webhook": [], "outside": []}
        for kind, name, method, calls, ce, se, ne, total, mx, slow, last in rows:
            calls, ce, se, ne = int(calls), int(ce), int(se), int(ne)
            apis[kind].append(
                {
                    "name": name,
                    "method": method,
                    "calls": calls,
                    "client_errors": ce,
                    "server_errors": se,
                    "network_errors": ne,
                    "error_rate": _rate(se + ne, calls),
                    "avg_ms": round(int(total) / calls) if calls else 0,
                    "max_ms": int(mx),
                    "slow_calls": int(slow),
                    "last_call_at": last,
                }
            )

        step = int(bucket.total_seconds())
        series_rows = (
            await self._db.execute(
                text(
                    "SELECT to_timestamp(floor(extract(epoch FROM minute) / :step) * :step) AS b, "
                    "sum(calls), sum(server_errors + network_errors), sum(total_ms) "
                    "FROM api_metrics WHERE minute >= :since AND kind <> 'outside' "
                    "GROUP BY b ORDER BY b"
                ),
                {"since": since, "step": step},
            )
        ).all()
        series = [
            {
                "at": b,
                "calls": int(c),
                "errors": int(e),
                "avg_ms": round(int(t) / int(c)) if c else 0,
            }
            for b, c, e, t in series_rows
        ]

        jobs = []
        for name, interval, runs, failures, last_start, last_ok, last_failed, error, ms in (
            await self._db.execute(
                text(
                    "SELECT name, interval_s, runs, failures, last_started_at, last_ok_at, "
                    "last_failed_at, last_error, last_duration_ms FROM job_status ORDER BY name"
                )
            )
        ).all():
            allowed = timedelta(seconds=max(3 * int(interval), 120))
            stale = last_ok is None or now - last_ok > allowed
            failing = last_failed is not None and (last_ok is None or last_failed > last_ok)
            jobs.append(
                {
                    "name": name,
                    "every_seconds": int(interval),
                    "runs": int(runs),
                    "failures": int(failures),
                    "last_started_at": last_start,
                    "last_ok_at": last_ok,
                    "last_failed_at": last_failed,
                    "last_error": error,
                    "last_duration_ms": ms,
                    "state": "failing" if failing else ("late" if stale else "ok"),
                }
            )

        queues = {
            "escrow_messages_waiting": await self._count(
                "SELECT count(*) FROM outbox_messages WHERE status = 'PENDING'"
            ),
            "escrow_messages_failed": await self._count(
                "SELECT count(*) FROM outbox_messages WHERE status = 'FAILED'"
            ),
            "bank_events_waiting": await self._count(
                "SELECT count(*) FROM pending_events WHERE status = 'PENDING'"
            ),
            "reconciliation_open": await self._count(
                "SELECT count(*) FROM reconciliation_exceptions WHERE status <> 'RESOLVED'"
            ),
        }
        await self._db.rollback()

        warnings = self._warnings(apis, jobs, queues, db_ms)
        own = apis["own"] + apis["webhook"]
        total_calls = sum(a["calls"] for a in own)
        total_errors = sum(a["server_errors"] + a["network_errors"] for a in own)
        total_ms = sum(a["avg_ms"] * a["calls"] for a in own)
        return {
            "now": now,
            "window": window if window in WINDOWS else "1h",
            "status": "problem"
            if any(w["level"] == "red" for w in warnings)
            else ("warning" if warnings else "ok"),
            "environment": self._settings.app_env,
            "api_version": self._settings.api_v,
            "server_started_at": recorder.started_at,
            "database": {"ok": True, "ping_ms": db_ms},
            "totals": {
                "calls": total_calls,
                "errors": total_errors,
                "error_rate": _rate(total_errors, total_calls),
                "avg_ms": round(total_ms / total_calls) if total_calls else 0,
            },
            "series": series,
            "apis": apis,
            "jobs": jobs,
            "queues": queues,
            "warnings": warnings,
        }

    async def _count(self, sql: str) -> int:
        return int(await self._db.scalar(text(sql)) or 0)

    @staticmethod
    def _warnings(
        apis: dict[str, list[dict[str, Any]]],
        jobs: list[dict[str, Any]],
        queues: dict[str, int],
        db_ms: float,
    ) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for kind, items in apis.items():
            for a in items:
                label = f"{a['method']} {a['name']}" if kind != "outside" else a["name"]
                failures = a["server_errors"] + a["network_errors"]
                if kind == "outside" and failures:
                    out.append(
                        {
                            "level": "red",
                            "code": "outside_failing",
                            "name": label,
                            "value": failures,
                        }
                    )
                elif a["calls"] >= _MIN_CALLS and a["error_rate"] > _SERVER_ERROR_RATE:
                    out.append(
                        {
                            "level": "red",
                            "code": "server_errors",
                            "name": label,
                            "value": a["error_rate"],
                        }
                    )
                elif failures:
                    out.append(
                        {"level": "amber", "code": "some_errors", "name": label, "value": failures}
                    )
                if a["calls"] >= _MIN_CALLS and a["avg_ms"] > _SLOW_AVG_MS:
                    out.append(
                        {"level": "amber", "code": "slow", "name": label, "value": a["avg_ms"]}
                    )
        for j in jobs:
            if j["state"] == "failing":
                out.append(
                    {
                        "level": "red",
                        "code": "job_failed",
                        "name": j["name"],
                        "value": j["last_error"],
                    }
                )
            elif j["state"] == "late":
                out.append({"level": "amber", "code": "job_late", "name": j["name"], "value": None})
        if queues["escrow_messages_failed"]:
            out.append(
                {
                    "level": "red",
                    "code": "escrow_messages_failed",
                    "name": None,
                    "value": queues["escrow_messages_failed"],
                }
            )
        if queues["reconciliation_open"]:
            out.append(
                {
                    "level": "amber",
                    "code": "reconciliation_open",
                    "name": None,
                    "value": queues["reconciliation_open"],
                }
            )
        if db_ms > _DB_SLOW_MS:
            out.append({"level": "amber", "code": "database_slow", "name": None, "value": db_ms})
        out.sort(key=lambda w: 0 if w["level"] == "red" else 1)
        return out
