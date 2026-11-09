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
IDENTITY_KEY = b"i" * 32


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
    db_settings: Settings,
    *,
    provider: bool = True,
    bypass: bool = False,
    country_header: str | None = None,
) -> AsyncIterator[K]:
    clock = Clock()
    didit = FakeDidit()
    runtime = dataclasses.replace(
        _runtime(clock, RecordingSmsSender(), 10_000),
        kyc_provider=didit if provider else None,
        kyc_identity_key=IDENTITY_KEY,
    )
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        database_url=db_settings.database_url,
        app_env="local",
        kyc_dev_bypass=bypass,
        client_country_header=country_header,
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
    document: str = "A12345678",
    seen_for: str | None = None,
    issuer: str = "NGA",
    name: str = "Ada Obi",
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
                "full_name": name,
                "gender": "F",
                "document_type": "Passport",
                "issuing_state": issuer,
                "document_number": document,
                # Didit: approved sessions of the same document (vendor_data = their account).
                "matches": (
                    [{"status": "Approved", "vendor_data": seen_for, "session_number": 1}]
                    if seen_for
                    else []
                ),
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
    before = (await k.env.get("/users/me", token=token)).json()
    assert (before["legal_name"], before["date_of_birth"], before["gender"]) == (None, None, None)
    case = (await _start(k, token)).json()
    sid = k.didit.sessions[uid]
    r = await k.post_webhook({**_approved(sid, uid, status="In Progress"), "decision": None})
    assert r.json()["verdict"] == "APPLIED"
    r = await k.post_webhook(_approved(sid, uid))
    assert r.status_code == 200 and r.json()["verdict"] == "APPLIED"
    v = (await k.env.get("/kyc/cases/current", token=token)).json()
    assert v == {
        "kyc_case_id": case["kyc_case_id"],
        "country": "NG",
        "status": "approved",
        "message": "Verified.",
        "verification_url": None,
        "legal_name": "Ada Obi",
    }
    r = await k.env.client.get("/api/v1/offers/mine", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    # ADR-055: the profile shows the name, date of birth and gender from the ID.
    me = (await k.env.get("/users/me", token=token)).json()
    assert (me["legal_name"], me["date_of_birth"], me["gender"]) == ("Ada Obi", "1990-05-17", "F")
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
    import base64

    from app.main import build_auth_runtime

    with pytest.raises(ValueError, match="go together"):
        build_auth_runtime(Settings(_env_file=None, didit_api_key="x"))  # type: ignore[call-arg]

    def didit(key: str | None) -> Settings:
        return Settings(  # type: ignore[call-arg]
            _env_file=None,
            didit_api_key="k",
            didit_workflow_id="w",
            didit_webhook_secret="s",
            kyc_identity_key=key,
        )

    with pytest.raises(ValueError, match="KYC_IDENTITY_KEY is required"):
        build_auth_runtime(didit(None))
    with pytest.raises(ValueError, match="32 bytes"):
        build_auth_runtime(didit("c2hvcnQ="))
    with pytest.raises(ValueError, match="placeholder"):
        build_auth_runtime(didit("CHANGE_ME"))
    rt = build_auth_runtime(didit(base64.b64encode(b"k" * 32).decode()))
    assert rt.kyc_provider is not None and rt.kyc_provider.name == "didit"
    assert rt.kyc_identity_key == b"k" * 32


# --- one person, one verified account (ADR-041) -------------------------------------------


async def _verify(k: K, who: tuple[str, str], **kw: Any) -> tuple[str, str, Response]:
    token, uid = await _user(k, who)
    await _start(k, token)
    r = await k.post_webhook(_approved(k.didit.sessions[uid], uid, **kw))
    return token, uid, r


async def _status(k: K, token: str) -> str:
    return str((await k.env.get("/kyc/cases/current", token=token)).json()["status"])


async def test_same_id_document_on_a_second_account_is_held(db_settings: Settings, k: K) -> None:
    first, _, _ = await _verify(k, OWNER)
    # Same passport, written differently (spaces, dash, lower case): still the same document.
    second, uid2, r = await _verify(k, TAKER, document="a1234-5678 ")
    assert r.json()["verdict"] == "APPLIED"
    assert await _status(k, first) == "approved"
    v = (await k.env.get("/kyc/cases/current", token=second)).json()
    assert v["status"] == "under_review" and v["legal_name"] is None
    assert "another" not in v["message"].lower() and "duplicate" not in v["message"].lower()
    r = await k.env.client.get("/api/v1/offers/mine", headers={"Authorization": f"Bearer {second}"})
    assert r.status_code == 403
    assert (
        await _sql(
            db_settings,
            "SELECT review_reason FROM kyc_cases WHERE user_id = CAST(:u AS uuid)",
            u=uid2,
        )
        == "DUPLICATE_IDENTITY"
    )
    rows = str(await _sql(db_settings, "SELECT json_agg(kyc_cases)::text FROM kyc_cases"))
    assert "A12345678" not in rows.upper()  # only the keyed hash is kept
    assert await _sql(db_settings, "SELECT count(DISTINCT identity_key) FROM kyc_cases") == 1


async def test_a_different_document_is_approved(k: K) -> None:
    await _verify(k, OWNER)
    second, _, _ = await _verify(k, TAKER, document="B99999999")
    assert await _status(k, second) == "approved"


async def test_didit_match_from_another_account_is_held(k: K) -> None:
    other = str(uuid.uuid4())
    token, _, _ = await _verify(k, OWNER, document="C1", seen_for=other)
    assert await _status(k, token) == "under_review"


async def test_didit_match_from_my_own_account_is_fine(k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    await k.post_webhook(_approved(k.didit.sessions[uid], uid, seen_for=uid))
    assert await _status(k, token) == "approved"


async def test_reverifying_my_own_account_after_expiry_is_approved(k: K) -> None:
    token, uid, _ = await _verify(k, OWNER)
    sid = k.didit.sessions[uid]
    await k.post_webhook({**_approved(sid, uid, status="Kyc Expired"), "decision": None})
    k.didit.finish(uid)
    await _start(k, token)
    await k.post_webhook(_approved(k.didit.sessions[uid], uid))
    assert await _status(k, token) == "approved"


async def test_document_verified_then_expired_elsewhere_still_counts(k: K) -> None:
    _, uid, _ = await _verify(k, OWNER)
    sid = k.didit.sessions[uid]
    await k.post_webhook({**_approved(sid, uid, status="Kyc Expired"), "decision": None})
    second, _, _ = await _verify(k, TAKER)
    assert await _status(k, second) == "under_review"


async def test_no_document_number_is_held(db_settings: Settings, k: K) -> None:
    token, _, _ = await _verify(k, OWNER, document=" - ")
    assert await _status(k, token) == "under_review"
    assert await _sql(db_settings, "SELECT review_reason FROM kyc_cases") == "CHECKS_INCOMPLETE"


async def test_in_review_then_approved_duplicate_stays_in_review(
    db_settings: Settings, k: K
) -> None:
    await _verify(k, OWNER)
    token, uid = await _user(k, TAKER)
    await _start(k, token)
    sid = k.didit.sessions[uid]
    await k.post_webhook({**_approved(sid, uid, status="In Review"), "decision": None})
    await k.post_webhook(_approved(sid, uid))
    assert await _status(k, token) == "under_review"
    assert (
        await _sql(
            db_settings,
            "SELECT review_reason FROM kyc_cases WHERE user_id = CAST(:u AS uuid)",
            u=uid,
        )
        == "DUPLICATE_IDENTITY"
    )


async def test_identity_key_is_set_once_and_one_approval_per_document(
    db_settings: Settings, k: K
) -> None:
    await _verify(k, OWNER)
    await _verify(k, TAKER)
    with pytest.raises(Exception, match="set once"):
        await _sql(db_settings, "UPDATE kyc_cases SET identity_key = repeat('0', 64)")
    with pytest.raises(Exception, match="uq_kyc_cases_identity_approved"):
        await _sql(
            db_settings,
            "UPDATE kyc_cases SET status = 'approved', decided_at = now(), "
            "legal_name = 'Ada Obi', date_of_birth = '1990-05-17' "
            "WHERE status = 'under_review'",
        )


# --- identity checks per country (ADR-042) ------------------------------------------------


async def _country_check(k: K, token: str, uid: str, country: str, **kw: Any) -> dict[str, Any]:
    r = await k.env.client.post(
        "/api/v1/kyc/cases",
        json={"country": country},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    await k.post_webhook(_approved(k.didit.sessions[uid], uid, **kw))
    k.didit.finish(uid)
    r = await k.env.get(f"/kyc/cases/current?country={country}", token=token)
    return dict(r.json())


async def test_uk_check_with_a_uk_id_is_added_to_the_same_account(k: K) -> None:
    token, uid, _ = await _verify(k, OWNER)
    k.didit.finish(uid)
    # Middle name only on one ID, different letter case and accents: same person.
    v = await _country_check(
        k, token, uid, "GB", issuer="GBR", document="UK123456", name="ADA Chiọma OBI"
    )
    assert v["country"] == "GB" and v["status"] == "approved"
    regions = (await k.env.get("/kyc/regions", token=token)).json()
    assert regions == {
        "regions": [
            {"country": "NG", "status": "approved"},
            {"country": "GB", "status": "approved"},
            {"country": "US", "status": "not_started"},
            {"country": "CA", "status": "not_started"},  # ADR-100
        ],
        "suggested_country": None,
    }


async def test_a_country_needs_an_id_issued_there(db_settings: Settings, k: K) -> None:
    token, uid = await _user(k)
    v = await _country_check(k, token, uid, "US", issuer="NGA")
    assert v["status"] == "rejected"
    assert v["message"] == "Please use an ID issued by the United States."
    assert await _sql(db_settings, "SELECT legal_name FROM kyc_cases") is None
    # Same rule for Nigeria: a UK passport does not verify the Nigerian side.
    token2, uid2 = await _user(k, TAKER)
    v = await _country_check(k, token2, uid2, "NG", issuer="GBR", document="Z9")
    assert v["status"] == "rejected" and "Nigeria" in v["message"]


@pytest.mark.parametrize(
    ("change", "value"), [("dob", "1991-05-17"), ("name", "Bola Obi"), ("name", "Ada")]
)
async def test_second_country_must_be_the_same_person(
    db_settings: Settings, k: K, change: str, value: str
) -> None:
    token, uid, _ = await _verify(k, OWNER)
    k.didit.finish(uid)
    v = await _country_check(k, token, uid, "GB", issuer="GBR", document="UK1", **{change: value})
    assert v["status"] == "under_review"
    assert (
        await _sql(db_settings, "SELECT review_reason FROM kyc_cases WHERE country = 'GB'")
        == "IDENTITY_MISMATCH"
    )


async def test_one_open_check_at_a_time_across_countries(k: K) -> None:
    token, _ = await _user(k)
    assert (await _start(k, token)).status_code == 200  # NG, unfinished
    calls = k.didit.calls
    r = await k.env.client.post(
        "/api/v1/kyc/cases", json={"country": "GB"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "KYC_409_CASE_ALREADY_ACTIVE"
    assert k.didit.calls == calls  # Didit is not called (no cost)


async def test_country_input_is_checked(k: K) -> None:
    token, _ = await _user(k)
    h = {"Authorization": f"Bearer {token}"}
    for body in ({"country": "FR"}, {"country": "gb"}, {"country": "GB", "user_id": "x"}):
        r = await k.env.client.post("/api/v1/kyc/cases", json=body, headers=h)
        assert r.status_code == 422, body
    r = await k.env.client.get("/api/v1/kyc/cases/current?country=FR", headers=h)
    assert r.status_code == 422


async def _suggested(x: K, token: str, header: str | None) -> Any:
    h = {"Authorization": f"Bearer {token}"}
    if header is not None:
        h["CF-IPCountry"] = header
    r = await x.env.client.get("/api/v1/kyc/regions", headers=h)
    return r.json()["suggested_country"]


async def test_new_country_is_only_suggested(db_settings: Settings, clean: None) -> None:
    async for x in _make(db_settings, country_header="CF-IPCountry"):
        token, uid = await _user(x)
        # Not verified anywhere yet: the normal first check, no suggestion.
        assert await _suggested(x, token, "GB") is None
        await _start(x, token)
        await x.post_webhook(_approved(x.didit.sessions[uid], uid))
        assert await _suggested(x, token, "GB") == "GB"
        assert await _suggested(x, token, "gb") == "GB"
        assert await _suggested(x, token, "NG") is None  # already verified there
        assert await _suggested(x, token, "FR") is None  # not a supported country
        assert await _suggested(x, token, "XXX") is None
        assert await _suggested(x, token, None) is None
        # A suggestion grants nothing and stores nothing.
        n = await _sql(db_settings, "SELECT count(*) FROM kyc_cases WHERE country = 'GB'")
        assert n == 0


async def test_header_is_ignored_unless_configured(k: K) -> None:
    token, uid, _ = await _verify(k, OWNER)
    r = await k.env.client.get(
        "/api/v1/kyc/regions", headers={"Authorization": f"Bearer {token}", "CF-IPCountry": "GB"}
    )
    assert r.json()["suggested_country"] is None


# --- you need verification in the country you pay from ------------------------------------


@pytest_asyncio.fixture
async def market(db_settings: Settings, k: K) -> K:
    from app.cli.currency_definitions import ensure_currency_definitions
    from app.db.session import build_engine

    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn:
            await ensure_currency_definitions(conn)
    finally:
        await engine.dispose()
    return k


async def _publish(k: K, token: str, source: str, target: str) -> Response:
    return await k.env.client.post(
        "/api/v1/offers",
        json={
            "source_currency": source,
            "target_currency": target,
            "source_amount": "250000.00" if source == "NGN" else "500.00",
            "desired_rate": "1765.00" if "GBP" in (source, target) else "1320.50",
        },
        headers={"Authorization": f"Bearer {token}", "Idempotency-Key": str(uuid.uuid4())},
    )


async def test_posting_an_offer_needs_the_pay_from_country(market: K) -> None:
    k = market
    token, uid, _ = await _verify(k, OWNER)
    # Pays naira, receives pounds into her own UK account: Nigeria is enough.
    assert (await _publish(k, token, "NGN", "GBP")).status_code == 201
    r = await _publish(k, token, "GBP", "NGN")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "AUTH_403_KYC_REQUIRED"
    assert r.json()["error"]["details"] == {"country": "GB"}
    assert "United Kingdom" in r.json()["error"]["message"]
    k.didit.finish(uid)
    await _country_check(k, token, uid, "GB", issuer="GBR", document="UK1")
    assert (await _publish(k, token, "GBP", "NGN")).status_code == 201
    assert (await _publish(k, token, "USD", "NGN")).json()["error"]["details"] == {"country": "US"}


async def test_taking_an_offer_needs_the_country_you_pay_in(market: K) -> None:
    k = market
    maker, _, _ = await _verify(k, OWNER)
    offer = (await _publish(k, maker, "NGN", "GBP")).json()
    taker, tuid, _ = await _verify(k, TAKER, document="B7", name="Tunde Bello")
    url = f"/api/v1/offers/{offer['offer_id']}/accept"
    h = {"Authorization": f"Bearer {taker}", "Idempotency-Key": str(uuid.uuid4())}
    # The taker pays the offer's target currency (GBP): needs the UK check.
    r = await k.env.client.post(
        url, json={"accepted_amount": "100.00", "expected_rate": "1765.00"}, headers=h
    )
    assert r.status_code == 403 and r.json()["error"]["details"] == {"country": "GB"}
    k.didit.finish(tuid)
    await _country_check(k, taker, tuid, "GB", issuer="GBR", document="UK7", name="Tunde Bello")
    r = await k.env.client.post(
        url, json={"accepted_amount": "100.00", "expected_rate": "1765.00"}, headers=h
    )
    assert r.json().get("error", {}).get("code") != "AUTH_403_KYC_REQUIRED"
