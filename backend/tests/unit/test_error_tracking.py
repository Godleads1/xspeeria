"""ADR-074: Sentry is off unless a DSN is set, and only the error itself is ever sent."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
import sentry_sdk

from app.core.config import Settings
from app.core.error_tracking import init_error_tracking, scrub

SECRET = "482613"  # a PIN, a code, a token: nothing like it may leave


@pytest.fixture(autouse=True)
def _no_sentry() -> Iterator[None]:
    yield
    sentry_sdk.init(dsn=None)  # back to a client that sends nothing


def _settings(**kw: Any) -> Settings:
    return Settings(_env_file=None, **kw)  # type: ignore[call-arg]


def test_off_without_a_dsn() -> None:
    assert init_error_tracking(_settings()) is False
    assert not sentry_sdk.get_client().is_active()


def test_on_with_a_dsn_and_strict_options() -> None:
    assert init_error_tracking(_settings(sentry_dsn="https://public@o0.ingest.example.invalid/1"))
    options = sentry_sdk.get_client().options
    assert options["send_default_pii"] is False
    assert options["include_local_variables"] is False
    assert options["max_request_body_size"] == "never"
    assert options["traces_sample_rate"] == 0.0
    assert options["before_send"] is scrub


def test_scrub_keeps_the_error_and_drops_everything_else() -> None:
    event: dict[str, Any] = {
        "request": {
            "method": "POST",
            "url": f"https://api.xspeeria.test/api/v1/auth/login?pin={SECRET}",
            "headers": {"Authorization": f"Bearer {SECRET}"},
            "cookies": {"xs_admin": SECRET},
            "data": {"pin": SECRET},
            "query_string": f"pin={SECRET}",
            "env": {"REMOTE_ADDR": "10.0.0.1"},
        },
        "user": {"id": "u-1", "email": "ada@example.com", "ip_address": "10.0.0.1"},
        "extra": {"body": SECRET},
        "server_name": "api-1",
        "contexts": {"runtime": {"name": "CPython"}, "response": {"body": SECRET}},
        "exception": {
            "values": [
                {
                    "type": "TimeoutError",
                    "value": "the bank did not answer",
                    "stacktrace": {
                        "frames": [{"function": "pay_out", "lineno": 7, "vars": {"pin": SECRET}}]
                    },
                }
            ]
        },
        "threads": {"values": [{"stacktrace": {"frames": [{"vars": {"token": SECRET}}]}}]},
        "breadcrumbs": {
            "values": [
                {"category": "httpx", "timestamp": 1, "message": SECRET, "data": {"q": SECRET}}
            ]
        },
    }
    out = scrub(event)
    assert SECRET not in str(out)
    assert "ada@example.com" not in str(out) and "10.0.0.1" not in str(out)
    assert out["request"] == {
        "method": "POST",
        "url": "https://api.xspeeria.test/api/v1/auth/login",
    }
    assert out["exception"]["values"][0]["type"] == "TimeoutError"
    assert out["exception"]["values"][0]["stacktrace"]["frames"][0]["function"] == "pay_out"
    assert out["contexts"] == {"runtime": {"name": "CPython"}}
    assert out["breadcrumbs"]["values"] == [{"category": "httpx", "timestamp": 1}]


def test_scrub_accepts_a_bare_event() -> None:
    assert scrub({"message": "x"}) == {"message": "x"}
