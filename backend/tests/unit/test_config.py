"""Settings tests.

The point of these is the Milestone 1 boundary: the application must configure itself
with no database, no Redis, no Celery, no partner credentials and no JWT secret.
"""

from __future__ import annotations

import pytest

from app.core.config import SUPPORTED_DATABASE_SCHEME, Settings, get_settings

#: Every environment key `Settings` reads. `_env_file=None` blocks the `.env` file but
#: not the process environment, so without this a developer exporting `JWT_SECRET_KEY`
#: would fail `test_future_security_keys_are_optional` on their machine and nowhere else.
SETTINGS_ENV_KEYS = (
    "APP_NAME", "APP_ENV", "API_V", "LOG_LEVEL", "ENABLE_DOCS", "ENABLE_REDOC",
    "DATABASE_URL", "REDIS_URL", "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND",
    "JWT_SECRET_KEY", "JWT_ALGORITHM", "JWT_ACCESS_TOKEN_EXPIRE_MINUTES",
    "WEBHOOK_SHARED_SECRET", "CORS_ALLOWED_ORIGINS",
)


@pytest.fixture(autouse=True)
def isolate_settings_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Settings tests must assert on defaults, not on whoever ran them.

    `Settings` is case-insensitive, so both cases are cleared: on Linux a lowercase
    export is a distinct variable and would otherwise survive.
    """
    for key in SETTINGS_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
        monkeypatch.delenv(key.lower(), raising=False)


class TestDefaults:
    def test_boots_with_no_environment_at_all(self) -> None:
        settings = Settings(_env_file=None)  # type: ignore[call-arg]
        assert settings.app_name == "Xspeeria"
        assert settings.app_env == "local"
        assert settings.api_v == "v1"

    def test_future_infrastructure_keys_are_optional(self) -> None:
        settings = Settings(_env_file=None)  # type: ignore[call-arg]
        assert settings.database_url is None
        assert settings.redis_url is None
        assert settings.celery_broker_url is None
        assert settings.celery_result_backend is None

    def test_future_security_keys_are_optional(self) -> None:
        settings = Settings(_env_file=None)  # type: ignore[call-arg]
        assert settings.jwt_secret_key is None
        assert settings.jwt_algorithm is None
        assert settings.jwt_access_token_expire_minutes is None
        assert settings.webhook_shared_secret is None


class TestValidation:
    def test_log_level_is_normalised(self) -> None:
        assert Settings(_env_file=None, log_level="debug").log_level == "DEBUG"  # type: ignore[call-arg]

    def test_invalid_log_level_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="log_level"):
            Settings(_env_file=None, log_level="chatty")  # type: ignore[call-arg]

    def test_invalid_environment_is_rejected(self) -> None:
        with pytest.raises(ValueError):
            Settings(_env_file=None, app_env="wherever")  # type: ignore[call-arg,arg-type]


class TestDerived:
    def test_cors_origins_split_and_trimmed(self) -> None:
        settings = Settings(  # type: ignore[call-arg]
            _env_file=None, cors_allowed_origins="https://a.test, https://b.test ,"
        )
        assert settings.cors_origins == ["https://a.test", "https://b.test"]

    def test_cors_origins_default_is_empty(self) -> None:
        assert Settings(_env_file=None).cors_origins == []  # type: ignore[call-arg]

    def test_docs_are_disabled_in_production(self) -> None:
        settings = Settings(_env_file=None, app_env="production", enable_docs=True)  # type: ignore[call-arg]
        assert settings.is_production is True
        assert settings.docs_url is None
        assert settings.redoc_url is None

    def test_docs_enabled_outside_production(self) -> None:
        settings = Settings(_env_file=None, app_env="local", enable_docs=True)  # type: ignore[call-arg]
        assert settings.docs_url == "/docs"


class TestAccessor:
    def test_get_settings_is_cached(self) -> None:
        get_settings.cache_clear()
        assert get_settings() is get_settings()
        get_settings.cache_clear()


class TestDatabaseUrlPolicy:
    """DECISION 4.1A-F1 — the authoritative persistence runtime is PostgreSQL + asyncpg.

    Before this policy existed the approved stack was enforced only by which driver
    packages happened to be installed: ``Settings`` accepted every URL below, and the
    unsupported ones failed later with ``ModuleNotFoundError``. Enforcement by absent
    dependency is not enforcement -- one transitive ``aiosqlite`` and the money path would
    quietly accept a database that cannot express ``SELECT ... FOR UPDATE``, partial
    unique indexes, or the CHECK constraints the acceptance boundary depends on.

    The rejected cases below are the exact set adjudicated in DECISION 4.1A-F1.
    """

    REJECTED = (
        "postgresql://user@host:5432/db",
        "postgresql+psycopg://user@host:5432/db",
        "sqlite://",
        "sqlite+aiosqlite:///./money.db",
        "mysql://user@host/db",
        "mysql+aiomysql://user@host/db",
    )

    def test_postgresql_asyncpg_is_accepted(self) -> None:
        url = "postgresql+asyncpg://user@host:5432/db"
        assert Settings(_env_file=None, database_url=url).database_url == url  # type: ignore[call-arg]

    def test_none_is_accepted(self) -> None:
        """The application boots, serves /health and unit-tests with no database at all."""
        assert Settings(_env_file=None, database_url=None).database_url is None  # type: ignore[call-arg]

    def test_empty_string_is_accepted_and_stays_unconfigured(self) -> None:
        """``DATABASE_URL=`` means "no database", not "malformed database".

        It must not become a boot failure: the missing-configuration path is owned by
        ``app.db.session``, which raises ``DatabaseNotConfiguredError`` at the point of
        use with a message that names the real problem.
        """
        assert not Settings(_env_file=None, database_url="").database_url  # type: ignore[call-arg]

    @pytest.mark.parametrize("url", REJECTED)
    def test_unsupported_driver_is_rejected(self, url: str) -> None:
        with pytest.raises(ValueError, match="database_url"):
            Settings(_env_file=None, database_url=url)  # type: ignore[call-arg]

    @pytest.mark.parametrize("url", REJECTED)
    def test_rejection_names_the_scheme_only(self, url: str) -> None:
        """A validation message must never carry a credential.

        Only the scheme may appear. The host, database, username and password are not
        read by the validator and must not reach a log line, a stack trace or a CI
        transcript -- which is exactly how connection-string secrets escape in practice.
        """
        with pytest.raises(ValueError) as caught:
            Settings(_env_file=None, database_url=url)  # type: ignore[call-arg]

        message = str(caught.value)
        assert url.split("://", 1)[0] in message
        for secret_part in ("user", "host", "money.db", "/db", "5432"):
            assert secret_part not in message

    def test_env_supplied_url_is_policed_too(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """The environment is the route production actually uses."""
        monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///./money.db")
        with pytest.raises(ValueError, match="database_url"):
            Settings(_env_file=None)  # type: ignore[call-arg]

    def test_scheme_check_is_exact_not_a_prefix(self) -> None:
        """``postgresql://`` must not pass by being a prefix of the approved scheme."""
        with pytest.raises(ValueError, match="database_url"):
            Settings(_env_file=None, database_url="postgresql://user@host/db")  # type: ignore[call-arg]


class TestDatabaseUrlWithoutASchemeSeparator:
    """Values containing no ``://`` at all -- the case that produced two defects.

    ``value.split("://", 1)[0]`` returns the **entire input** when the separator is
    missing, so the original implementation both compared against and reported the whole
    value. Reviewer finding on 89db86b, verified by execution before this fix.
    """

    #: Each lacks `://`, and each is a realistic operator mistake rather than a contrived
    #: string. The libpq keyword form and the pasted-assignment form both carry a secret.
    NO_SEPARATOR = (
        "password=secret",
        "host=db.internal password=hunter2 dbname=xspeeria",
        "DATABASE_URL",
        "postgresql+asyncpg",
        "postgresql",
        "",  # handled earlier as "unconfigured", asserted here so that stays true
    )

    @pytest.mark.parametrize("value", [v for v in NO_SEPARATOR if v])
    def test_rejected(self, value: str) -> None:
        with pytest.raises(ValueError, match="database_url"):
            Settings(_env_file=None, database_url=value)  # type: ignore[call-arg]

    @pytest.mark.parametrize("value", [v for v in NO_SEPARATOR if v])
    def test_the_value_never_appears_in_the_error(self, value: str) -> None:
        """The regression this class exists for: no fragment of the input may be echoed.

        ``hide_input_in_errors`` cannot redact a custom message, so the validator itself
        must not interpolate a value it has not proven to be a scheme.
        """
        with pytest.raises(ValueError) as caught:
            Settings(_env_file=None, database_url=value)  # type: ignore[call-arg]

        # The message always names the approved scheme as a fixed literal ("must use
        # postgresql+asyncpg://"). That constant is removed before asserting, because
        # `postgresql` and `postgresql+asyncpg` are substrings of it -- without this the
        # assertion would fail on the constant while proving nothing about echoing.
        residue = str(caught.value).replace(f"{SUPPORTED_DATABASE_SCHEME}://", "")
        assert value not in residue
        for secret in ("secret", "hunter2", "db.internal", "xspeeria"):
            assert secret not in residue

    def test_the_bare_approved_scheme_is_not_a_url(self) -> None:
        """``postgresql+asyncpg`` with no separator previously PASSED the policy.

        It compared equal to the approved scheme, so a value that is not a URL at all was
        accepted by the control whose entire job is deciding which databases are allowed.
        """
        with pytest.raises(ValueError, match="database_url"):
            Settings(_env_file=None, database_url="postgresql+asyncpg")  # type: ignore[call-arg]

    def test_empty_string_is_still_unconfigured_not_rejected(self) -> None:
        """The boot-without-a-database path must survive this hardening."""
        assert not Settings(_env_file=None, database_url="").database_url  # type: ignore[call-arg]

    def test_alembic_path_rejects_it_too(self) -> None:
        """Shared authority: the migration runtime must not accept what Settings refuses."""
        from app.core.config import require_supported_database_url

        with pytest.raises(ValueError, match="database_url"):
            require_supported_database_url("host=db.internal password=hunter2")


class TestMigrationRuntimeSharesTheDatabasePolicy:
    """The migration runtime must not be a second door with a weaker lock.

    ``migrations/env.py`` resolves its URL from ``-x database_url=...``, a programmatic
    config attribute, or ``Settings``. The first two bypassed ``Settings`` entirely, so a
    migration could have been applied over psycopg or aiosqlite while the application
    refused the identical URL -- and the schema the tests verified would not be the schema
    the application talks to. Both now call the same function ``Settings`` calls.
    """

    def test_alembic_and_settings_share_one_implementation(self) -> None:
        from app.core.config import require_supported_database_url

        url = "postgresql+asyncpg://user@host/db"
        assert require_supported_database_url(url) == url
        with pytest.raises(ValueError, match="database_url"):
            require_supported_database_url("sqlite+aiosqlite:///./money.db")

    def test_migration_module_uses_the_shared_validator(self) -> None:
        """Pins the wiring: `env.py` must import the policy, not re-implement it."""
        from pathlib import Path

        source = (Path(__file__).resolve().parents[3] / "migrations" / "env.py").read_text(
            encoding="utf-8"
        )
        assert "require_supported_database_url" in source
