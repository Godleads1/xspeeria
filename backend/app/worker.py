"""The background worker — ADR-085.

``python -m app.worker`` runs the background jobs (deal expiry, waiting queues, fraud scan,
phone push, security emails, retention and clean-up) in a process of their own, with no web
traffic. Run exactly one, beside web servers started with ``RUN_BACKGROUND_JOBS=false``.

Running two by mistake is safe (each job locks what it works on, and the alert and fraud rules
keep one live alert per subject), only wasteful. It reads the same settings as the web server.
On SIGTERM or SIGINT it stops after the current round.
"""

from __future__ import annotations

import asyncio
import signal

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.main import build_auth_runtime, planned_tasks
from app.services.auth import AuthRuntime

__all__ = ["main", "run_worker"]

_logger = get_logger(__name__)


def _check(settings: Settings) -> None:
    if not settings.database_url:
        raise SystemExit("The worker needs DATABASE_URL (ADR-085)")
    if settings.pretend_bank:
        # ADR-037: the pretend bank lives in the memory of the web server that holds it.
        raise SystemExit(
            "PRETEND_BANK runs inside the web server; keep RUN_BACKGROUND_JOBS=true there and "
            "don't start a worker (ADR-085)"
        )


async def run_worker(settings: Settings, runtime: AuthRuntime, stop: asyncio.Event) -> list[str]:
    """Run every worker loop until ``stop`` is set; returns the names of the loops run."""
    plan = planned_tasks(settings, runtime, role="worker")
    tasks = [asyncio.create_task(start(), name=name) for name, start in plan.items()]
    _logger.info("worker_started", extra={"jobs": sorted(plan)})
    try:
        await stop.wait()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        _logger.info("worker_stopped")
    return sorted(plan)


async def _main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    _check(settings)
    runtime = build_auth_runtime(settings)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    await run_worker(settings, runtime, stop)


def main() -> None:  # pragma: no cover - the process entry point
    asyncio.run(_main())


if __name__ == "__main__":  # pragma: no cover
    main()
