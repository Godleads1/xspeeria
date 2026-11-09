"""Application settings.

Every value that Milestone 1 does not need is **optional**. The application must boot,
serve `/health` and run its test suite with no database, no Redis, no Celery, no
partner credentials, no webhook secret and no production JWT configuration.

Nothing here invents a value that Decision 2 owns: there are no MFA rules, password
parameters, lockout thresholds, session expiries, rate limits or recovery rules. The
JWT expiry below is a transport-level default carried over from `.env.example` and is
**not** a security-policy decision.

There is deliberately **no `debug` setting**. It existed here, was read by nothing, and
the obvious way to use it -- passing it to ``FastAPI(debug=...)`` -- makes Starlette
return full tracebacks in HTTP responses, so one stray environment value would disclose
internals from production. Reintroducing it needs an explicit, approved
environment/security policy, not a default. Dead configuration that is one line away
from being dangerous is worse than no configuration.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

__all__ = ["Settings", "get_settings", "require_supported_database_url"]

Environment = Literal["local", "development", "staging", "production"]

#: The only database scheme the Stage 4 authoritative persistence runtime accepts
#: (DECISION S4-3, reaffirmed by DECISION 4.1A-F1 -- HUMAN-APPROVED 2026-08-26).
SUPPORTED_DATABASE_SCHEME = "postgresql+asyncpg"


def require_supported_database_url(value: str) -> str:
    """Reject any database URL that is not ``postgresql+asyncpg://``.

    **This is a policy control, not a convenience check.** Before DECISION 4.1A-F1 the
    approved stack was enforced only by which driver packages happened to be installed:
    `sqlite+aiosqlite://` or `postgresql+psycopg://` were accepted by configuration and
    failed later with `ModuleNotFoundError`. That is enforcement by accident. The day
    `aiosqlite` arrives as a transitive dependency, the money path silently accepts a
    database that cannot express ``SELECT ... FOR UPDATE``, partial unique indexes or the
    CHECK constraints the acceptance boundary depends on -- and nothing would say so.

    **Only the scheme is inspected, and only the scheme may appear in the error.** Host,
    port, database name, username, password, SSL mode, pool sizing and provider are
    deployment facts this function has no authority over and never reads. A validation
    message that echoed the URL would put a credential in a log line, which is the
    failure this project audits for elsewhere.

    **The `://` separator must be present, and that requirement is doing two jobs.**
    The first implementation used ``value.split("://", 1)[0]``, which returns the *whole
    input* when the separator is absent -- so both the check and the error message
    operated on the entire value. That produced two defects from one line:

    * **Disclosure.** A delimiter-free value was echoed verbatim into the message.
      ``hide_input_in_errors`` suppresses pydantic's own ``input_value=`` rendering but
      cannot reach a custom message, so the value reached stdout, the log sink and any
      pasted traceback. This is not a theoretical input: a libpq keyword string
      (``host=... password=...``) and a pasted ``DATABASE_URL=...`` line both lack
      ``://`` and both carry a password.
    * **Acceptance.** The bare string ``postgresql+asyncpg`` -- no separator, not a URL
      at all -- compared equal to the approved scheme and **passed the policy**.

    ``partition`` separates "there was no scheme" from "the scheme was wrong", so the
    first case is reported without naming the value and the second is rejected on the
    scheme alone. Credentials in a URL always follow ``://``, so a named scheme can
    never contain one.

    Empty and unset values pass through untouched: the application must still boot,
    serve ``/health`` and run its unit suite with no database, and a missing URL is
    reported by ``app.db.session`` as ``DatabaseNotConfiguredError`` at the point of use.
    """
    scheme, separator, _ = value.partition("://")
    if not separator or scheme != SUPPORTED_DATABASE_SCHEME:
        # Never interpolate `scheme` unless the separator proved it *is* a scheme.
        detail = f"scheme {scheme!r}" if separator else "a value with no '://' separator"
        raise ValueError(
            f"database_url must use {SUPPORTED_DATABASE_SCHEME}:// "
            f"(DECISION S4-3 / 4.1A-F1); got {detail}"
        )
    return value


#: backend/app/core/config.py -> project root.
_PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Environment-driven settings.

    Field names mirror the keys already present in `.env.example`. Future keys are
    retained and optional so that later milestones can adopt them without a rename.
    """

    model_config = SettingsConfigDict(
        # The project-root `.env` (where the setup guide puts it), then one in the current
        # folder, so commands work from the project root and from `backend/` alike.
        env_file=(str(_PROJECT_ROOT / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        # Pydantic renders the offending input into `ValidationError` by default
        # (`input_value=...`). Every field on this model that can fail validation holds
        # exactly the kind of value that must never be echoed: a database URL with an
        # inline password, a JWT signing key, a webhook shared secret. A startup
        # traceback is written to stdout, shipped to the log sink and pasted into CI
        # transcripts and issue reports, so echoing the input turns a configuration
        # typo into credential disclosure. Verified by
        # TestDatabaseUrlPolicy::test_rejection_names_the_scheme_only, which failed
        # before this line: the full `mysql+aiomysql://user@host/db` appeared in the
        # message even though the validator itself names only the scheme.
        hide_input_in_errors=True,
    )

    app_name: str = "Xspeeria"
    app_env: Environment = "local"
    api_v: str = "v1"
    log_level: str = "INFO"
    enable_docs: bool = True
    enable_redoc: bool = False

    # --- Future infrastructure. Unset in Milestone 1; the app must not require them. ---
    database_url: str | None = None
    redis_url: str | None = None
    celery_broker_url: str | None = None
    celery_result_backend: str | None = None

    # --- Future security transport config. Values are NOT security policy. ---
    jwt_secret_key: str | None = None
    jwt_algorithm: str | None = None
    jwt_access_token_expire_minutes: int | None = None
    webhook_shared_secret: str | None = None
    #: AES-256-GCM key for the old authenticator secrets at rest (ADR-026). Unused since
    #: ADR-054 replaced the authenticator; kept so existing .env files still load.
    mfa_encryption_key: str | None = None
    #: ADR-027: print SMS codes to the server terminal. Refused unless app_env is "local".
    dev_sms: bool = False
    #: ADR-054: print email codes and alerts to the server terminal (no email provider yet).
    #: Refused unless app_env is "local".
    dev_email: bool = False
    #: ADR-082: real email through Resend. Both are needed; the sender's domain must be verified
    #: in Resend (DNS records). E.g. ``Xspeeria <no-reply@mail.example.com>``. Never logged.
    resend_api_key: str | None = None
    email_from: str | None = None
    #: ADR-054: pass every face check without a camera (no cost). Refused unless app_env is
    #: "local".
    face_check_dev: bool = False
    #: Local only (owner 2026-10-27, demo testing): sign-in and second-check limits raised so
    #: one person can test all day. Refused unless APP_ENV=local.
    test_limits_dev: bool = False
    #: Local only (owner 2026-10-27): the robot demo customers trade back by themselves
    #: (app.services.demo_autopilot). Refused unless APP_ENV=local.
    demo_autopilot: bool = False
    #: ADR-054: the Didit workflow of type BIOMETRIC_AUTHENTICATION (face check). Needs the
    #: Didit API key too. Unset: face checks are off (only FACE_CHECK_DEV, locally).
    didit_auth_workflow_id: str | None = None
    #: ADR-029: treat signed-in, 2FA-verified users as KYC-approved for offers. No KYC provider
    #: exists yet. Refused unless app_env is "local".
    kyc_dev_bypass: bool = False
    #: ADR-035: AES-256-GCM key for payout account numbers at rest (base64 of 32 bytes).
    #: Without it, payout accounts cannot be added. A KMS-managed key replaces it before go-live.
    beneficiary_encryption_key: str | None = None
    #: ADR-076: the old key while `app.cli.rotate_keys beneficiary` re-seals; then removed.
    beneficiary_encryption_key_previous: str | None = None
    #: ADR-035: a pretend bank name check that approves every account. No partner bank exists
    #: yet. Refused unless app_env is "local".
    bank_check_dev: bool = False
    #: ADR-035: how often the server looks for deals whose 30 minutes ran out (0 = never;
    #: expiry then happens only when the offer or deal is next touched).
    preparation_sweep_seconds: int = 30
    #: KYC-1 (ADR-039): Didit identity checks. All three secrets/ids are needed, or identity
    #: checks are switched off (503) and only the local KYC_DEV_BYPASS can approve anyone.
    #: Never logged or returned.
    didit_api_key: str | None = None
    didit_workflow_id: str | None = None
    didit_webhook_secret: str | None = None
    didit_base_url: str = "https://verification.didit.me"
    #: Where Didit sends the user after the check (optional; Didit's workflow default if unset).
    didit_callback_url: str | None = None
    #: ADR-041: base64 of 32 random bytes; keys the ID-document hash (one person, one
    #: verified account). Required whenever Didit is configured. Set once per environment.
    kyc_identity_key: str | None = None
    #: ADR-076: the old document key after a rotation; new checks are matched against both.
    kyc_identity_key_previous: str | None = None
    #: ADR-042: request header carrying the client's country from a trusted proxy (e.g.
    #: ``CF-IPCountry``). Only used to suggest a new country's check; grants nothing.
    client_country_header: str | None = None
    #: ADR-037: the pretend partner bank (escrow simulation). In memory, moves no money.
    #: Refused unless app_env is "local". Real partners need legal sign-off (ADR-001 §12).
    pretend_bank: bool = False
    #: ADR-037: how often escrow background work runs (funding windows, partner commands).
    escrow_tick_seconds: int = 5
    #: ADR-072: how often each server adds its API and job figures to the database.
    metrics_flush_seconds: int = 60
    #: ADR-074: how often the operations alert rules run (0: off).
    ops_alert_seconds: int = 60
    #: ADR-085: run the background jobs (deal expiry, escrow, push, security emails, clean-ups)
    #: inside this web server. True suits one server and a developer's computer. With several
    #: web servers, set it false on all of them and run ONE worker (`python -m app.worker`).
    #: Every web server still flushes its own figures and checks the alert rules, so a
    #: stopped worker is noticed.
    run_background_jobs: bool = True
    #: ADR-085: database connections each process keeps open, and how many more it may open
    #: when busy. Unset: SQLAlchemy's defaults (5 and 10). Set them per deployment so that
    #: (web processes + worker) x (size + overflow) stays under the database's limit.
    db_pool_size: int | None = Field(default=None, ge=1, le=200)
    db_max_overflow: int | None = Field(default=None, ge=0, le=200)
    #: ADR-074: Sentry error tracking. Empty: off. Only scrubbed error details are sent.
    sentry_dsn: str | None = None
    #: ADR-074: the release Sentry files errors under (e.g. the git commit). Optional.
    sentry_release: str | None = None

    #: ADR-052: send phone push through Expo (FCM/APNs). Off: notifications stay in-app.
    push_enabled: bool = False
    #: ADR-052: optional Expo access token ("enhanced push security"). Never logged.
    expo_access_token: str | None = None
    #: ADR-052: how often new notifications are pushed.
    push_tick_seconds: int = 5

    #: ADR-060: on a developer's own computer only (APP_ENV=local), staff photos are kept in
    #: this folder until the Cloudflare R2 bucket exists (ADR-049). Empty: photos are off.
    local_photo_dir: str = ""
    cors_allowed_origins: str = ""

    #: ADR-081: security keys (WebAuthn) are bound to the admin console's web address. The
    #: "relying party" ID is its host name (e.g. ``admin.example.com``); the origin is the full
    #: address the console is opened at. Defaults fit ``npm run dev`` on a developer's computer.
    staff_key_rp_id: str = "localhost"
    staff_key_origin: str = "http://localhost:3000"
    #: ADR-051 Decision 2 / ADR-081: every Super Admin must sign in with a hardware security key.
    #: Required in production (live money). A Super Admin with no key yet can sign in only to
    #: register one.
    super_admin_key_required: bool = False
    #: ADR-084: the address customers' phones and browsers reach this API at. The "this
    #: wasn't me" link in security emails points here. Must be https in production.
    public_api_url: str = "http://localhost:8000"
    #: ADR-084: how often security notice emails are sent (seconds; 0 = off).
    security_notice_seconds: int = 10
    #: ADR-102 (owner 2026-11-09): fetch the CBN's USD, GBP and EUR rates automatically.
    #: "frankfurter": through the free Frankfurter API (no key). "off": use the reviewed
    #: snapshot in offer_rules. Once a rate has been stored, ceilings come from the stored
    #: rates, and a currency with none fetched in 3 days takes no new offers.
    official_rate_feed: Literal["off", "frankfurter"] = "off"
    #: ADR-102: how often the rates are fetched (seconds). The CBN publishes once a business day.
    official_rate_seconds: int = Field(default=3600, ge=60)

    @field_validator("database_url")
    @classmethod
    def _supported_database_url(cls, value: str | None) -> str | None:
        """Apply the 4.1A-F1 driver policy at configuration time, not at first query.

        Shares one implementation with ``migrations/env.py`` so the application runtime
        and the migration runtime cannot drift apart on what a valid database is.
        """
        return value if not value else require_supported_database_url(value)

    @field_validator("log_level")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        allowed = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}
        upper = value.upper()
        if upper not in allowed:
            raise ValueError(f"log_level must be one of {sorted(allowed)}")
        return upper

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def docs_url(self) -> str | None:
        return "/docs" if self.enable_docs and not self.is_production else None

    @property
    def redoc_url(self) -> str | None:
        return "/redoc" if self.enable_redoc and not self.is_production else None

    @property
    def openapi_url(self) -> str | None:
        """The schema is disabled in production alongside the docs UIs.

        Gated on the environment alone, not on ``enable_docs``: outside production the
        schema must stay reachable for the docs UI to load, and the machine-readable
        schema is the more useful artefact to an attacker, so it must not outlive the
        UIs that render it.
        """
        return None if self.is_production else "/openapi.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor. Cleared in tests via ``get_settings.cache_clear()``."""
    return Settings()
