"""Health endpoint and error-envelope tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def _client(**overrides: object) -> TestClient:
    settings = Settings(_env_file=None, **overrides)  # type: ignore[call-arg,arg-type]
    return TestClient(create_app(settings))


class TestHealth:
    def test_returns_ok_without_any_infrastructure(self) -> None:
        """No database, Redis, Celery, secret or partner credential is configured."""
        response = _client().get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["app"] == "Xspeeria"
        assert body["environment"] == "local"
        assert body["api_version"] == "v1"

    def test_leaks_no_secret_or_infrastructure_detail(self) -> None:
        response = _client(
            jwt_secret_key="super-secret",
            database_url="postgresql://user:pw@host/db",
            webhook_shared_secret="whsec",
        ).get("/health")
        text = response.text
        assert "super-secret" not in text
        assert "postgresql" not in text
        assert "whsec" not in text
        assert set(response.json()) == {"status", "app", "environment", "api_version"}

    def test_reports_the_configured_environment(self) -> None:
        response = _client(app_env="staging").get("/health")
        assert response.json()["environment"] == "staging"


class TestErrorEnvelope:
    def test_unknown_route_uses_the_error_envelope(self) -> None:
        response = _client().get("/no-such-route")
        assert response.status_code == 404
        body = response.json()
        assert "error" in body
        assert body["error"]["code"] == "HTTP_ERROR"
        assert isinstance(body["error"]["message"], str)


class TestDocsExposure:
    def test_docs_are_served_locally(self) -> None:
        assert _client(app_env="local", enable_docs=True).get("/docs").status_code == 200

    def test_docs_are_not_served_in_production(self) -> None:
        assert _client(app_env="production", enable_docs=True).get("/docs").status_code == 404
