"""Second-factor building blocks (ADR-008, ADR-026).

* ``SecretBox`` — AES-256-GCM for TOTP secrets at rest. The user ID is bound in as associated
  data, so a ciphertext copied onto another user's row will not decrypt.
* TOTP — RFC 6238 through ``pyotp`` (SHA-1, 6 digits, 30 s), checked at steps t-1, t, t+1.
  ``match_step`` returns the step that matched so the caller can refuse it next time
  (each code works once, RFC 6238 §5.2).
* Recovery codes — 10 codes of 8 Crockford base32 characters (40 bits each), shown as
  ``XXXX-XXXX``. Input is normalised the Crockford way (O→0, I/L→1, dashes and spaces
  ignored) so a code read aloud or retyped still works.
"""

from __future__ import annotations

import base64
import hmac
import os
import secrets
from datetime import datetime
from urllib.parse import quote

import pyotp
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

__all__ = [
    "RECOVERY_CODE_COUNT",
    "SecretBox",
    "SecretBoxError",
    "match_step",
    "new_recovery_codes",
    "new_totp_secret",
    "normalise_recovery_code",
    "otpauth_uri",
]

TOTP_DIGITS = 6
TOTP_PERIOD = 30
TOTP_WINDOW = 1
RECOVERY_CODE_COUNT = 10
_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_NONCE_LEN = 12


class SecretBoxError(Exception):
    """A ciphertext could not be opened. Carries no detail."""


class SecretBox:
    """AES-256-GCM with a 96-bit random nonce stored in front of the ciphertext."""

    def __init__(self, key_b64: str, *, name: str = "MFA_ENCRYPTION_KEY") -> None:
        try:
            key = base64.b64decode(key_b64, validate=True)
        except ValueError as exc:
            raise ValueError(f"{name} must be base64") from exc
        if len(key) != 32:
            raise ValueError(f"{name} must decode to 32 bytes")
        self._aead = AESGCM(key)

    def __repr__(self) -> str:
        return "SecretBox(<redacted>)"

    def seal(self, plaintext: str, *, bound_to: str) -> bytes:
        nonce = os.urandom(_NONCE_LEN)
        return nonce + self._aead.encrypt(nonce, plaintext.encode(), bound_to.encode())

    def open(self, sealed: bytes, *, bound_to: str) -> str:
        try:
            nonce, body = sealed[:_NONCE_LEN], sealed[_NONCE_LEN:]
            return self._aead.decrypt(nonce, body, bound_to.encode()).decode()
        except (InvalidTag, ValueError) as exc:
            raise SecretBoxError from exc


def new_totp_secret() -> str:
    """160 random bits as base32 (ADR-008: at least 160 bits)."""
    return base64.b32encode(secrets.token_bytes(20)).decode()


def otpauth_uri(secret: str, account_label: str) -> str:
    """Link for authenticator apps. The label should not be a full phone or email."""
    issuer = "Xspeeria"
    label = quote(f"{issuer}:{account_label}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={issuer}"
        f"&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_PERIOD}"
    )


def match_step(secret: str, code: str, now: datetime, last_used_step: int | None) -> int | None:
    """The 30-second step whose code equals ``code``, or ``None``.

    Steps at or before ``last_used_step`` are never accepted, so a code that already worked
    (or an older one) cannot be replayed. Every candidate is compared in constant time.
    """
    if len(code) != TOTP_DIGITS or not code.isascii() or not code.isdigit():
        return None
    totp = pyotp.TOTP(secret, digits=TOTP_DIGITS, interval=TOTP_PERIOD)
    current = int(now.timestamp()) // TOTP_PERIOD
    found: int | None = None
    for step in range(current - TOTP_WINDOW, current + TOTP_WINDOW + 1):
        expected = totp.at(step * TOTP_PERIOD)
        if hmac.compare_digest(expected, code) and (
            last_used_step is None or step > last_used_step
        ):
            found = step if found is None else found
    return found


def new_recovery_codes() -> list[str]:
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(_CROCKFORD) for _ in range(8))
        codes.append(f"{raw[:4]}-{raw[4:]}")
    return codes


def normalise_recovery_code(value: str) -> str | None:
    """Canonical 8-character form, or ``None`` if it cannot be a recovery code."""
    if len(value) > 32:
        return None
    compact = value.upper().replace("-", "").replace(" ", "")
    compact = compact.translate(str.maketrans("OIL", "011"))
    if len(compact) != 8 or any(c not in _CROCKFORD for c in compact):
        return None
    return compact
