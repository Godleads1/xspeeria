"""Didit identity verification — Milestone KYC-1 (ADR-039).

Follows Didit's documented API (docs.didit.me, read 2026-10-19):

* ``POST {base}/v3/session/`` with ``x-api-key``; body ``workflow_id``, ``vendor_data``
  (our user id), optional ``callback`` and ``metadata``. Returns ``session_id``, ``url``,
  ``status``. Didit returns the same unfinished session again for the same ``vendor_data``.
* Webhooks carry ``X-Signature-V2`` and ``X-Timestamp``. The signature is HMAC-SHA256 (hex)
  with the webhook secret over a canonical JSON form of the body: whole-number floats become
  integers, keys sorted recursively, compact separators, Unicode not escaped. Timestamps
  more than 300 seconds away are refused. Comparison is constant-time.

The API key and webhook secret are secrets: never logged, never returned, never in errors.
The session ``url`` lets anyone holding it continue that person's check, so it is passed to
the app once and not stored.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

__all__ = [
    "DiditClient",
    "KycProviderError",
    "KycSession",
    "KycSessionProvider",
    "canonical_json",
    "verify_signature",
]

REPLAY_SECONDS = 300
_TIMEOUT = httpx.Timeout(10.0)


class KycProviderError(Exception):
    """The provider could not be reached or refused the request. Message is safe to log."""


@dataclass(frozen=True)
class KycSession:
    session_id: str
    url: str
    status: str


class KycSessionProvider(Protocol):
    name: str

    async def create_session(self, vendor_data: str, metadata: dict[str, str]) -> KycSession: ...

    def webhook_secret(self) -> bytes: ...


def _shorten_floats(data: Any) -> Any:
    if isinstance(data, float) and data.is_integer():
        return int(data)
    if isinstance(data, dict):
        return {k: _shorten_floats(v) for k, v in data.items()}
    if isinstance(data, list):
        return [_shorten_floats(v) for v in data]
    return data


def canonical_json(payload: Any) -> str:
    return json.dumps(
        _shorten_floats(payload), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )


def verify_signature(
    payload: Any, signature: str, timestamp: str, secret: bytes, now_epoch: int
) -> bool:
    """Didit ``X-Signature-V2`` check. ``payload`` is the parsed JSON body."""
    try:
        sent = int(timestamp)
    except ValueError:
        return False
    if abs(now_epoch - sent) > REPLAY_SECONDS:
        return False
    expected = hmac.new(secret, canonical_json(payload).encode("utf-8"), hashlib.sha256)
    return hmac.compare_digest(signature.encode(), expected.hexdigest().encode())


class DiditClient:
    name = "didit"

    def __init__(
        self,
        api_key: str,
        workflow_id: str,
        webhook_secret: str,
        base_url: str = "https://verification.didit.me",
        callback_url: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._key = api_key
        self._workflow = workflow_id
        self._secret = webhook_secret.encode("utf-8")
        self._base = base_url.rstrip("/")
        self._callback = callback_url
        self._transport = transport

    def webhook_secret(self) -> bytes:
        return self._secret

    async def create_session(self, vendor_data: str, metadata: dict[str, str]) -> KycSession:
        body: dict[str, Any] = {
            "workflow_id": self._workflow,
            "vendor_data": vendor_data,
            "metadata": metadata,
        }
        if self._callback:
            body["callback"] = self._callback
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT, transport=self._transport) as c:
                r = await c.post(
                    f"{self._base}/v3/session/", json=body, headers={"x-api-key": self._key}
                )
        except httpx.HTTPError as exc:
            raise KycProviderError(f"didit unreachable: {type(exc).__name__}") from None
        if r.status_code not in (200, 201):
            raise KycProviderError(f"didit refused session: HTTP {r.status_code}")
        try:
            data = r.json()
            session = KycSession(str(data["session_id"]), str(data["url"]), str(data["status"]))
        except (ValueError, KeyError, TypeError):
            raise KycProviderError("didit session response not understood") from None
        if not session.url.startswith("https://") or not session.session_id:
            raise KycProviderError("didit session response not understood")
        return session
