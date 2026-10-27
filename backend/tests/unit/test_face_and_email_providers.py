"""ADR-054: the face check provider fails closed; developer senders stay local."""

from __future__ import annotations

import io
import json

import httpx
import pytest

from app.core.config import Settings
from app.main import build_auth_runtime
from app.providers.email import DevConsoleEmailSender, mask_email
from app.providers.face import (
    DevFaceCheck,
    DiditFaceCheck,
    FaceCheckError,
    NoReferenceFace,
    read_decision,
)

USER = "8f6c0c0e-1111-4c4c-9c9c-000000000001"
OK = {"status": "Approved"}


def _decision(**over: object) -> dict[str, object]:
    return {
        "status": "Approved",
        "vendor_data": USER,
        "liveness_checks": [OK],
        "face_matches": [OK],
    } | over


class TestReadDecision:
    def test_approved_only_when_every_check_passed_for_this_user(self) -> None:
        assert read_decision(_decision(), USER) == "approved"

    @pytest.mark.parametrize(
        "body",
        [
            _decision(vendor_data="someone-else"),
            _decision(face_matches=[{"status": "Declined"}]),
            _decision(liveness_checks=[OK, {"status": "In Review"}]),
            _decision(face_matches=[]),
            _decision(liveness_checks=None),
            _decision(status="Declined"),
            _decision(status="Abandoned", face_matches=[]),
            "not a dict",
        ],
    )
    def test_anything_else_is_declined(self, body: object) -> None:
        assert read_decision(body, USER) == "declined"

    @pytest.mark.parametrize("status", ["Not Started", "In Progress"])
    def test_still_running(self, status: str) -> None:
        assert read_decision({"status": status}, USER) == "pending"


def _client(handler: httpx.MockTransport) -> DiditFaceCheck:
    return DiditFaceCheck("key-x", "wf-auth", transport=handler)


@pytest.mark.asyncio
async def test_didit_session_and_decision() -> None:
    seen: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "POST":
            return httpx.Response(201, json={"session_id": "s-1", "url": "https://v.didit.me/s-1"})
        return httpx.Response(200, json=_decision())

    face = _client(httpx.MockTransport(handle))
    session = await face.start(USER, {"check_id": "c"})
    assert (session.session_id, session.url) == ("s-1", "https://v.didit.me/s-1")
    body = json.loads(seen[0].content)
    assert body == {"workflow_id": "wf-auth", "vendor_data": USER, "metadata": {"check_id": "c"}}
    assert seen[0].headers["x-api-key"] == "key-x"
    assert await face.outcome("s-1", USER) == "approved"
    assert str(seen[1].url).endswith("/v3/session/s-1/decision/")


@pytest.mark.asyncio
async def test_didit_errors_never_carry_the_key() -> None:
    face = _client(httpx.MockTransport(lambda r: httpx.Response(400, text="No stored face image")))
    with pytest.raises(NoReferenceFace):
        await face.start(USER, {})
    face = _client(httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    with pytest.raises(FaceCheckError) as err:
        await face.start(USER, {})
    assert "key-x" not in str(err.value)
    with pytest.raises(FaceCheckError):
        await face.outcome("s-1", USER)
    face = _client(httpx.MockTransport(lambda r: httpx.Response(201, json={"session_id": "s"})))
    with pytest.raises(FaceCheckError):
        await face.start(USER, {})


@pytest.mark.asyncio
async def test_dev_senders() -> None:
    out = io.StringIO()
    await DevConsoleEmailSender(out).send_code("david@example.com", "123456")
    assert "d***@example.com" in out.getvalue() and "david@" not in out.getvalue()
    assert mask_email("a@b.co") == "a***@b.co"
    assert await DevFaceCheck().outcome("dev-1", USER) == "approved"


@pytest.mark.parametrize("flag", ["dev_email", "face_check_dev"])
def test_developer_shortcuts_are_local_only(flag: str) -> None:
    settings = Settings.model_validate({"app_env": "staging", flag: True})
    with pytest.raises(ValueError, match="APP_ENV=local"):
        build_auth_runtime(settings)


def test_face_check_needs_the_api_key() -> None:
    settings = Settings(_env_file=None, didit_auth_workflow_id="wf")  # type: ignore[call-arg]
    with pytest.raises(ValueError, match="DIDIT_API_KEY"):
        build_auth_runtime(settings)
    rt = build_auth_runtime(
        Settings(_env_file=None, face_check_dev=True, dev_email=True)  # type: ignore[call-arg]
    )
    assert isinstance(rt.face, DevFaceCheck) and rt.email is not None


def test_test_limits_dev_raises_limits_only_on_a_developer_computer() -> None:
    """Owner 2026-10-27 (demo testing): TEST_LIMITS_DEV is refused outside APP_ENV=local."""
    from app.domain.auth_rules import CHECKS_PER_DAY, CHECKS_PER_HOUR, LOGIN_REQUESTS_PER_MINUTE

    normal = build_auth_runtime(Settings(_env_file=None))  # type: ignore[call-arg]
    assert (normal.checks_per_hour, normal.checks_per_day) == (CHECKS_PER_HOUR, CHECKS_PER_DAY)
    relaxed = build_auth_runtime(
        Settings(_env_file=None, test_limits_dev=True)  # type: ignore[call-arg]
    )
    assert relaxed.checks_per_hour == CHECKS_PER_HOUR * 20
    assert relaxed.checks_per_day == CHECKS_PER_DAY * 20
    assert relaxed.address_limiter._limit == LOGIN_REQUESTS_PER_MINUTE * 20  # noqa: SLF001
    with pytest.raises(ValueError, match="TEST_LIMITS_DEV"):
        build_auth_runtime(
            Settings(_env_file=None, test_limits_dev=True, app_env="staging")  # type: ignore[call-arg]
        )
