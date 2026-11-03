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
#: ADR-084: one per log-in or change the customer is told about (``app.services.
#: security_notices.NOTICE_KINDS``), plus the lock-out warning and the freeze confirmation.
ALERT_TEXT = {
    "new_device_sign_in": "New log-in to your Xspeeria account",
    "signed_in": "New log-in to your Xspeeria account",
    "pin_changed": "Your Xspeeria PIN was changed",
    "pin_reset": "Your Xspeeria PIN was reset",
    "phone_changed": "Your Xspeeria phone number was changed",
    "checks_locked": "Too many failed checks on your Xspeeria account",
    "fingerprint_turned_on": "Fingerprint or Face ID log-in was turned on",
    "fingerprint_turned_off": "Fingerprint or Face ID log-in was turned off",
    "trusted_phone_removed": "A trusted phone was removed from your Xspeeria account",
    "payout_account_added": "A payout account was added to your Xspeeria account",
    "payout_account_removed": "A payout account was removed from your Xspeeria account",
    "payout_accounts_chosen": "A payout account was chosen for your Xspeeria deal",
    "offer_posted": "An offer was posted from your Xspeeria account",
    "request_posted": "A request was posted from your Xspeeria account",
    "offer_edited": "An offer on your Xspeeria account was changed",
    "offer_withdrawn": "An offer on your Xspeeria account was withdrawn",
    "offer_taken": "An offer was taken from your Xspeeria account",
    "account_frozen": "Your Xspeeria account is frozen",
    "account_deletion_requested": "Your Xspeeria account is being deleted",
    "account_restored": "Your Xspeeria account was restored",
}


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:1]}***@{domain}"


class EmailSender(Protocol):
    async def send_code(self, email: str, code: str) -> None:
        """Deliver a verification code. Must not log the code or the full address."""
        ...

    async def send_alert(
        self, email: str, kind: str, device: str | None, report_url: str | None = None
    ) -> None:
        """A "was this you?" message. ``kind`` is a key of ``ALERT_TEXT``. ``report_url``
        (ADR-084) is the one-time "this wasn't me" link, when there is one."""
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
    #: ADR-084: the "this wasn't me" link in an alert.
    link: str | None = None


@dataclass
class RecordingEmailSender:
    sent: list[SentEmail] = field(default_factory=list)

    async def send_code(self, email: str, code: str) -> None:
        self.sent.append(SentEmail(email=email, code=code))

    async def send_alert(
        self, email: str, kind: str, device: str | None, report_url: str | None = None
    ) -> None:
        self.sent.append(SentEmail(email=email, alert=kind, link=report_url))

    async def send_ops_alert(self, email: str, severity: str, title: str, ref: str) -> None:
        self.sent.append(SentEmail(email=email, ops_alert=f"{severity} {ref} {title}"))

    def last_code_for(self, email: str) -> str | None:
        for item in reversed(self.sent):
            if item.email == email and item.code is not None:
                return item.code
        return None

    def alerts_for(self, email: str) -> list[str]:
        return [i.alert for i in self.sent if i.email == email and i.alert is not None]

    def links_for(self, email: str) -> list[str]:
        return [i.link for i in self.sent if i.email == email and i.link is not None]


class DevConsoleEmailSender:
    """Local development only (ADR-054). Prints to the server terminal."""

    def __init__(self, stream: TextIO | None = None) -> None:
        self._stream = stream

    async def send_code(self, email: str, code: str) -> None:
        async with track_outside("Email (developer window)", "send code"):  # ADR-072
            out = self._stream or sys.stderr
            out.write(f"\n[DEV EMAIL — local only] code for {mask_email(email)}: {code}\n\n")
            out.flush()

    async def send_alert(
        self, email: str, kind: str, device: str | None, report_url: str | None = None
    ) -> None:
        async with track_outside("Email (developer window)", "send alert"):  # ADR-072
            out = self._stream or sys.stderr
            subject = ALERT_TEXT.get(kind, kind)
            link = f"\n  Not you? {report_url}" if report_url else ""
            out.write(f"\n[DEV EMAIL — local only] to {mask_email(email)}: {subject}{link}\n\n")
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


def _alert_text(kind: str, device: str | None, report_url: str | None = None) -> str:
    what = ALERT_TEXT.get(kind, "A change to your Xspeeria account")
    on = f"\nDevice: {device[:120]}\n" if device else ""
    if kind == "account_frozen":
        return (
            "You told us someone else is using your Xspeeria account, so we froze it.\n\n"
            "Every device is logged out. No one can log in, post or take offers, or receive "
            "payouts from deals that haven't been paid out yet, until Xspeeria staff check the "
            "account with you and switch it back on.\n\n"
            "Please contact Xspeeria support. Never share your PIN or codes with anyone, "
            "including Xspeeria staff."
        )
    if kind == "account_deletion_requested":
        # ADR-095 (owner 2026-11-03): what happens, what is kept and why, and how to undo it.
        return (
            "Your Xspeeria account was closed because someone asked to delete it.\n"
            f"{on}\n"
            "Every device is logged out, your open offers were withdrawn and your payout "
            "accounts were switched off.\n\n"
            "You can undo this for 14 days: open the app, log in with your phone number and "
            "PIN, and choose Restore.\n\n"
            "After 14 days we delete your in-app messages, phone notification settings and the "
            "names of your trusted phones.\n\n"
            "The law requires us to keep some records for 5 years after an account closes: "
            "your name, phone, email and date of birth, your identity check and ID images, the "
            "payout accounts you used, and your deals, disputes and refunds. Only our "
            "compliance team can see them, and they are used for nothing else.\n\n"
            "If you didn't ask for this, log in and choose Restore, then change your PIN. Never "
            "share your PIN or codes with anyone, including Xspeeria staff."
        )
    if report_url:
        # ADR-084 (owner 2026-11-02): one link, to Xspeeria's own address, which only asks
        # for a confirmation. It never asks for a PIN, a code or any other detail.
        return (
            f"{what}.\n{on}\n"
            "If this was you, there is nothing to do.\n\n"
            "If it wasn't you, freeze your account now:\n"
            f"{report_url}\n\n"
            "That page asks you to confirm, then logs every device out and stops all deals "
            "and payouts until Xspeeria staff check the account with you. It never asks for "
            "your PIN or a code. The link works once, for 7 days.\n\n"
            "Never share your PIN or codes with anyone, including Xspeeria staff."
        )
    return (
        f"{what}.\n{on}\n"
        "If this was you, there is nothing to do.\n\n"
        "If it wasn't you, open the Xspeeria app now, reset your PIN, and contact Xspeeria "
        "support. Never share your PIN or codes with anyone, including Xspeeria staff."
    )


class ResendEmailSender:
    """Sends through Resend's API (``POST https://api.resend.com/emails``).

    * Plain-text messages only. The one link is the "this wasn't me" link in a security
      notice (ADR-084), to Xspeeria's own address; codes and other alerts carry none.
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

    async def send_alert(
        self, email: str, kind: str, device: str | None, report_url: str | None = None
    ) -> None:
        await self._send(
            email,
            ALERT_TEXT.get(kind, "Xspeeria account alert"),
            _alert_text(kind, device, report_url),
        )

    async def send_ops_alert(self, email: str, severity: str, title: str, ref: str) -> None:
        await self._send(
            email,
            f"[{severity}] {title} ({ref})",
            f"Xspeeria operations alert {ref}: {title}.\n\n"
            "Open the admin console, System Health, Alerts, and press I'm on it. The details "
            "are in the console only.",
        )
