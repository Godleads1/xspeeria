"""Settings tests.

The point of these is the Milestone 1 boundary: the application must configure itself
with no database, no Redis, no Celery, no partner credentials and no JWT secret.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings, get_settings


class TestDefaults:
    def test_boots_with_no_environment_at_all(self, monkeypatch: pytest.MonkeyPatch) -> None:
        for key in (
            "APP_NAME", "APP_ENV", "DEBUG", "API_V", "LOG_LEVEL",
            "DATABASE_URL", "REDIS_URL", "CELERY_BROKER_URL", "CELERY_RESULT_BACKEND",
            "JWT_SECRET_KEY", "JWT_ALGORITHM", "JWT_ACCESS_TOKEN_EXPIRE_MINUTES",
            "WEBHOOK_SHARED_SECRET", "CORS_ALLOWED_ORIGINS",
        ):
            monkeypatch.delenv(key, raising=False)
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
