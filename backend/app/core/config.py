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
from typing import Literal

from pydantic import field_validator
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

    Empty and unset values pass through untouched: the application must still boot,
    serve ``/health`` and run its unit suite with no database, and a missing URL is
    reported by ``app.db.session`` as ``DatabaseNotConfiguredError`` at the point of use.
    """
    scheme = value.split("://", 1)[0]
    if scheme != SUPPORTED_DATABASE_SCHEME:
        raise ValueError(
            f"database_url must use {SUPPORTED_DATABASE_SCHEME}:// "
            f"(DECISION S4-3 / 4.1A-F1); got scheme {scheme!r}"
        )
    return value


class Settings(BaseSettings):
    """Environment-driven settings.

    Field names mirror the keys already present in `.env.example`. Future keys are
    retained and optional so that later milestones can adopt them without a rename.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
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

    cors_allowed_origins: str = ""

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
