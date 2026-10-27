"""Phone push provider (ADR-052, Milestone N-3).

``ExpoPushSender`` sends through Expo's push service, which delivers through Firebase Cloud
Messaging (Android) and Apple's push service (iOS). It is used only when ``PUSH_ENABLED`` is
set (owner set up Firebase and Expo for this, 2026-10-19). Nothing is sent otherwise.

Messages carry a title, a short body and the event name and ids the app needs to open the
right screen — never names, amounts or account numbers, since they show on a locked screen.

``RecordingPushSender`` is for tests only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.api_metrics import tracked_transport

__all__ = ["ExpoPushSender", "PushMessage", "PushResult", "PushSender", "RecordingPushSender"]

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
#: Expo accepts at most 100 messages per request.
BATCH = 100


@dataclass(frozen=True)
class PushMessage:
    token: str
    title: str
    body: str
    data: dict[str, Any]


@dataclass(frozen=True)
class PushResult:
    """Per message, in order: ``ok``, ``unregistered`` (stop using the token) or ``error``."""

    outcomes: list[str]


class PushSender(Protocol):
    async def send(self, messages: list[PushMessage]) -> PushResult:
        """Raise on a transport failure (nothing is recorded; the next round retries)."""
        ...


class ExpoPushSender:
    def __init__(self, access_token: str | None = None, *, client: httpx.AsyncClient | None = None):
        self._token = access_token
        self._client = client

    async def send(self, messages: list[PushMessage]) -> PushResult:
        outcomes: list[str] = []
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        client = self._client or httpx.AsyncClient(
            timeout=10, transport=tracked_transport("Expo phone push")
        )
        try:
            for start in range(0, len(messages), BATCH):
                chunk = messages[start : start + BATCH]
                body = [
                    {
                        "to": m.token,
                        "title": m.title,
                        "body": m.body,
                        "data": m.data,
                        "sound": "default",
                        "priority": "high",
                    }
                    for m in chunk
                ]
                r = await client.post(EXPO_PUSH_URL, json=body, headers=headers)
                r.raise_for_status()
                tickets = r.json().get("data", [])
                for i, _ in enumerate(chunk):
                    t = tickets[i] if i < len(tickets) and isinstance(tickets[i], dict) else {}
                    if t.get("status") == "ok":
                        outcomes.append("ok")
                    elif (t.get("details") or {}).get("error") == "DeviceNotRegistered":
                        outcomes.append("unregistered")
                    else:
                        outcomes.append("error")
        finally:
            if self._client is None:
                await client.aclose()
        return PushResult(outcomes)


@dataclass
class RecordingPushSender:
    sent: list[PushMessage] = field(default_factory=list)
    #: Tokens the fake service reports as no longer registered.
    unregistered: set[str] = field(default_factory=set)
    fail: bool = False

    async def send(self, messages: list[PushMessage]) -> PushResult:
        if self.fail:
            raise httpx.ConnectError("push service unreachable")
        self.sent.extend(messages)
        return PushResult(
            ["unregistered" if m.token in self.unregistered else "ok" for m in messages]
        )
