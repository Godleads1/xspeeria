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
            database_url="postgresql+asyncpg://user:pw@host/db",
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


class TestUnexpectedErrorEnvelope:
    """An unhandled exception must leave through the envelope, carrying nothing.

    The route below exists only inside this test. It raises with a distinctive marker
    in the exception text so the assertions can prove that text never reaches the
    client. ``raise_server_exceptions=False`` makes the TestClient return the response
    the handler produced instead of re-raising, which is what a real client would see.
    """

    MARKER = "internal-detail-that-must-not-leak"

    def _client(self) -> TestClient:
        settings = Settings(_env_file=None)  # type: ignore[call-arg]
        app = create_app(settings)

        @app.get("/_test/unexpected")
        async def _boom() -> None:
            raise RuntimeError(f"{self.MARKER}: postgresql://user:pw@host/db")

        return TestClient(app, raise_server_exceptions=False)

    def test_returns_500(self) -> None:
        assert self._client().get("/_test/unexpected").status_code == 500

    def test_uses_the_standard_envelope(self) -> None:
        body = self._client().get("/_test/unexpected").json()
        assert set(body) == {"error"}
        assert body["error"]["code"] == "INTERNAL_ERROR"
        assert body["error"]["message"] == "An unexpected error occurred."
        assert "details" not in body["error"]

    def test_exposes_no_exception_text_or_traceback(self) -> None:
        text = self._client().get("/_test/unexpected").text
        for forbidden in (
            self.MARKER,
            "RuntimeError",
            "Traceback",
            "postgresql",
            "_boom",
            "test_health",
        ):
            assert forbidden not in text


class TestDocsExposure:
    """Documentation exposure.

    Asserting only ``/docs`` let the machine-readable schema stay public in production
    while this test reported green. Every documentation surface is named explicitly.
    """

    def test_docs_are_served_locally(self) -> None:
        assert _client(app_env="local", enable_docs=True).get("/docs").status_code == 200

    def test_redoc_is_served_locally_when_enabled(self) -> None:
        client = _client(app_env="local", enable_docs=True, enable_redoc=True)
        assert client.get("/redoc").status_code == 200

    def test_schema_is_served_locally(self) -> None:
        assert _client(app_env="local", enable_docs=True).get("/openapi.json").status_code == 200

    def test_docs_are_not_served_in_production(self) -> None:
        assert _client(app_env="production", enable_docs=True).get("/docs").status_code == 404

    def test_redoc_is_not_served_in_production(self) -> None:
        client = _client(app_env="production", enable_docs=True, enable_redoc=True)
        assert client.get("/redoc").status_code == 404

    def test_schema_is_not_served_in_production(self) -> None:
        """The schema outlived the UIs that render it. It must not."""
        client = _client(app_env="production", enable_docs=True, enable_redoc=True)
        assert client.get("/openapi.json").status_code == 404
