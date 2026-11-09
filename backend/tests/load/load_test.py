"""Load test (ADR-085): how the API holds up as more people use it at once.

Run on a developer's computer or a test server, NEVER against production:

    DATABASE_URL=postgresql+asyncpg://… uv run python -m tests.load.load_test \\
        --users 25,100,250 --seconds 45 --server-workers 1,2

What it does:

1. **Set-up, in this process:** signs up ``max(users)`` customers through the real sign-up
   routes (codes read from recording SMS/email senders), each on a trusted phone with
   fingerprint unlock turned on. A third of them post an offer.
2. **Starts the real server** (``uvicorn``, the given number of processes) on the same
   database, with the same signing keys, so those customers' sessions work there.
3. **For each number of users,** every simulated customer repeats, with about one second
   of "thinking" between steps (like a person using the app):
   browse the market 45%, my profile 20%, notifications 15%, my offers 10%,
   take an offer 7% (fingerprint approval + take), post an offer 3%.
4. **Reports** requests per second, response times (median, 95th and 99th percentile) and
   errors per kind of step. A refusal the app gives on purpose (offer already taken, a tier
   limit) is counted as "refused", not as an error. Errors are 5xx answers and timeouts.

The database is emptied first (all customer tables): use a throwaway database only.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import signal
import statistics
import subprocess
import sys
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.config import Settings
from app.db.session import build_engine, dispose_engine
from app.main import create_app
from app.providers.sms import RecordingSmsSender
from tests.integration.test_auth_api import KEY, MFA_KEY, PIN, TABLES, Env, _runtime

PORT = 8765
#: --real-limits: the server keeps its real per-address limits (ADR-087), to prove that many
#: customers behind one address aren't refused.
REAL_LIMITS = False
COUNTRY = {"X-Device-Country": "JP"}  # a country whose currency isn't traded: nothing hidden


class RealClock:
    """The set-up server must issue sessions on today's clock, like the real server."""

    def __call__(self) -> datetime:
        return datetime.now(UTC)

    def advance(self, **_: float) -> None:  # pragma: no cover - unused
        raise RuntimeError("real clock")


@dataclass
class Customer:
    token: str
    unlock_key: str
    offer_id: str | None = None


@dataclass
class Stats:
    times: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))
    errors: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    refused: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    #: Why steps were refused, by error code (expected ones, e.g. an offer already taken).
    why: dict[str, dict[str, int]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(int))
    )


async def _reset(settings: Settings) -> None:
    engine = build_engine(settings)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(f"TRUNCATE {TABLES}"))
    finally:
        await engine.dispose()
        await dispose_engine()


async def _identity_checked(settings: Settings) -> None:
    """Every load-test customer has passed identity checks for Nigeria and the US (as the
    integration tests do), so they can pay in naira and in dollars."""
    engine = build_engine(settings)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "INSERT INTO kyc_cases (id, user_id, provider, country, provider_session_id, "
                    "provider_status, status, legal_name, date_of_birth, decided_at, created_at, "
                    "updated_at) SELECT gen_random_uuid(), id, 'didit', c, 'load-' || c || id, "
                    "'Approved', 'approved', 'Load Test', DATE '1990-01-01', now(), now(), now() "
                    "FROM users CROSS JOIN (VALUES ('NG'), ('US')) AS countries(c)"
                )
            )
    finally:
        await engine.dispose()


async def set_up(settings: Settings, count: int) -> list[Customer]:
    import logging

    sms = RecordingSmsSender()
    app = create_app(settings, auth_runtime=_runtime(RealClock(), sms, 1_000_000))  # type: ignore[arg-type]
    logging.getLogger("httpx").setLevel(logging.WARNING)
    people: list[Customer] = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://setup") as client:
        env = Env(client, RealClock(), sms)  # type: ignore[arg-type]
        for i in range(count):
            phone, email = f"+23480{40000000 + i}", f"load{i}@example.com"
            body = await env.sign_up(phone=phone, email=email, pin=PIN)
            token = str(body["access_token"])
            r = await env.post(
                "/auth/biometric", {"device_token": body["device_token"]}, token=token
            )
            assert r.status_code == 200, r.text
            people.append(Customer(token, str(r.json()["unlock_key"])))
        await _identity_checked(settings)
        for i, person in enumerate(people):
            token = person.token
            if i % 3 == 0:
                r = await client.post(
                    "/api/v1/offers",
                    json={
                        "source_currency": "USD",
                        "target_currency": "NGN",
                        "source_amount": "5000.00",
                        "desired_rate": f"{1300 + i % 40}.50",
                    },
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Idempotency-Key": str(uuid.uuid4()),
                    },
                )
                if r.status_code == 201:
                    person.offer_id = str(r.json()["offer_id"])
                elif i == 0:
                    print("set-up: offer refused:", r.status_code, r.text[:300], flush=True)
    return people


def start_server(settings: Settings, workers: int) -> subprocess.Popen[bytes]:
    env = {
        **os.environ,
        "DATABASE_URL": str(settings.database_url),
        "JWT_SECRET_KEY": KEY,
        "MFA_ENCRYPTION_KEY": MFA_KEY,
        "APP_ENV": "local",
        "LOG_LEVEL": "WARNING",
        # Everyone in this test comes from one address; the per-address sign-in limit is raised
        # 20 times (the local-only setting). Per-customer limits are unchanged.
        "TEST_LIMITS_DEV": "false" if REAL_LIMITS else "true",
    }
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:create_app",
            "--factory",
            "--port",
            str(PORT),
            "--workers",
            str(workers),
            "--no-access-log",
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


async def _wait_up(client: AsyncClient) -> None:
    for _ in range(100):
        try:
            if (await client.get("/health")).status_code == 200:
                return
        except httpx.TransportError:
            pass
        await asyncio.sleep(0.2)
    raise RuntimeError("server did not start")


async def _step(stats: Stats, name: str, call: Any) -> httpx.Response | None:
    started = time.perf_counter()
    try:
        r: httpx.Response = await call
    except httpx.HTTPError:
        stats.errors[name] += 1
        return None
    stats.times[name].append((time.perf_counter() - started) * 1000)
    if r.status_code >= 500:
        stats.errors[name] += 1
    elif r.status_code >= 400:
        stats.refused[name] += 1
        try:
            code = str(r.json()["error"]["code"])
        except (ValueError, KeyError, TypeError):
            code = str(r.status_code)
        stats.why[name][code] += 1
    return r


async def customer_loop(
    client: AsyncClient, me: Customer, offers: list[str], stats: Stats, until: float
) -> None:
    h = {"Authorization": f"Bearer {me.token}"}
    await asyncio.sleep(random.random())  # don't all start on the same millisecond
    while time.perf_counter() < until:
        roll = random.random()
        if roll < 0.45:
            await _step(
                stats,
                "browse market",
                client.get(
                    "/api/v1/marketplace/listings",
                    params={"filter[currency_pair]": "USD/NGN"},
                    headers=h | COUNTRY,
                ),
            )
        elif roll < 0.65:
            await _step(stats, "my profile", client.get("/api/v1/users/me", headers=h))
        elif roll < 0.80:
            await _step(stats, "notifications", client.get("/api/v1/notifications", headers=h))
        elif roll < 0.90:
            await _step(stats, "my offers", client.get("/api/v1/offers/mine", headers=h))
        elif roll < 0.97 and offers:
            offer_id = random.choice(offers)
            if offer_id != me.offer_id:
                await _step(stats, "take offer (3 calls)", _take(client, h, me, offer_id))
        else:
            await _step(
                stats,
                "post offer",
                client.post(
                    "/api/v1/offers",
                    json={
                        "source_currency": "USD",
                        "target_currency": "NGN",
                        "source_amount": "100.00",
                        "desired_rate": "1320.50",
                    },
                    headers=h | {"Idempotency-Key": str(uuid.uuid4())},
                ),
            )
        await asyncio.sleep(random.uniform(0.5, 1.5))


async def _take(
    client: AsyncClient, h: dict[str, str], me: Customer, offer_id: str
) -> httpx.Response:
    """One take as the app does it: fingerprint approval, read the rate, then take."""
    r = await client.post(
        "/api/v1/auth/step-up",
        json={"action": "trade.accept", "unlock_key": me.unlock_key},
        headers=h,
    )
    if r.status_code != 200:
        return r
    step_up = r.json()["step_up_token"]
    shown = await client.get(f"/api/v1/offers/{offer_id}", headers=h)
    if shown.status_code != 200:
        return shown
    return await client.post(
        f"/api/v1/offers/{offer_id}/accept",
        json={"accepted_amount": "10.00", "expected_rate": shown.json()["desired_rate"]},
        headers=h | {"X-Step-Up-Token": step_up, "Idempotency-Key": str(uuid.uuid4())},
    )


def _pct(values: list[float], p: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(p / 100 * (len(ordered) - 1))))]


def report(stats: Stats, users: int, workers: int, seconds: float) -> dict[str, Any]:
    total = sum(len(v) for v in stats.times.values())
    errors = sum(stats.errors.values())
    every = [t for v in stats.times.values() for t in v]
    rows = []
    for name in sorted(stats.times):
        t = stats.times[name]
        rows.append(
            {
                "step": name,
                "count": len(t),
                "median_ms": round(statistics.median(t), 1),
                "p95_ms": round(_pct(t, 95), 1),
                "p99_ms": round(_pct(t, 99), 1),
                "refused": stats.refused[name],
                "errors": stats.errors[name],
                "refused_why": dict(stats.why[name]),
            }
        )
    return {
        "users": users,
        "server_processes": workers,
        "requests_per_second": round(total / seconds, 1),
        "median_ms": round(statistics.median(every), 1) if every else None,
        "p95_ms": round(_pct(every, 95), 1) if every else None,
        "p99_ms": round(_pct(every, 99), 1) if every else None,
        "errors": errors,
        "requests": total,
        "steps": rows,
    }


async def run(
    users: list[int], seconds: int, workers: list[int], same_address: bool = False
) -> list[dict[str, Any]]:
    settings = Settings(_env_file=None, database_url=os.environ["DATABASE_URL"])  # type: ignore[call-arg]
    results = []
    for w in workers:
        await _reset(settings)
        people = await set_up(settings, max(users))
        offers = [p.offer_id for p in people if p.offer_id]
        server = start_server(settings, w)
        try:
            async with AsyncClient(base_url=f"http://127.0.0.1:{PORT}", timeout=10) as probe:
                await _wait_up(probe)
            for n in users:
                # Each customer from their own address (127.0.x.y), as real phones are; or all
                # from one address (--same-address: many phones behind one mobile-network NAT).
                clients = [
                    AsyncClient(
                        base_url=f"http://127.0.0.1:{PORT}",
                        timeout=10,
                        transport=httpx.AsyncHTTPTransport(
                            local_address=None
                            if same_address
                            else f"127.0.{1 + i // 250}.{1 + i % 250}"
                        ),
                    )
                    for i in range(n)
                ]
                stats = Stats()
                busy_before = _cpu_times()
                until = time.perf_counter() + seconds
                started = time.perf_counter()
                try:
                    await asyncio.gather(
                        *(
                            customer_loop(clients[i], people[i], offers, stats, until)
                            for i in range(n)
                        )
                    )
                finally:
                    for c in clients:
                        await c.aclose()
                result = report(stats, n, w, time.perf_counter() - started)
                result["machine_cpu_busy_percent"] = _busy(busy_before, _cpu_times())
                result["same_address"] = same_address
                results.append(result)
                print(_line(result), flush=True)
        finally:
            server.send_signal(signal.SIGINT)
            server.wait(timeout=30)
    return results


def _cpu_times() -> tuple[int, int]:
    """(busy, total) CPU time of the whole machine, from /proc/stat (Linux)."""
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    idle = parts[3] + parts[4]
    return sum(parts) - idle, sum(parts)


def _busy(before: tuple[int, int], after: tuple[int, int]) -> float:
    total = after[1] - before[1]
    return round(100 * (after[0] - before[0]) / total, 1) if total else 0.0


def _line(r: dict[str, Any]) -> str:
    return (
        f"{r['users']:>4} users, {r['server_processes']} process(es): "
        f"{r['requests_per_second']:>6} req/s, median {r['median_ms']} ms, "
        f"p95 {r['p95_ms']} ms, p99 {r['p99_ms']} ms, errors {r['errors']}/{r['requests']}, "
        f"machine CPU {r.get('machine_cpu_busy_percent')}%"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--users", default="25,100,250")
    parser.add_argument("--seconds", type=int, default=45)
    parser.add_argument("--server-workers", default="1,2")
    parser.add_argument("--json", help="also write the results to this file")
    parser.add_argument(
        "--real-limits",
        action="store_true",
        help="keep the server's real per-address limits (don't raise them for the test)",
    )
    parser.add_argument(
        "--same-address",
        action="store_true",
        help="every customer from one address (many phones behind one mobile-network NAT)",
    )
    a = parser.parse_args()
    global REAL_LIMITS
    REAL_LIMITS = a.real_limits
    results = asyncio.run(
        run(
            [int(x) for x in a.users.split(",")],
            a.seconds,
            [int(x) for x in a.server_workers.split(",")],
            a.same_address,
        )
    )
    if a.json:
        import json

        with open(a.json, "w") as f:
            json.dump(results, f, indent=1)


if __name__ == "__main__":
    main()
