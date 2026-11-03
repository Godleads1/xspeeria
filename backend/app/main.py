"""FastAPI application factory.

Milestone 1 wires configuration, structured logging, the error envelope and a single
health route. Milestone AUTH-1 (ADR-025) adds the sign-in and current-user routes and the
request log. Milestone 4.1C (ADR-029) adds offers: records of intent, never money.
Milestone 4.1F (ADR-037) adds the escrow steps, with a pretend partner bank only
(``PRETEND_BANK=true`` and ``APP_ENV=local``).

Sign-in needs ``JWT_SECRET_KEY`` (at least 32 characters) and ``MFA_ENCRYPTION_KEY`` (base64 of
32 bytes, ADR-026). Without either, the auth routes answer
``SYS_503_SERVICE_UNAVAILABLE`` and the rest of the application still boots. No SMS provider
is connected (ADR-025 §2): tests inject one through ``auth_runtime``, and ``DEV_SMS=true``
with ``APP_ENV=local`` prints codes to the terminal on a developer's computer (ADR-027).
"""

from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator, Callable, Coroutine
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    admin,
    adverts,
    auth,
    disputes,
    health,
    kyc,
    limits,
    notices,
    notifications,
    offers,
    push,
    security_report,
    settlement,
)
from app.core.api_metrics import recorder, track_job
from app.core.auth_tokens import ALGORITHM, TokenKeys
from app.core.config import Settings, get_settings
from app.core.error_tracking import init_error_tracking
from app.core.exceptions import install_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.mfa import SecretBox
from app.core.pin_hashing import PinHasher
from app.core.rate_limit import DatabaseRateLimiter, RateLimiter, SlidingWindowLimiter
from app.core.request_logging import install_request_logging
from app.domain.auth_rules import (
    CHECKS_PER_DAY,
    CHECKS_PER_HOUR,
    LOGIN_REQUESTS_PER_MINUTE,
    MAX_PIN_TRIES,
    PIN_LOCK,
)
from app.domain.offer_rules import MARKET_REQUESTS_PER_MINUTE
from app.providers.bank_check import DevNameCheck
from app.providers.didit import DiditClient
from app.providers.email import DevConsoleEmailSender, EmailSender, ResendEmailSender
from app.providers.face import DevFaceCheck, DiditFaceCheck, FaceCheckProvider
from app.providers.object_store import LocalFolderStore, ObjectStore
from app.providers.pretend_bank import PretendBank
from app.providers.push import ExpoPushSender
from app.providers.sms import DevConsoleSmsSender, SmsSender
from app.providers.tier_checks import DevTierChecks, DiditTierChecks, TierCheckProvider
from app.services.auth import AuthRuntime

__all__ = ["build_auth_runtime", "create_app", "app"]


def build_auth_runtime(settings: Settings) -> AuthRuntime:
    """Production wiring. Fails fast on a misconfigured key rather than half-working."""
    if settings.jwt_algorithm and settings.jwt_algorithm != ALGORITHM:
        raise ValueError(f"jwt_algorithm must be {ALGORITHM} (ADR-025)")
    if (
        settings.is_production
        and settings.jwt_secret_key
        and "CHANGE_ME" in settings.jwt_secret_key
    ):
        raise ValueError("JWT_SECRET_KEY is still the .env.example placeholder")
    if (
        settings.is_production
        and settings.mfa_encryption_key
        and "CHANGE_ME" in settings.mfa_encryption_key
    ):
        raise ValueError("MFA_ENCRYPTION_KEY is still the .env.example placeholder")
    keys = TokenKeys(settings.jwt_secret_key) if settings.jwt_secret_key else None
    box = SecretBox(settings.mfa_encryption_key) if settings.mfa_encryption_key else None
    if settings.kyc_dev_bypass and settings.app_env != "local":
        raise ValueError("KYC_DEV_BYPASS is allowed only with APP_ENV=local (ADR-029)")
    if settings.bank_check_dev and settings.app_env != "local":
        raise ValueError("BANK_CHECK_DEV is allowed only with APP_ENV=local (ADR-035)")
    if (
        settings.is_production
        and settings.beneficiary_encryption_key
        and "CHANGE_ME" in settings.beneficiary_encryption_key
    ):
        raise ValueError("BENEFICIARY_ENCRYPTION_KEY is still the .env.example placeholder")
    beneficiary_box = (
        SecretBox(settings.beneficiary_encryption_key, name="BENEFICIARY_ENCRYPTION_KEY")
        if settings.beneficiary_encryption_key
        else None
    )
    if settings.pretend_bank and settings.app_env != "local":
        raise ValueError("PRETEND_BANK is allowed only with APP_ENV=local (ADR-037)")
    clock = lambda: datetime.now(UTC)  # noqa: E731 - one clock shared by the runtime
    sms: SmsSender | None = None
    if settings.dev_sms:
        if settings.app_env != "local":
            raise ValueError("DEV_SMS is allowed only with APP_ENV=local (ADR-027)")
        sms = DevConsoleSmsSender()
    email: EmailSender | None = None
    if settings.dev_email:
        if settings.app_env != "local":
            raise ValueError("DEV_EMAIL is allowed only with APP_ENV=local (ADR-054)")
        if settings.resend_api_key:
            raise ValueError("Set DEV_EMAIL or RESEND_API_KEY, not both (ADR-082)")
        email = DevConsoleEmailSender()
    elif settings.resend_api_key or settings.email_from:
        # ADR-082: Resend, once the owner has an account and a verified sending domain.
        if not (settings.resend_api_key and settings.email_from):
            raise ValueError("Resend needs both RESEND_API_KEY and EMAIL_FROM (ADR-082)")
        email = ResendEmailSender(settings.resend_api_key, settings.email_from)
    # Local demo testing only (owner 2026-10-27): one person signs in and approves many times.
    relaxed = settings.test_limits_dev
    if relaxed and settings.app_env != "local":
        raise ValueError("TEST_LIMITS_DEV is allowed only with APP_ENV=local")
    if settings.demo_autopilot and settings.app_env != "local":
        raise ValueError("DEMO_AUTOPILOT is allowed only with APP_ENV=local")
    if settings.is_production and not settings.super_admin_key_required:
        # ADR-051 Decision 2: before live money every Super Admin uses a hardware security key.
        raise ValueError("SUPER_ADMIN_KEY_REQUIRED must be true in production (ADR-081)")
    if settings.is_production and (
        settings.staff_key_rp_id == "localhost"
        or not settings.staff_key_origin.startswith("https://")
    ):
        raise ValueError(
            "STAFF_KEY_RP_ID and STAFF_KEY_ORIGIN must name the console's https address in "
            "production (ADR-081)"
        )
    if settings.is_production and not settings.public_api_url.startswith("https://"):
        # ADR-084: the "this wasn't me" link in every security email points here.
        raise ValueError("PUBLIC_API_URL must be the API's https address in production (ADR-084)")
    return AuthRuntime(
        keys=keys,
        secret_box=box,
        hasher=PinHasher(),
        sms=sms,
        clock=clock,
        address_limiter=_limiter(
            settings,
            "addr",
            limit=LOGIN_REQUESTS_PER_MINUTE * (20 if relaxed else 1),
            window=timedelta(minutes=1),
        ),
        unknown_identifier_limiter=_limiter(
            settings, "unknown_id", limit=MAX_PIN_TRIES, window=PIN_LOCK
        ),
        user_limiter=_limiter(
            settings, "user", limit=MARKET_REQUESTS_PER_MINUTE, window=timedelta(minutes=1)
        ),
        beneficiary_box=beneficiary_box,
        name_check=DevNameCheck() if settings.bank_check_dev else None,
        pretend_bank=PretendBank(clock) if settings.pretend_bank else None,
        kyc_provider=_didit(settings),
        kyc_identity_key=_kyc_identity_key(settings),
        kyc_identity_key_previous=_kyc_identity_key_previous(settings),
        push_sender=ExpoPushSender(settings.expo_access_token) if settings.push_enabled else None,
        email=email,
        face=_face_check(settings),
        checks_per_hour=CHECKS_PER_HOUR * (20 if relaxed else 1),
        checks_per_day=CHECKS_PER_DAY * (20 if relaxed else 1),
        tier_checks=_tier_checks(settings),
        object_store=_object_store(settings),
        staff_key_rp_id=settings.staff_key_rp_id,
        staff_key_origin=settings.staff_key_origin,
        super_admin_key_required=settings.super_admin_key_required,
        public_api_url=settings.public_api_url,
    )


def _limiter(settings: Settings, name: str, *, limit: int, window: timedelta) -> RateLimiter:
    """ADR-080: with a database, limits are shared by every server and survive restarts.

    Without one (``/health`` only, unit tests) the in-memory limiter is used: one server only.
    """
    if not settings.database_url:
        return SlidingWindowLimiter(limit=limit, window=window)
    from app.db.session import get_sessionmaker

    return DatabaseRateLimiter(
        name=name, limit=limit, window=window, sessions=get_sessionmaker(settings)
    )


def _object_store(settings: Settings) -> ObjectStore | None:
    """ADR-049/060: the Cloudflare R2 client comes with the bucket; locally, a folder."""
    if not settings.local_photo_dir:
        return None
    if settings.app_env != "local":
        raise ValueError("LOCAL_PHOTO_DIR is allowed only with APP_ENV=local (ADR-060)")
    return LocalFolderStore(settings.local_photo_dir)


def _tier_checks(settings: Settings) -> TierCheckProvider | None:
    """ADR-058: Didit BVN and proof-of-address checks; locally, with the identity bypass, a
    developer stand-in that makes no call and costs nothing."""
    if settings.kyc_dev_bypass and settings.app_env == "local":
        return DevTierChecks()
    if not settings.didit_api_key:
        return None
    if not settings.didit_base_url.startswith("https://"):
        raise ValueError("DIDIT_BASE_URL must be https")
    return DiditTierChecks(settings.didit_api_key, settings.didit_base_url)


def _face_check(settings: Settings) -> FaceCheckProvider | None:
    """ADR-054: Didit biometric authentication, or the local-only developer check."""
    if settings.face_check_dev:
        if settings.app_env != "local":
            raise ValueError("FACE_CHECK_DEV is allowed only with APP_ENV=local (ADR-054)")
        return DevFaceCheck()
    workflow = settings.didit_auth_workflow_id
    if not workflow:
        return None
    if not settings.didit_api_key:
        raise ValueError("DIDIT_AUTH_WORKFLOW_ID needs DIDIT_API_KEY (ADR-054)")
    if "CHANGE_ME" in workflow:
        raise ValueError("DIDIT_AUTH_WORKFLOW_ID is still the .env.example placeholder")
    if not settings.didit_base_url.startswith("https://"):
        raise ValueError("DIDIT_BASE_URL must be https")
    return DiditFaceCheck(
        settings.didit_api_key,
        workflow,
        settings.didit_base_url,
        settings.didit_callback_url,
    )


def _didit(settings: Settings) -> DiditClient | None:
    """ADR-039: all three Didit values, or none (identity checks off)."""
    parts = (settings.didit_api_key, settings.didit_workflow_id, settings.didit_webhook_secret)
    if not any(parts):
        return None
    if not all(parts):
        raise ValueError("DIDIT_API_KEY, DIDIT_WORKFLOW_ID and DIDIT_WEBHOOK_SECRET go together")
    if any("CHANGE_ME" in str(p) for p in parts):
        raise ValueError("Didit settings are still .env.example placeholders")
    if not settings.didit_base_url.startswith("https://"):
        raise ValueError("DIDIT_BASE_URL must be https")
    if settings.didit_callback_url and not settings.didit_callback_url.startswith(
        ("https://", "xspeeria://")
    ):
        raise ValueError("DIDIT_CALLBACK_URL must be https or the app's own scheme")
    return DiditClient(
        str(settings.didit_api_key),
        str(settings.didit_workflow_id),
        str(settings.didit_webhook_secret),
        settings.didit_base_url,
        settings.didit_callback_url,
    )


def _kyc_identity_key(settings: Settings) -> bytes | None:
    """ADR-041: required with Didit; base64 of exactly 32 bytes."""
    raw = settings.kyc_identity_key
    if not raw:
        if settings.didit_api_key:
            raise ValueError("KYC_IDENTITY_KEY is required when Didit is configured (ADR-041)")
        return None
    return _identity_key_bytes(raw, "KYC_IDENTITY_KEY")


def _kyc_identity_key_previous(settings: Settings) -> bytes | None:
    """ADR-076: the document key before the last rotation, if any."""
    raw = settings.kyc_identity_key_previous
    if not raw:
        return None
    key = _identity_key_bytes(raw, "KYC_IDENTITY_KEY_PREVIOUS")
    if raw == settings.kyc_identity_key:
        raise ValueError("KYC_IDENTITY_KEY_PREVIOUS is the same as KYC_IDENTITY_KEY")
    return key


def _identity_key_bytes(raw: str, name: str) -> bytes:
    if "CHANGE_ME" in raw:
        raise ValueError(f"{name} is still the .env.example placeholder")
    try:
        key = base64.b64decode(raw, validate=True)
    except ValueError as exc:
        raise ValueError(f"{name} must be base64") from exc
    if len(key) != 32:
        raise ValueError(f"{name} must decode to 32 bytes")
    return key


async def _sweep_preparations(settings: Settings, runtime: AuthRuntime) -> None:
    """Expire deals whose payout-account window ran out (ADR-035). Runs until cancelled."""
    from app.db.session import get_sessionmaker
    from app.services.fraud import FraudService
    from app.services.matches import MatchService
    from app.services.queue import QueueService

    log = get_logger(__name__)
    while True:
        await asyncio.sleep(settings.preparation_sweep_seconds)
        try:
            async with get_sessionmaker(settings)() as db:
                every = settings.preparation_sweep_seconds
                with track_job("Deal expiry", every):  # ADR-072: each job is monitored
                    await MatchService(db, runtime.clock).expire_due()
                # ADR-059 Decision 4: missed turns pass on; finished offers end their queues.
                with track_job("Waiting queues", every):
                    await QueueService(db, runtime.clock).sweep()
                # ADR-068: simple fraud rules over data Xspeeria already has.
                with track_job("Fraud scan", every):
                    await FraudService(db, runtime.clock).scan()
        except Exception:  # noqa: BLE001 - keep sweeping; the next pass retries
            log.exception("preparation_sweep_failed")


async def _ops_alert_loop(settings: Settings, runtime: AuthRuntime) -> None:
    """ADR-074: operations alert rules for Super Admins, once a minute (SEC-037)."""
    from app.db.session import get_sessionmaker
    from app.services.ops_alerts import OpsAlertService

    log = get_logger(__name__)
    while True:
        await asyncio.sleep(settings.ops_alert_seconds)
        try:
            async with get_sessionmaker(settings)() as db:
                with track_job("Alert rules", settings.ops_alert_seconds):
                    await OpsAlertService(db, runtime.clock, settings, runtime.email).scan()
        except Exception:  # noqa: BLE001 - keep checking; the next pass retries
            log.exception("ops_alert_scan_failed")


async def _escrow_loop(settings: Settings, runtime: AuthRuntime) -> None:
    """Escrow background work (ADR-037): funding windows, partner commands, partner messages."""
    from app.db.session import get_sessionmaker
    from app.services.settlement import SettlementService

    log = get_logger(__name__)
    while True:
        await asyncio.sleep(settings.escrow_tick_seconds)
        try:
            async with get_sessionmaker(settings)() as db:
                with track_job("Escrow processing", settings.escrow_tick_seconds):
                    await SettlementService(db, runtime.clock, runtime.pretend_bank).tick()
        except Exception:  # noqa: BLE001 - keep going; the next pass retries
            log.exception("escrow_tick_failed")


async def _demo_autopilot_loop(settings: Settings, runtime: AuthRuntime) -> None:
    """Local demo testing only (owner 2026-10-27): the robot demo customers trade back."""
    from app.db.session import get_sessionmaker
    from app.services.demo_autopilot import DemoAutopilot

    log = get_logger(__name__)
    while True:
        await asyncio.sleep(settings.escrow_tick_seconds)
        try:
            async with get_sessionmaker(settings)() as db:
                with track_job("Demo robots", settings.escrow_tick_seconds):
                    robots = DemoAutopilot(db, runtime.clock, runtime.pretend_bank, settings)
                    await robots.run_once()
        except Exception:  # noqa: BLE001 - a failed round must not stop the loop
            log.exception("demo_autopilot_failed")


async def _activity_retention_loop(settings: Settings) -> None:
    """ADR-073: the customer activity log is kept 5 years; older rows are deleted hourly (the
    database refuses to delete anything younger). ADR-080: and rate-limit attempts after an
    hour."""
    from sqlalchemy import text

    from app.core.rate_limit import prune_rate_limit_hits
    from app.db.session import get_sessionmaker

    log = get_logger(__name__)
    while True:
        await asyncio.sleep(3600)
        try:
            async with get_sessionmaker(settings)() as db:
                with track_job("Activity log retention", 3600):
                    await db.execute(
                        text("DELETE FROM customer_activity WHERE at < now() - interval '5 years'")
                    )
                    await db.commit()
                # ADR-080: rate-limit attempts are only needed for an hour.
                with track_job("Rate-limit cleanup", 3600):
                    await prune_rate_limit_hits(db, datetime.now(UTC))
        except Exception:  # noqa: BLE001 - try again next hour
            log.exception("activity_retention_failed")


async def _metrics_loop(settings: Settings) -> None:
    """ADR-072: add this server's API and job figures to the database once a minute."""
    from app.db.session import get_sessionmaker

    log = get_logger(__name__)
    while True:
        await asyncio.sleep(settings.metrics_flush_seconds)
        try:
            async with get_sessionmaker(settings)() as db:
                await recorder.flush(db)
        except Exception:  # noqa: BLE001 - figures are best effort; the next minute retries
            log.exception("metrics_flush_failed")


async def _push_loop(settings: Settings, runtime: AuthRuntime) -> None:
    """Send new notifications to phones (ADR-052). Runs until cancelled."""
    from app.db.session import get_sessionmaker
    from app.services.push import PushDispatcher

    log = get_logger(__name__)
    sender = runtime.push_sender
    if sender is None:  # pragma: no cover - only started when a sender exists
        return
    while True:
        await asyncio.sleep(settings.push_tick_seconds)
        try:
            async with get_sessionmaker(settings)() as db:
                with track_job("Phone push", settings.push_tick_seconds):
                    await PushDispatcher(db, runtime.clock, sender).run_once()
        except Exception:  # noqa: BLE001 - a failed round must not stop the loop
            log.exception("push_round_failed")


async def _security_notice_loop(settings: Settings, runtime: AuthRuntime) -> None:
    """ADR-084: email "was this you?" notices with their "this wasn't me" link."""
    from app.db.session import get_sessionmaker
    from app.services.security_notices import SecurityNoticeSender

    log = get_logger(__name__)
    email = runtime.email
    if email is None:  # pragma: no cover - only started when a sender exists
        return
    while True:
        await asyncio.sleep(settings.security_notice_seconds)
        try:
            async with get_sessionmaker(settings)() as db:
                with track_job("Security emails", settings.security_notice_seconds):
                    await SecurityNoticeSender(
                        db, runtime.clock, email, runtime.public_api_url
                    ).run_once()
        except Exception:  # noqa: BLE001 - a failed round must not stop the loop
            log.exception("security_notice_round_failed")


TaskRole = Literal["web", "worker"]


def planned_tasks(
    settings: Settings, runtime: AuthRuntime, *, role: TaskRole
) -> dict[str, Callable[[], Coroutine[Any, Any, None]]]:
    """ADR-085: which background loops a process runs, by name.

    * Every process (web server or worker) flushes its own API and job figures (ADR-072)
      and checks the operations alert rules (ADR-074). The alert check is idempotent between
      processes, so the web servers keep watching even when the worker has stopped.
    * The jobs (deal expiry, queues, fraud scan, escrow, push, security emails, clean-ups)
      run in the worker, or in the web server when ``RUN_BACKGROUND_JOBS`` is true (one
      server, or a developer's computer).
    * The pretend bank (ADR-037) lives in one process's memory, so its escrow work and the
      demo robots stay in the web server that holds it.
    """
    s, rt = settings, runtime
    out: dict[str, Callable[[], Coroutine[Any, Any, None]]] = {}
    if not s.database_url:
        return out
    if s.metrics_flush_seconds > 0:
        out["metrics"] = lambda: _metrics_loop(s)
    if s.ops_alert_seconds > 0:
        out["alert rules"] = lambda: _ops_alert_loop(s, rt)
    jobs_here = role == "worker" or s.run_background_jobs
    in_memory_bank = rt.pretend_bank is not None
    if jobs_here:
        if s.preparation_sweep_seconds > 0:
            out["deal expiry, queues, fraud scan"] = lambda: _sweep_preparations(s, rt)
            out["retention and clean-up"] = lambda: _activity_retention_loop(s)
        if rt.push_sender is not None and s.push_tick_seconds > 0:
            out["phone push"] = lambda: _push_loop(s, rt)
        if rt.email is not None and s.security_notice_seconds > 0:
            out["security emails"] = lambda: _security_notice_loop(s, rt)
    if role == "web" and in_memory_bank and s.escrow_tick_seconds > 0:
        out["escrow (pretend bank)"] = lambda: _escrow_loop(s, rt)
    if role == "web" and in_memory_bank and s.demo_autopilot:
        out["demo robots"] = lambda: _demo_autopilot_loop(s, rt)
    return out


def create_app(
    settings: Settings | None = None, auth_runtime: AuthRuntime | None = None
) -> FastAPI:
    """Build the application. Accepts injected settings so tests need no environment."""
    resolved = settings or get_settings()
    configure_logging(resolved.log_level)

    runtime = auth_runtime or build_auth_runtime(resolved)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        tasks = [
            asyncio.create_task(start(), name=name)
            for name, start in planned_tasks(resolved, runtime, role="web").items()
        ]
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()

    application = FastAPI(
        lifespan=lifespan,
        title=resolved.app_name,
        version="0.0.0",
        docs_url=resolved.docs_url,
        redoc_url=resolved.redoc_url,
        openapi_url=resolved.openapi_url,
    )

    application.state.settings = resolved
    application.state.auth = runtime
    install_exception_handlers(application)
    install_request_logging(application)
    init_error_tracking(resolved)  # ADR-074: off unless SENTRY_DSN is set
    if resolved.cors_origins:
        # Only explicitly listed origins (none by default). Native apps do not need CORS;
        # this exists for a browser build of the app pointed at a local server.
        application.add_middleware(
            CORSMiddleware,
            allow_origins=resolved.cors_origins,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "X-Step-Up-Token",
                "X-Request-ID",
                "Idempotency-Key",
            ],
            allow_credentials=False,
        )
    application.include_router(health.router)
    application.include_router(auth.router)
    application.include_router(auth.account_router)
    application.include_router(admin.router)
    application.include_router(offers.router)
    application.include_router(offers.marketplace_router)
    application.include_router(offers.matches_router)
    application.include_router(offers.payout_accounts_router)
    application.include_router(kyc.router)
    application.include_router(kyc.webhooks_router)
    application.include_router(notifications.router)
    application.include_router(disputes.router)
    application.include_router(limits.router)
    application.include_router(notices.router)
    application.include_router(adverts.router)
    application.include_router(push.router)
    application.include_router(security_report.router)
    application.include_router(settlement.router)
    application.include_router(settlement.webhooks_router)
    if resolved.app_env == "local" and runtime.pretend_bank is not None:
        application.include_router(settlement.dev_router)  # ADR-037: simulation only

    get_logger(__name__).info(
        "application_configured",
        extra={"environment": resolved.app_env, "api_version": resolved.api_v},
    )
    return application


app = create_app()
