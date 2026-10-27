"""Face check — Didit biometric authentication (ADR-054).

A live selfie is matched to the face from the person's approved identity check. Follows
Didit's documented API (docs.didit.me, read 2026-10-20):

* ``POST {base}/v3/session/`` with ``x-api-key`` and the ``workflow_id`` of a workflow of
  type ``BIOMETRIC_AUTHENTICATION``; ``vendor_data`` is the same user id the identity check
  used, which is how Didit finds the stored face. Didit answers 400 when it holds no face.
* ``GET {base}/v3/session/{id}/decision/`` gives the result.

**Fail closed.** A check counts as passed only when the session status is ``Approved``, the
decision's ``vendor_data`` is this user, and every liveness check and every face match in it
is ``Approved`` (and there is at least one of each). "Not Started" and "In Progress" are
still running; anything else is a failure. The session URL lets anyone holding it take the
check, so it is handed to the app once and never stored. The API key is never logged.

``DevFaceCheck`` (local only) passes every check without a camera; ``RecordingFaceCheck``
is for tests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

import httpx

from app.core.api_metrics import tracked_transport

#: How this service is named on the System Health page (ADR-072).
_MONITOR_NAME = "Didit face check"

__all__ = [
    "DevFaceCheck",
    "DiditFaceCheck",
    "FaceCheckError",
    "FaceCheckProvider",
    "FaceOutcome",
    "FaceSession",
    "NoReferenceFace",
    "RecordingFaceCheck",
    "read_decision",
]

FaceOutcome = Literal["approved", "declined", "pending"]
_TIMEOUT = httpx.Timeout(10.0)
_RUNNING = {"Not Started", "In Progress"}


class FaceCheckError(Exception):
    """The provider could not be reached or refused. Message is safe to log."""


class NoReferenceFace(FaceCheckError):
    """The provider holds no face for this person (no approved identity check)."""


@dataclass(frozen=True)
class FaceSession:
    session_id: str
    #: Page where the person takes the selfie. None only for the local developer check.
    url: str | None


class FaceCheckProvider(Protocol):
    async def start(self, vendor_data: str, metadata: dict[str, str]) -> FaceSession: ...

    async def outcome(self, session_id: str, vendor_data: str) -> FaceOutcome: ...


def read_decision(data: Any, vendor_data: str) -> FaceOutcome:
    """Classify a Didit decision body. Anything not clearly approved is not approved."""
    if not isinstance(data, dict):
        return "declined"
    status = data.get("status")
    if status in _RUNNING:
        return "pending"
    liveness = data.get("liveness_checks")
    matches = data.get("face_matches")
    if (
        status == "Approved"
        and data.get("vendor_data") == vendor_data
        and isinstance(liveness, list)
        and isinstance(matches, list)
        and liveness
        and matches
        and all(isinstance(x, dict) and x.get("status") == "Approved" for x in liveness)
        and all(isinstance(x, dict) and x.get("status") == "Approved" for x in matches)
    ):
        return "approved"
    return "declined"


class DiditFaceCheck:
    def __init__(
        self,
        api_key: str,
        workflow_id: str,
        base_url: str = "https://verification.didit.me",
        callback_url: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._key = api_key
        self._workflow = workflow_id
        self._base = base_url.rstrip("/")
        self._callback = callback_url
        self._transport = transport

    async def start(self, vendor_data: str, metadata: dict[str, str]) -> FaceSession:
        body: dict[str, Any] = {
            "workflow_id": self._workflow,
            "vendor_data": vendor_data,
            "metadata": metadata,
        }
        if self._callback:
            body["callback"] = self._callback
        try:
            async with httpx.AsyncClient(
                timeout=_TIMEOUT, transport=tracked_transport(_MONITOR_NAME, self._transport)
            ) as c:
                r = await c.post(
                    f"{self._base}/v3/session/", json=body, headers={"x-api-key": self._key}
                )
        except httpx.HTTPError as exc:
            raise FaceCheckError(f"didit unreachable: {type(exc).__name__}") from None
        if r.status_code == 400 and "face" in r.text.lower():
            raise NoReferenceFace("didit holds no face for this person")
        if r.status_code not in (200, 201):
            raise FaceCheckError(f"didit refused face session: HTTP {r.status_code}")
        try:
            data = r.json()
            session = FaceSession(str(data["session_id"]), str(data["url"]))
        except (ValueError, KeyError, TypeError):
            raise FaceCheckError("didit face session response not understood") from None
        if not session.session_id or not (session.url or "").startswith("https://"):
            raise FaceCheckError("didit face session response not understood")
        return session

    async def outcome(self, session_id: str, vendor_data: str) -> FaceOutcome:
        try:
            async with httpx.AsyncClient(
                timeout=_TIMEOUT, transport=tracked_transport(_MONITOR_NAME, self._transport)
            ) as c:
                r = await c.get(
                    f"{self._base}/v3/session/{session_id}/decision/",
                    headers={"x-api-key": self._key},
                )
        except httpx.HTTPError as exc:
            raise FaceCheckError(f"didit unreachable: {type(exc).__name__}") from None
        if r.status_code != 200:
            raise FaceCheckError(f"didit refused decision: HTTP {r.status_code}")
        try:
            data = r.json()
        except ValueError:
            raise FaceCheckError("didit decision not understood") from None
        return read_decision(data, vendor_data)


class DevFaceCheck:
    """Local development only (ADR-054): passes every face check, no camera, no cost."""

    async def start(self, vendor_data: str, metadata: dict[str, str]) -> FaceSession:
        return FaceSession(session_id=f"dev-{metadata.get('check_id', 'x')}", url=None)

    async def outcome(self, session_id: str, vendor_data: str) -> FaceOutcome:
        return "approved"


@dataclass
class RecordingFaceCheck:
    """Tests only. ``result`` is what every check returns; ``started`` records sessions."""

    result: FaceOutcome = "approved"
    no_face: bool = False
    started: list[tuple[str, str]] = field(default_factory=list)

    async def start(self, vendor_data: str, metadata: dict[str, str]) -> FaceSession:
        if self.no_face:
            raise NoReferenceFace("no face")
        sid = f"face-{len(self.started) + 1}"
        self.started.append((sid, vendor_data))
        return FaceSession(session_id=sid, url=f"https://face.example/{sid}")

    async def outcome(self, session_id: str, vendor_data: str) -> FaceOutcome:
        if not any(s == session_id and v == vendor_data for s, v in self.started):
            return "declined"
        return self.result
