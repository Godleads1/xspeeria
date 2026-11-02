"""Email provider interface (ADR-054).

Codes for the second check (sign-up, log-in on a new phone before the identity check,
confirmations, Forgot PIN) and "was this you?" alerts go to the account email.

``ResendEmailSender`` is the real one (Resend, ADR-044; ADR-082). It is used only when
``RESEND_API_KEY`` and ``EMAIL_FROM`` are both set, and Resend accepts mail only from a domain
the owner has verified there. Without a sender the routes that need an email answer
``SYS_503_SERVICE_UNAVAILABLE``.

``DevConsoleEmailSender`` is for a developer's own computer only: it prints to the server
window. The server refuses to start with it outside ``APP_ENV=local``. It writes to the
terminal directly, never through the logging pipeline, so no log sink receives a code.

``RecordingEmailSender`` is for tests only.
"""

from __future__ import annotations

import sys
import uuid
from dataclasses import dataclass, field
from typing import Protocol, TextIO

import httpx

from app.core.api_metrics import track_outside, tracked_transport

__all__ = [
    "ALERT_TEXT",
    "RESEND_URL",
    "DevConsoleEmailSender",
    "EmailDeliveryError",
    "EmailSender",
    "RecordingEmailSender",
    "ResendEmailSender",
    "SentEmail",
    "mask_email",
]

#: Alert subjects. Never the code, a full number, an amount or an account number.
ALERT_TEXT = {
    "new_device_sign_in": "New log-in to your Xspeeria account",
    "pin_changed": "Your Xspeeria PIN was changed",
    "pin_reset": "Your Xspeeria PIN was reset",
    "phone_changed": "Your Xspeeria phone number was changed",
    "checks_locked": "Too many failed checks on your Xspeeria account",
}


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:1]}***@{domain}"


class EmailSender(Protocol):
    async def send_code(self, email: str, code: str) -> None:
        """Deliver a verification code. Must not log the code or the full address."""
        ...

    async def send_alert(self, email: str, kind: str, device: str | None) -> None:
        """A "was this you?" message. ``kind`` is a key of ``ALERT_TEXT``."""
        ...

    async def send_ops_alert(self, email: str, severity: str, title: str, ref: str) -> None:
        """ADR-074: an operations alert to a Super Admin. Severity, a fixed title and the
        alert's reference only; the details stay in the console."""
        ...


@dataclass(frozen=True)
class SentEmail:
    email: str
    code: str | None = None
    alert: str | None = None
    #: ADR-074: "P1 #REF Title" for an operations alert.
    ops_alert: str | None = None


@dataclass
class RecordingEmailSender:
    sent: list[SentEmail] = field(default_factory=list)

    async def send_code(self, email: str, code: str) -> None:
        self.sent.append(SentEmail(email=email, code=code))

    async def send_alert(self, email: str, kind: str, device: str | None) -> None:
        self.sent.append(SentEmail(email=email, alert=kind))

    async def send_ops_alert(self, email: str, severity: str, title: str, ref: str) -> None:
        self.sent.append(SentEmail(email=email, ops_alert=f"{severity} {ref} {title}"))

    def last_code_for(self, email: str) -> str | None:
        for item in reversed(self.sent):
            if item.email == email and item.code is not None:
                return item.code
        return None

    def alerts_for(self, email: str) -> list[str]:
        return [i.alert for i in self.sent if i.email == email and i.alert is not None]


class DevConsoleEmailSender:
    """Local development only (ADR-054). Prints to the server terminal."""

    def __init__(self, stream: TextIO | None = None) -> None:
        self._stream = stream

    async def send_code(self, email: str, code: str) -> None:
        async with track_outside("Email (developer window)", "send code"):  # ADR-072
            out = self._stream or sys.stderr
            out.write(f"\n[DEV EMAIL — local only] code for {mask_email(email)}: {code}\n\n")
            out.flush()

    async def send_alert(self, email: str, kind: str, device: str | None) -> None:
        async with track_outside("Email (developer window)", "send alert"):  # ADR-072
            out = self._stream or sys.stderr
            subject = ALERT_TEXT.get(kind, kind)
            out.write(f"\n[DEV EMAIL — local only] to {mask_email(email)}: {subject}\n\n")
            out.flush()

    async def send_ops_alert(self, email: str, severity: str, title: str, ref: str) -> None:
        async with track_outside("Email (developer window)", "send ops alert"):  # ADR-074
            out = self._stream or sys.stderr
            line = f"[{severity}] {title} ({ref})"
            out.write(f"\n[DEV EMAIL — local only] to {mask_email(email)}: {line}\n\n")
            out.flush()


RESEND_URL = "https://api.resend.com/emails"


class EmailDeliveryError(RuntimeError):
    """Resend refused or couldn't be reached. The message names no address and no content."""


def _code_text(code: str) -> str:
    return (
        f"Your Xspeeria code is {code}.\n\n"
        "It works for 10 minutes. Enter it only in the Xspeeria app or the Xspeeria admin "
        "console.\n\n"
        "Xspeeria staff will never ask you for this code. If you didn't ask for it, you can "
        "ignore this email."
    )


def _alert_text(kind: str, device: str | None) -> str:
    what = ALERT_TEXT.get(kind, "A change to your Xspeeria account")
    on = f"\nDevice: {device[:120]}\n" if device else ""
    return (
        f"{what}.\n{on}\n"
        "If this was you, there is nothing to do.\n\n"
        "If it wasn't you, open the Xspeeria app now, reset your PIN, and contact Xspeeria "
        "support. Never share your PIN or codes with anyone, including Xspeeria staff."
    )


class ResendEmailSender:
    """Sends through Resend's API (``POST https://api.resend.com/emails``).

    * Plain-text messages only; no links, so a message can't be imitated by a phishing link.
    * Each message carries an ``Idempotency-Key`` (kept 24 hours by Resend), so the one retry
      after a network error or a 5xx can't send it twice.
    * Nothing about the message is logged: not the address, not the code. A failure raises
      ``EmailDeliveryError`` with the HTTP status only.
    """

    def __init__(
        self, api_key: str, sender: str, *, client: httpx.AsyncClient | None = None
    ) -> None:
        if not api_key or not sender:
            raise ValueError("Resend needs RESEND_API_KEY and EMAIL_FROM")
        self._key = api_key
        self._from = sender
        self._client = client

    async def _send(self, to: str, subject: str, text: str) -> None:
        body = {"from": self._from, "to": [to], "subject": subject, "text": text}
        # One key per message, reused only by its retry: the retry can't send it twice, and
        # a real second message (another "new log-in" alert) is never mistaken for a repeat.
        key = uuid.uuid4().hex
        headers = {
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Idempotency-Key": key,
        }
        client = self._client or httpx.AsyncClient(
            timeout=10, transport=tracked_transport("Resend email")
        )
        try:
            for attempt in (1, 2):
                try:
                    r = await client.post(RESEND_URL, json=body, headers=headers)
                except httpx.TransportError:
                    if attempt == 2:
                        raise EmailDeliveryError("Resend could not be reached") from None
                    continue
                if r.status_code < 300:
                    return
                if r.status_code >= 500 and attempt == 1:
                    continue
                raise EmailDeliveryError(f"Resend refused the email (HTTP {r.status_code})")
        finally:
            if self._client is None:
                await client.aclose()

    async def send_code(self, email: str, code: str) -> None:
        await self._send(email, "Your Xspeeria code", _code_text(code))

    async def send_alert(self, email: str, kind: str, device: str | None) -> None:
        await self._send(
            email, ALERT_TEXT.get(kind, "Xspeeria account alert"), _alert_text(kind, device)
        )

    async def send_ops_alert(self, email: str, severity: str, title: str, ref: str) -> None:
        await self._send(
            email,
            f"[{severity}] {title} ({ref})",
            f"Xspeeria operations alert {ref}: {title}.\n\n"
            "Open the admin console, System Health, Alerts, and press I'm on it. The details "
            "are in the console only.",
        )
