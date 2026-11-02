"""Email provider interface (ADR-054).

Codes for the second check (sign-up, log-in on a new phone before the identity check,
confirmations, Forgot PIN) and "was this you?" alerts go to the account email.

**No real provider is connected.** Resend is the chosen provider (ADR-044) but needs the
owner's domain first. Until then the application holds no sender and the routes that need
an email answer ``SYS_503_SERVICE_UNAVAILABLE``.

``DevConsoleEmailSender`` is for a developer's own computer only: it prints to the server
window. The server refuses to start with it outside ``APP_ENV=local``. It writes to the
terminal directly, never through the logging pipeline, so no log sink receives a code.

``RecordingEmailSender`` is for tests only.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import Protocol, TextIO

from app.core.api_metrics import track_outside

__all__ = [
    "ALERT_TEXT",
    "DevConsoleEmailSender",
    "EmailSender",
    "RecordingEmailSender",
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
