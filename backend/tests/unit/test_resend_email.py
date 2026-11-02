"""ADR-082: email through Resend. A fake HTTP transport stands in for Resend; nothing is sent."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from app.core.config import Settings
from app.main import build_auth_runtime
from app.providers.email import (
    RESEND_URL,
    DevConsoleEmailSender,
    EmailDeliveryError,
    ResendEmailSender,
)

pytestmark = pytest.mark.asyncio

KEY = "test-api-key-not-real"
FROM = "Xspeeria <no-reply@mail.xspeeria.test>"


class FakeResend:
    """Answers with the given status codes in order (or raises for "down")."""

    def __init__(self, *answers: int | str) -> None:
        self.answers = list(answers)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.answers.pop(0) if self.answers else 200
        if answer == "down":
            raise httpx.ConnectError("no route")
        assert isinstance(answer, int)
        return httpx.Response(answer, json={"id": "49a3999c"} if answer < 300 else {"name": "x"})

    def body(self, i: int = 0) -> dict[str, Any]:
        return dict(json.loads(self.requests[i].content))


def _sender(fake: FakeResend) -> ResendEmailSender:
    return ResendEmailSender(
        KEY, FROM, client=httpx.AsyncClient(transport=httpx.MockTransport(fake))
    )


async def test_a_code_is_sent_as_plain_text_to_resend() -> None:
    fake = FakeResend(200)
    await _sender(fake).send_code("ada@example.com", "482613")
    req = fake.requests[0]
    assert (req.method, str(req.url)) == ("POST", RESEND_URL)
    assert req.headers["authorization"] == f"Bearer {KEY}"
    assert 1 <= len(req.headers["idempotency-key"]) <= 256
    body = fake.body()
    assert body["from"] == FROM and body["to"] == ["ada@example.com"]
    assert body["subject"] == "Your Xspeeria code"
    assert "482613" in body["text"] and "10 minutes" in body["text"]
    assert "html" not in body and "http" not in body["text"]  # no links to imitate


async def test_a_retry_after_a_server_error_reuses_the_key_so_it_cant_send_twice() -> None:
    fake = FakeResend(503, 200)
    await _sender(fake).send_code("ada@example.com", "111111")
    assert len(fake.requests) == 2
    assert (
        fake.requests[0].headers["idempotency-key"] == fake.requests[1].headers["idempotency-key"]
    )


async def test_two_real_alerts_are_two_messages() -> None:
    """A second genuine "new log-in" alert must not be swallowed as a repeat."""
    fake = FakeResend(200, 200)
    s = _sender(fake)
    await s.send_alert("ada@example.com", "new_device_sign_in", "Pixel 9")
    await s.send_alert("ada@example.com", "new_device_sign_in", "Pixel 9")
    keys = {r.headers["idempotency-key"] for r in fake.requests}
    assert len(keys) == 2


async def test_a_network_failure_is_retried_once() -> None:
    fake = FakeResend("down", 200)
    await _sender(fake).send_ops_alert(
        "boss@example.com", "P1", "Escrow processing has stopped", "#3F2A"
    )
    assert len(fake.requests) == 2
    assert fake.body(1)["subject"] == "[P1] Escrow processing has stopped (#3F2A)"


@pytest.mark.parametrize("answers", [(422,), (401,), (503, 503), ("down", "down")])
async def test_failure_raises_without_naming_the_address_or_the_code(
    answers: tuple[Any, ...],
) -> None:
    fake = FakeResend(*answers)
    with pytest.raises(EmailDeliveryError) as err:
        await _sender(fake).send_code("ada@example.com", "739152")
    text = str(err.value)
    assert "ada@" not in text and "739152" not in text and KEY not in text
    # A refusal (4xx) is not retried.
    if answers[0] in (422, 401):
        assert len(fake.requests) == 1


async def test_alert_wording_never_carries_a_link() -> None:
    fake = FakeResend(200)
    await _sender(fake).send_alert("ada@example.com", "pin_reset", None)
    body = fake.body()
    assert body["subject"] == "Your Xspeeria PIN was reset"
    assert "http" not in body["text"] and "reset your PIN" in body["text"]


async def test_the_server_chooses_the_sender_from_the_settings() -> None:
    base: dict[str, Any] = {"_env_file": None, "database_url": None}
    assert build_auth_runtime(Settings(**base)).email is None
    real = build_auth_runtime(Settings(**base, resend_api_key=KEY, email_from=FROM))
    assert isinstance(real.email, ResendEmailSender)
    dev = build_auth_runtime(Settings(**base, dev_email=True, app_env="local"))
    assert isinstance(dev.email, DevConsoleEmailSender)
    with pytest.raises(ValueError, match="both RESEND_API_KEY and EMAIL_FROM"):
        build_auth_runtime(Settings(**base, resend_api_key=KEY))
    with pytest.raises(ValueError, match="not both"):
        build_auth_runtime(
            Settings(**base, dev_email=True, app_env="local", resend_api_key=KEY, email_from=FROM)
        )
