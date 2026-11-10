"""ADR-085: background jobs run in the web server (one server) or in one worker process.

No database is opened: the loops are planned and started, then stopped before their first
round (each sleeps first).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.core.config import Settings
from app.core.pin_hashing import PinHasher
from app.core.rate_limit import SlidingWindowLimiter
from app.main import planned_tasks
from app.providers.email import RecordingEmailSender
from app.providers.pretend_bank import PretendBank
from app.services.auth import AuthRuntime
from app.worker import _check, run_worker

DB = "postgresql+asyncpg://u:p@localhost:5432/x"
JOBS = {
    "deal expiry, queues, fraud scan",
    "retention and clean-up",
    "deal reconciliation",
    "security emails",
}
EVERYWHERE = {"metrics", "alert rules"}


def _settings(**kw: Any) -> Settings:
    return Settings(_env_file=None, database_url=DB, **kw)  # type: ignore[call-arg]


def _rt(**kw: Any) -> AuthRuntime:
    limiter = SlidingWindowLimiter(limit=10, window=timedelta(minutes=1))
    return AuthRuntime(
        keys=None,
        secret_box=None,
        sms=None,
        hasher=PinHasher(memory_kib=1024, iterations=1),
        clock=lambda: datetime.now(UTC),
        address_limiter=limiter,
        unknown_identifier_limiter=limiter,
        email=RecordingEmailSender(),
        **kw,
    )


def test_one_server_runs_everything() -> None:
    assert set(planned_tasks(_settings(), _rt(), role="web")) == EVERYWHERE | JOBS


def test_with_a_worker_the_web_servers_only_report_and_watch() -> None:
    web = planned_tasks(_settings(run_background_jobs=False), _rt(), role="web")
    assert set(web) == EVERYWHERE  # still notices a stopped worker (alert rules)
    worker = planned_tasks(_settings(run_background_jobs=False), _rt(), role="worker")
    assert set(worker) == EVERYWHERE | JOBS


def test_the_pretend_bank_stays_in_the_web_server() -> None:
    rt = _rt(pretend_bank=PretendBank(lambda: None))  # type: ignore[arg-type, return-value]
    web = planned_tasks(_settings(run_background_jobs=False, demo_autopilot=True), rt, role="web")
    assert {"escrow (pretend bank)", "demo robots"} <= set(web)
    worker = planned_tasks(_settings(demo_autopilot=True), rt, role="worker")
    assert not {"escrow (pretend bank)", "demo robots"} & set(worker)
    with pytest.raises(SystemExit):
        _check(_settings(pretend_bank=True, app_env="local"))


def test_no_database_no_loops_and_no_worker() -> None:
    no_db = Settings(_env_file=None, database_url=None)  # type: ignore[call-arg]
    assert planned_tasks(no_db, _rt(), role="web") == {}
    with pytest.raises(SystemExit):
        _check(no_db)


@pytest.mark.asyncio
async def test_the_worker_starts_its_loops_and_stops_cleanly() -> None:
    stop = asyncio.Event()
    run = asyncio.create_task(run_worker(_settings(), _rt(), stop))
    await asyncio.sleep(0.05)
    started = {t.get_name() for t in asyncio.all_tasks()}
    assert JOBS <= started
    stop.set()
    assert set(await asyncio.wait_for(run, 5)) == EVERYWHERE | JOBS
    assert not JOBS & {t.get_name() for t in asyncio.all_tasks() if not t.done()}
