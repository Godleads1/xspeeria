# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Milestone KYC-1: identity checks with Didit (ADR-039), against PostgreSQL.

Didit is replaced by a fake that behaves as its docs describe (same session again for the same
user; signed results). Results are signed exactly as Didit signs them (canonical JSON).
"""

from __future__ import annotations

import dataclasses
import hashlib
import hmac
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response

from app.core.config import Settings
from app.main import create_app
from app.providers.didit import KycProviderError, KycSession, canonical_json
from app.providers.sms import RecordingSmsSender
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    Env,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_matches_api import OWNER, TAKER

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

SECRET = b"test-webhook-secret-not-real"


class FakeDidit:
    name = "didit"

    def __init__(self) -> None:
        self.sessions: dict[str, str] = {}  # vendor_data -> session id (unfinished)
        self.fail = False
        self.calls = 0

    def webhook_secret(self) -> bytes:
        return SECRET

    async def create_session(self, vendor_data: str, metadata: dict[str, str]) -> KycSession:
        self.calls += 1
        if self.fail:
            raise KycProviderError("didit unreachable: ConnectError")
        sid = self.sessions.setdefault(vendor_data, str(uuid.uuid4()))
        return KycSession(sid, f"https://verify.didit.me/session/{sid[:12]}", "Not Started")

    def finish(self, vendor_data: str) -> None:
        self.sessions.pop(vendor_data, None)


@dataclasses.dataclass
class K:
    env: Env
    didit: FakeDidit

    async def post_webhook(
        self, body: dict[str, Any], *, ts: int | None = None, secret: bytes = SECRET
    ) -> Response:
        stamp = ts if ts is not None else int(self.env.clock().timestamp())
        sig = hmac.new(secret, canonical_json(body).encode(), hashlib.sha256).hexdigest()
        # Sent with different key order and spacing: the signature is over canonical JSON.
        import json

        raw = json.dumps(dict(reversed(list(body.items()))), indent=1).encode()
        return await self.env.client.post(
            "/api/v1/webhooks/didit",
            content=raw,
            headers={
                "X-Signature-V2": sig,
                "X-Timestamp": str(stamp),
                "Content-Type": "application/json",
            },
        )


async def _make(
    db_settings: Settings, *, provider: bool = True, bypass: bool = False
) -> AsyncIterator[K]:
    clock = Clock()
    didit = FakeDidit()
    runtime = dataclasses.replace(
        _runtime(clock, RecordingSmsSender(), 10_000), kyc_provider=didit if provider else None
    )
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        database_url=db_settings.database_url,
        app_env="local",
        kyc_dev_bypass=bypass,
    )
    app = create_app(settings, auth_runtime=runtime)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield K(Env(client, clock, runtime.sms), didit)  # type: ignore[arg-type]


@pytest_asyncio.fixture
async def k(db_settings: Settings, clean: None) -> AsyncIterator[K]:
    async for x in _make(db_settings):
        yield x


async def _user(k: K, who: tuple[str, str] = OWNER) -> tuple[str, str]:
    body = await k.env.sign_up(phone=who[0], email=who[1])
    me = (await k.env.get("/users/me", token=body["access_token"])).json()
    return body["access_token"], str(me.get("user_id") or me.get("id"))


def _approved(
    sid: str,
    user_id: str,
    *,
    dob: str = "1990-05-17",
    event: str | None = None,
    skip: str | None = None,
    status: str = "Approved",
) -> dict[str, Any]:
    decision: dict[str, Any] = {
        "session_id": sid,
        "status": status,
        "id_verifications": [
            {
                "status": "Approved",
                "date_of_birth": dob,
                "age": 99,  # ignored: the server computes age itself
                "first_name": "Ada",
                "last_name": "Obi",
                "full_name": "Ada Obi",
                "document_type": "Passport",
                "issuing_state": "NGA",
                "document_number": "A12345678",
            }
        ],
        "liveness_checks": [{"status": "Approved", "score": 97.0}],
        "face_matches": [{"status": "Approved", "score": 91.5}],
        "aml_screenings": [{"status": "Approved", "total_hits": 0, "hits": []}],
    }
    if skip:
        decision.pop(skip)
    return {
        "event_id": event or str(uuid.uuid4()),
        "webhook_type": "status.updated",
        "session_id": sid,
        "status": status,
        "vendor_data": user_id,
        "decision": decision,
    }


async def _start(k: K, token: str) -> Response:
    return await k.env.post("/kyc/cases", token=token)


# --- normal path ---------------------------------------------------------------------------


async def test_no_check_yet_and_offers_need_kyc(k: K) -> None:
    token, _ = await _user(k)
    r = await k.env.get("/kyc/cases/current", token=token)
    assert r.json()["status"] == "not_started"
    r = await k.env.client.get("/api/v1/offers/mine", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403 and _code(r) == "AUTH_403_KYC_REQUIRED"


async def test_start_returns_didit_link_once_and_resumes_same_session(
    db_settings: Settings, k: K
) -> None:
    token, _ = await _user(k)
    a = (await _start(k, token)).json()
    assert a["status"] == "pending_documents" and a["verification_url"].startswith("https://")
    b = (await _start(k, token)).json()
    assert b["kyc_case_id"] == a["kyc_case_id"] and b["verification_url"] == a["verification_url"]
    assert await _sql(db_settings, "SELECT count(*) FROM kyc_cases") == 1
    # The link is never stored, and the current view does not repeat it.
    assert (await k.env.get("/kyc/cases/current", token=token)).json()["verification_url"] is None
    row = await _sql(db_settings, "SELECT row_to_json(kyc_cases)::text FROM kyc_cases")
    assert "verify.didit.me" not in str(row)


async def test_approved_check_unlocks_the_market(db_settings: Settings, k: K) -> None:
    token, uid = await _user(k)
    case = (await _start(k, token)).json()
    sid = k.didit.sessions[uid]
    r = await k.post_webhook({**_approved(sid, uid, status="In Progress"), "decision": None})
    assert r.json()["verdict"] == "APPLIED"
    r = await k.post_webhook(_approved(sid, uid))
    assert r.status_code == 200 and r.json()["verdict"] == "APPLIED"
    v = (await k.env.get("/kyc/cases/current", token=token)).json()
    assert v == {
        "kyc_case_id": case["kyc_case_id"],
        "status": "approved",
        "message": "Verified.",
        "verification_url": None,
        "legal_name": "Ada Obi",
    }
    r = await k.env.client.get("/api/v1/offers/mine", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    # Only the outcome and a few facts are kept: never document numbers or images.
    row = str(await _sql(db_settings, "SELECT row_to_json(kyc_cases)::text FROM kyc_cases"))
    assert "A12345678" not in row and '"id_type":"passport"' in row and "NGA" in row
    # Starting again once approved changes nothing.
    again = (await _start(k, token)).json()
    assert again["status"] == "approved" and again["verification_url"] is None


async def test_in_review_then_declined(k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    sid = k.didit.sessions[uid]
    await k.post_webhook({**_approved(sid, uid, status="In Review")})
    assert (await k.env.get("/kyc/cases/current", token=token)).json()["status"] == "under_review"
    await k.post_webhook({**_approved(sid, uid, status="Declined")})
    v = (await k.env.get("/kyc/cases/current", token=token)).json()
    assert v["status"] == "rejected"
    # Generic words: never says a sanctions list was involved.
    assert (
        v["message"]
        == "We could not verify your identity. Please try again with a valid ID document."
    )


async def test_can_start_again_after_rejection(db_settings: Settings, k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    await k.post_webhook({**_approved(k.didit.sessions[uid], uid, status="Declined")})
    k.didit.finish(uid)
    r = (await _start(k, token)).json()
    assert r["status"] == "pending_documents" and r["verification_url"]
    assert await _sql(db_settings, "SELECT count(*) FROM kyc_cases") == 2


# --- the server's own checks on an "Approved" result -----------------------------------------


async def test_under_18_is_refused_and_nothing_personal_is_kept(
    db_settings: Settings, k: K
) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    # Clock is 2026-10-18: born 2008-10-19 is one day short of 18.
    await k.post_webhook(_approved(k.didit.sessions[uid], uid, dob="2008-10-19"))
    v = (await k.env.get("/kyc/cases/current", token=token)).json()
    assert v["status"] == "rejected" and v["message"] == "You must be 18 or older to use Xspeeria."
    assert await _sql(db_settings, "SELECT legal_name FROM kyc_cases") is None
    assert await _sql(db_settings, "SELECT date_of_birth FROM kyc_cases") is None


async def test_exactly_18_today_is_approved(k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    await k.post_webhook(_approved(k.didit.sessions[uid], uid, dob="2008-10-18"))
    assert (await k.env.get("/kyc/cases/current", token=token)).json()["status"] == "approved"


@pytest.mark.parametrize(
    "missing", ["aml_screenings", "liveness_checks", "face_matches", "id_verifications"]
)
async def test_approved_without_a_required_check_is_held_for_review(k: K, missing: str) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    await k.post_webhook(_approved(k.didit.sessions[uid], uid, skip=missing))
    assert (await k.env.get("/kyc/cases/current", token=token)).json()["status"] == "under_review"


async def test_approved_with_a_sanctions_hit_is_held_for_review(k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    body = _approved(k.didit.sessions[uid], uid)
    body["decision"]["aml_screenings"] = [{"status": "In Review", "total_hits": 1, "hits": [{}]}]
    await k.post_webhook(body)
    assert (await k.env.get("/kyc/cases/current", token=token)).json()["status"] == "under_review"


# --- abuse -----------------------------------------------------------------------------------


async def test_forged_old_or_malformed_results_change_nothing(k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    sid = k.didit.sessions[uid]
    r = await k.post_webhook(_approved(sid, uid), secret=b"wrong")
    assert r.status_code == 401
    r = await k.post_webhook(_approved(sid, uid), ts=int(k.env.clock().timestamp()) - 301)
    assert r.status_code == 401
    r = await k.env.client.post("/api/v1/webhooks/didit", content=b"not json")
    assert r.status_code == 401
    r = await k.post_webhook({"event_id": "e", "session_id": sid})
    assert r.status_code == 422
    assert (await k.env.get("/kyc/cases/current", token=token)).json()[
        "status"
    ] == "pending_documents"


async def test_result_for_someone_else_is_ignored(k: K) -> None:
    token, uid = await _user(k)
    _, other = await _user(k, TAKER)
    await _start(k, token)
    r = await k.post_webhook(_approved(k.didit.sessions[uid], other))
    assert r.json()["verdict"] == "IGNORED_WRONG_USER"
    r = await k.post_webhook(_approved(str(uuid.uuid4()), uid))
    assert r.json()["verdict"] == "IGNORED_UNKNOWN_SESSION"
    assert (await k.env.get("/kyc/cases/current", token=token)).json()[
        "status"
    ] == "pending_documents"


async def test_replayed_event_counts_once_and_status_never_goes_back(k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    sid = k.didit.sessions[uid]
    ok = _approved(sid, uid, event="evt-1")
    assert (await k.post_webhook(ok)).json()["verdict"] == "APPLIED"
    assert (await k.post_webhook(ok)).json()["verdict"] == "DUPLICATE"
    r = await k.post_webhook({**_approved(sid, uid, status="In Progress"), "decision": None})
    assert r.json()["verdict"] == "IGNORED_STALE"
    r = await k.post_webhook({**_approved(sid, uid, status="Declined")})
    assert r.json()["verdict"] == "IGNORED_STALE"
    assert (await k.env.get("/kyc/cases/current", token=token)).json()["status"] == "approved"


async def test_approval_can_expire(k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    sid = k.didit.sessions[uid]
    await k.post_webhook(_approved(sid, uid))
    await k.post_webhook({**_approved(sid, uid, status="Kyc Expired"), "decision": None})
    v = (await k.env.get("/kyc/cases/current", token=token)).json()
    assert v["status"] == "expired" and "expired" in v["message"]
    r = await k.env.client.get("/api/v1/offers/mine", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


async def test_provider_down_or_not_configured_is_a_clear_503(db_settings: Settings, k: K) -> None:
    token, _ = await _user(k)
    k.didit.fail = True
    r = await _start(k, token)
    assert r.status_code == 503 and "verify.didit" not in r.text
    async for off in _make(db_settings, provider=False):
        t2, _ = await _user(off, TAKER)
        r = await off.env.post("/kyc/cases", token=t2)
        assert r.status_code == 503
        r = await off.env.client.post("/api/v1/webhooks/didit", content=b"{}")
        assert r.status_code == 404


async def test_needs_sign_in(k: K) -> None:
    assert (await k.env.post("/kyc/cases")).status_code == 401
    assert (await k.env.get("/kyc/cases/current")).status_code == 401


# --- database guarantees -------------------------------------------------------------------


async def test_database_keeps_kyc_forward_only(db_settings: Settings, k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    await k.post_webhook(_approved(k.didit.sessions[uid], uid))
    with pytest.raises(Exception, match="not allowed"):
        await _sql(db_settings, "UPDATE kyc_cases SET status = 'pending_documents'")
    with pytest.raises(Exception, match="set once"):
        await _sql(db_settings, "UPDATE kyc_cases SET legal_name = 'Someone Else'")
    with pytest.raises(Exception, match="never deleted"):
        await _sql(db_settings, "DELETE FROM kyc_cases")
    with pytest.raises(Exception, match="append-only"):
        await _sql(db_settings, "DELETE FROM kyc_webhook_events")


async def test_kyc_grants(db_settings: Settings) -> None:
    async def grants(table: str) -> Any:
        return await _sql(
            db_settings,
            "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
            "FROM information_schema.role_table_grants "
            "WHERE grantee = 'xspeeria_app' AND table_name = :t",
            t=table,
        )

    assert await grants("kyc_cases") == "INSERT,SELECT,UPDATE"
    assert await grants("kyc_webhook_events") == "INSERT,SELECT"


def test_didit_settings_go_together() -> None:
    from app.main import build_auth_runtime

    with pytest.raises(ValueError, match="go together"):
        build_auth_runtime(Settings(_env_file=None, didit_api_key="x"))  # type: ignore[call-arg]
    rt = build_auth_runtime(
        Settings(  # type: ignore[call-arg]
            _env_file=None, didit_api_key="k", didit_workflow_id="w", didit_webhook_secret="s"
        )
    )
    assert rt.kyc_provider is not None and rt.kyc_provider.name == "didit"
