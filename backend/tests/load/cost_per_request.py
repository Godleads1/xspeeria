"""Server cost per request (ADR-091): CPU time and database statements, per kind of request.

Runs the real application in this process (no network), on a throwaway database:

    DATABASE_URL=postgresql+asyncpg://… uv run python -m tests.load.cost_per_request

For each kind of request it sends a few warm-up requests, then N measured ones, and prints
the median process CPU time and the number of SQL statements per request. Use it to compare
before and after a change; the full load test (``tests.load.load_test``) gives the end-to-end
figures. The database is emptied first.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import time
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import event

from app.core.config import Settings
from app.core.rate_limit import DatabaseRateLimiter
from app.db.session import get_engine, get_sessionmaker
from app.main import create_app
from app.providers.sms import RecordingSmsSender
from tests.integration.test_auth_api import _runtime
from tests.load.load_test import COUNTRY, RealClock, _reset, set_up


async def measure(n: int) -> dict[str, tuple[float, float]]:
    settings = Settings(_env_file=None, database_url=os.environ["DATABASE_URL"])  # type: ignore[call-arg]
    await _reset(settings)
    people = await set_up(settings, 4)
    sms = RecordingSmsSender()
    runtime = _runtime(RealClock(), sms, 1_000_000)  # type: ignore[arg-type]
    # The real, database-backed limiters (ADR-080), with the limits lifted: one customer sends
    # hundreds of requests a minute here.
    sessions = get_sessionmaker(settings)
    for attr, name in (("user_limiter", "user"), ("address_limiter", "addr")):
        setattr(
            runtime,
            attr,
            DatabaseRateLimiter(
                name=name, limit=1_000_000, window=timedelta(minutes=1), sessions=sessions
            ),
        )
    app = create_app(settings, auth_runtime=runtime)
    statements = 0
    last: list[str] = []

    @event.listens_for(get_engine(settings).sync_engine, "before_cursor_execute")
    def _count(_c: Any, _cur: Any, sql: str, *_a: Any, **_k: Any) -> None:
        nonlocal statements
        statements += 1
        last.append(" ".join(sql.split())[:120])

    me, other = people[1], people[0]
    h = {"Authorization": f"Bearer {me.token}"}
    out: dict[str, tuple[float, float]] = {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://x") as c:
        calls: dict[str, Callable[[], Awaitable[Response]]] = {
            "my profile": lambda: c.get("/api/v1/users/me", headers=h),
            "browse market": lambda: c.get(
                "/api/v1/marketplace/listings",
                params={"filter[currency_pair]": "USD/NGN"},
                headers=h | COUNTRY,
            ),
            "notifications": lambda: c.get("/api/v1/notifications", headers=h),
            "my offers": lambda: c.get("/api/v1/offers/mine", headers=h),
            "one offer": lambda: c.get(f"/api/v1/offers/{other.offer_id}", headers=h),
            "fingerprint approval": lambda: c.post(
                "/api/v1/auth/step-up",
                json={"action": "trade.accept", "unlock_key": me.unlock_key},
                headers=h,
            ),
        }
        for name, call in calls.items():
            for _ in range(5):
                r = await call()
                assert r.status_code < 400, (name, r.status_code, r.text[:200])
            cpu, sql = [], []
            for _ in range(n):
                last.clear()
                s0, t0 = statements, time.process_time()
                r = await call()
                cpu.append((time.process_time() - t0) * 1000)
                sql.append(statements - s0)
                assert r.status_code < 400, (name, r.status_code)
            out[name] = (statistics.median(cpu), statistics.median(sql))
            if TRACE:
                print(f"--- {name}: the statements of one request")
                print("\n".join(last))
    return out


TRACE = False


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("-n", type=int, default=200)
    p.add_argument("--trace", action="store_true", help="print one request's SQL per kind")
    a = p.parse_args()
    global TRACE
    TRACE = a.trace
    res = asyncio.run(measure(a.n))
    print(f"{'request':<22}{'CPU ms (median)':>16}{'SQL statements':>16}")
    for name, (cpu, sql) in res.items():
        print(f"{name:<22}{cpu:>16.2f}{sql:>16.0f}")
    print(f"{'average':<22}{statistics.mean(v[0] for v in res.values()):>16.2f}")


if __name__ == "__main__":
    main()
