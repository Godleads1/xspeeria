"""Sign-in rules as pure functions and constants (ADR-008, ADR-024, ADR-025).

No I/O and no clock: every function takes what it needs, so each rule is unit-testable on
its own and the service layer is the only place that applies them to stored state.
"""

from __future__ import annotations

import re
from datetime import timedelta

__all__ = [
    "ACCESS_TOKEN_TTL",
    "ENROL_CHALLENGE_TTL",
    "LOGIN_CHALLENGE_TTL",
    "MAX_MFA_TRIES",
    "MFA_LOCK",
    "PAYOUT_HOLD",
    "STEP_UP_ACTIONS",
    "BIOMETRIC_ENROL_WINDOW",
    "CHECK_CODE_TTL",
    "CHECKS_PER_DAY",
    "CHECKS_PER_HOUR",
    "FACE_CHECK_TTL",
    "STEP_UP_TTL",
    "TRUSTED_DEVICE_TTL",
    "CODE_RESEND_WAIT",
    "CODE_TTL",
    "IDLE_TIMEOUT",
    "LOGIN_REQUESTS_PER_MINUTE",
    "MAX_CODE_TRIES",
    "MAX_PIN_TRIES",
    "PIN_LENGTH",
    "PIN_LOCK",
    "SESSION_MAX",
    "SMS_PER_DAY",
    "SMS_PER_HOUR",
    "mask_phone",
    "normalise_email",
    "normalise_phone",
    "pin_problem",
]

#: ADR-024 — 6 digits.
PIN_LENGTH = 6
#: ADR-008 / ADR-013 — 5 wrong PINs lock log-in for 15 minutes.
MAX_PIN_TRIES = 5
PIN_LOCK = timedelta(minutes=15)
#: ADR-024 — 5 minutes without an authenticated request or refresh.
IDLE_TIMEOUT = timedelta(minutes=5)
#: ADR-024 — 7 days from the PIN log-in; never extended by refresh.
SESSION_MAX = timedelta(days=7)
#: Contract §2.1 — 15-minute access tokens.
ACCESS_TOKEN_TTL = timedelta(minutes=15)
#: ADR-024 — SMS codes per phone number.
SMS_PER_HOUR = 5
SMS_PER_DAY = 10
CODE_RESEND_WAIT = timedelta(seconds=60)
CODE_TTL = timedelta(minutes=10)
MAX_CODE_TRIES = 5
#: ADR-025 §1.2 — per network address, on the routes used before sign-in (sign-up, log-in,
#: codes, PIN reset, token refresh, fingerprint unlock). Owner, 2026-11-03: 60 (was 10), and
#: signed-in account routes are limited per customer instead, because many phones in Nigeria
#: share one mobile-network address (ADR-087).
LOGIN_REQUESTS_PER_MINUTE = 60
#: ADR-026 — second factor.
LOGIN_CHALLENGE_TTL = timedelta(minutes=5)  # contract §3.1
ENROL_CHALLENGE_TTL = timedelta(minutes=10)  # same as the SMS code expiry (ADR-024)
MAX_MFA_TRIES = 5  # wrong codes before the 2FA lock (ADR-008)
MFA_LOCK = timedelta(minutes=15)  # ADR-008
TRUSTED_DEVICE_TTL = timedelta(days=30)  # product owner, 2026-10-18
STEP_UP_TTL = timedelta(minutes=5)  # one action, within 5 minutes (2026-10-18)
#: Product owner, 2026-10-19 (DEC-044): no payout wait after recovery or an authenticator
#: reset (was 24 hours, ADR-008). Trust still ends everywhere and an alert is sent.
PAYOUT_HOLD = timedelta(0)
#: ADR-054 — the second check after the PIN (email/SMS codes or a face check).
CHECK_CODE_TTL = timedelta(minutes=10)  # same as the SMS code expiry (ADR-024)
FACE_CHECK_TTL = timedelta(minutes=15)  # time to take the selfie in the provider's page
#: Checks started per account (each may send an SMS, an email or cost a face check).
CHECKS_PER_HOUR = 5
CHECKS_PER_DAY = 10
STEP_UP_ACTIONS = frozenset(
    {
        "beneficiary.add",
        "beneficiary.remove",
        "contact.change",
        "pin.change",
        "trade.accept",
        "payout.confirm",
        # F-007: turning Face ID/fingerprint on (or replacing its key) after the sign-in.
        "biometric.enable",
        # ADR-095: deleting the account.
        "account.delete",
    }
)

#: F-007: right after a PIN and two-factor sign-in, Face ID/fingerprint can be turned on
#: without asking again. Later, it needs a fresh "Confirm it's you" (``biometric.enable``).
BIOMETRIC_ENROL_WINDOW = timedelta(minutes=10)

#: ASCII digits only: in Python, ``\d`` also matches other scripts' digits (e.g. "４").
_PIN_RE = re.compile(rf"^[0-9]{{{PIN_LENGTH}}}$")
#: E.164: "+", a non-zero country digit, 7–14 more digits (8–15 in total).
_E164_RE = re.compile(r"^\+[1-9][0-9]{7,14}$")
#: Deliberately conservative: one "@", no spaces, a dot in the domain. Full RFC 5322 is
#: not attempted; the address is proven by a future verification email, not by a regex.
_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,251}\.[^@\s]{2,}$")


def pin_problem(pin: str) -> str | None:
    """Why a new PIN is refused, or ``None``. Mirrors the app (``mobile/.../pin.ts``)."""
    if not _PIN_RE.fullmatch(pin):
        return f"Enter {PIN_LENGTH} digits"
    digits = [int(c) for c in pin]
    if all(d == digits[0] for d in digits):
        return "Avoid repeating the same digit"
    up = all(digits[i] == (digits[i - 1] + 1) % 10 for i in range(1, len(digits)))
    down = all(digits[i] == (digits[i - 1] + 9) % 10 for i in range(1, len(digits)))
    if up or down:
        return "Avoid simple sequences like 123456"
    return None


def normalise_phone(value: str) -> str | None:
    """Strict E.164 after removing spaces, dashes, dots and brackets; ``None`` if invalid.

    No country is guessed: a number without ``+`` and a country code is refused, because
    guessing would silently attach an account to the wrong number.
    """
    if len(value) > 32:
        return None
    compact = re.sub(r"[\s\-.()]", "", value)
    return compact if _E164_RE.fullmatch(compact) else None


def normalise_email(value: str) -> str | None:
    """Trimmed, lower-cased email, or ``None`` if it does not look like one."""
    candidate = value.strip().lower()
    if len(candidate) > 254 or not _EMAIL_RE.fullmatch(candidate):
        return None
    return candidate


def mask_phone(phone: str) -> str:
    """Last 4 digits only — the most the logging rule allows (ADR-025 §1.8)."""
    return f"***{phone[-4:]}" if len(phone) >= 4 else "***"
