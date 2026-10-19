"""KYC-1 rules and the Didit client (ADR-039). No network: httpx MockTransport."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import date

import httpx
import pytest

from app.domain.kyc_rules import age_on, evaluate
from app.providers.didit import DiditClient, KycProviderError, canonical_json, verify_signature

TODAY = date(2026, 10, 19)


def test_age_counts_birthdays_exactly() -> None:
    assert age_on(date(2008, 10, 19), TODAY) == 18
    assert age_on(date(2008, 10, 20), TODAY) == 17
    assert age_on(date(2008, 2, 29), date(2026, 2, 28)) == 17
    assert age_on(date(2008, 2, 29), date(2026, 3, 1)) == 18


@pytest.mark.parametrize(
    ("status", "ours"),
    [
        ("Not Started", "pending_documents"),
        ("In Progress", "pending_documents"),
        ("Awaiting User", "pending_documents"),
        ("Resubmitted", "pending_documents"),
        ("In Review", "under_review"),
        ("Declined", "rejected"),
        ("Abandoned", "expired"),
        ("Expired", "expired"),
        ("Kyc Expired", "expired"),
    ],
)
def test_status_words(status: str, ours: str) -> None:
    out = evaluate(status, None, TODAY)
    assert out is not None and out.status == ours


def test_unknown_and_case_sensitive_statuses_are_not_guessed() -> None:
    assert evaluate("approved", None, TODAY) is None
    assert evaluate("Pending", None, TODAY) is None


def test_approved_without_decision_is_held() -> None:
    out = evaluate("Approved", None, TODAY)
    assert out is not None and out.status == "under_review"


def test_canonical_json_matches_didit_rules() -> None:
    body = {"b": 1.0, "a": {"z": [2.0, 2.5], "y": "Ọ̀rẹ́"}}
    assert canonical_json(body) == '{"a":{"y":"Ọ̀rẹ́","z":[2,2.5]},"b":1}'


def test_signature_check() -> None:
    body = {"event_id": "e1", "status": "Approved", "score": 97.0}
    sig = hmac.new(b"s", canonical_json(body).encode(), hashlib.sha256).hexdigest()
    assert verify_signature(body, sig, "1000", b"s", 1000)
    assert verify_signature(body, sig, "1000", b"s", 1300)
    assert not verify_signature(body, sig, "1000", b"s", 1301)  # outside 5 minutes
    assert not verify_signature(body, sig, "1000", b"other", 1000)
    assert not verify_signature({**body, "status": "Declined"}, sig, "1000", b"s", 1000)
    assert not verify_signature(body, sig, "soon", b"s", 1000)
    assert not verify_signature(body, "", "1000", b"s", 1000)


def _client(handler: httpx.MockTransport) -> DiditClient:
    return DiditClient(
        "key-123", "wf-1", "secret", callback_url="xspeeria://kyc", transport=handler
    )


def test_create_session_sends_documented_request() -> None:
    seen: dict[str, object] = {}

    def handle(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["key"] = req.headers.get("x-api-key")
        seen["body"] = json.loads(req.content)
        return httpx.Response(
            201,
            json={
                "session_id": "s-1",
                "url": "https://verify.didit.me/s/abc",
                "status": "Not Started",
            },
        )

    s = asyncio.run(_client(httpx.MockTransport(handle)).create_session("user-1", {}))
    assert s.session_id == "s-1" and s.url.startswith("https://")
    assert seen["url"] == "https://verification.didit.me/v3/session/"
    assert seen["key"] == "key-123"
    assert seen["body"] == {
        "workflow_id": "wf-1",
        "vendor_data": "user-1",
        "metadata": {},
        "callback": "xspeeria://kyc",
    }


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"detail": "bad key"}),
        httpx.Response(500, text="oops"),
        httpx.Response(201, json={"session_id": "s"}),
        httpx.Response(201, json={"session_id": "s", "url": "http://insecure", "status": "x"}),
        httpx.Response(201, text="not json"),
    ],
)
def test_bad_responses_become_safe_errors(response: httpx.Response) -> None:
    client = _client(httpx.MockTransport(lambda _r: response))
    with pytest.raises(KycProviderError) as e:
        asyncio.run(client.create_session("u", {}))
    assert "key-123" not in str(e.value)


def test_network_failure_never_leaks_the_key() -> None:
    def boom(_r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("x-api-key: key-123")

    with pytest.raises(KycProviderError) as e:
        asyncio.run(_client(httpx.MockTransport(boom)).create_session("u", {}))
    assert "key-123" not in str(e.value) and e.value.__cause__ is None
