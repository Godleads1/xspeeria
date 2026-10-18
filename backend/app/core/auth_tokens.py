"""Access tokens, refresh tokens and SMS codes (ADR-025 §2).

* **Access token** — JWT, HS256 only (the algorithm is fixed, never read from the token, so
  ``alg: none`` and key-confusion attacks cannot apply), 15 minutes, carrying only the user
  ID and session ID. Issuer and audience are checked.
* **Refresh token** — 256 random bits, URL-safe. Stored only as SHA-256: with that much
  entropy a fast hash is enough, and a leaked table cannot be turned back into tokens.
* **SMS code** — 6 random digits, stored only as an HMAC bound to the phone number, under a
  key derived from the signing key. A 6-digit code has a million values, so a plain hash
  could be reversed from a leaked table in seconds; the HMAC key prevents that.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import jwt

from app.domain.auth_rules import ACCESS_TOKEN_TTL

__all__ = [
    "AccessClaims",
    "InvalidAccessToken",
    "TokenKeys",
    "generate_code",
    "generate_refresh_token",
    "hash_refresh_token",
]

ALGORITHM = "HS256"
ISSUER = "xspeeria"
AUDIENCE = "xspeeria-api"
MIN_KEY_LENGTH = 32


class InvalidAccessToken(Exception):
    """Any problem with an access token. Deliberately carries no detail."""


@dataclass(frozen=True)
class AccessClaims:
    user_id: UUID
    session_id: UUID


class TokenKeys:
    """Holds the signing key and the keys derived from it. Never logs or returns them."""

    def __init__(self, secret: str) -> None:
        if len(secret) < MIN_KEY_LENGTH:
            raise ValueError(f"JWT signing key must be at least {MIN_KEY_LENGTH} characters")
        self._signing = secret.encode()
        self._code_key = hmac.new(self._signing, b"xspeeria/sms-code/v1", hashlib.sha256).digest()

    def __repr__(self) -> str:  # never print key material
        return "TokenKeys(<redacted>)"

    def issue_access(self, claims: AccessClaims, now: datetime) -> str:
        payload = {
            "sub": str(claims.user_id),
            "sid": str(claims.session_id),
            "iat": int(now.timestamp()),
            "exp": int((now + ACCESS_TOKEN_TTL).timestamp()),
            "iss": ISSUER,
            "aud": AUDIENCE,
            "typ": "access",
        }
        return jwt.encode(payload, self._signing, algorithm=ALGORITHM)

    def read_access(self, token: str, now: datetime) -> AccessClaims:
        try:
            payload = jwt.decode(
                token,
                self._signing,
                algorithms=[ALGORITHM],
                audience=AUDIENCE,
                issuer=ISSUER,
                options={
                    "require": ["exp", "iat", "sub", "sid", "iss", "aud"],
                    # Time claims are checked below against the injected clock, not the
                    # machine clock, so the service and its tests agree on "now".
                    "verify_exp": False,
                    "verify_iat": False,
                    "verify_nbf": False,
                },
            )
            stamp = int(now.timestamp())
            if (
                int(payload["exp"]) <= stamp
                or int(payload["iat"]) > stamp + 60  # issued in the future: refuse
                or payload.get("typ") != "access"
            ):
                raise InvalidAccessToken
            return AccessClaims(user_id=UUID(payload["sub"]), session_id=UUID(payload["sid"]))
        except InvalidAccessToken:
            raise
        except (jwt.PyJWTError, ValueError, KeyError, TypeError) as exc:
            raise InvalidAccessToken from exc

    def code_digest(self, phone: str, code: str) -> str:
        return hmac.new(self._code_key, f"{phone}|{code}".encode(), hashlib.sha256).hexdigest()

    def code_matches(self, phone: str, code: str, stored_digest: str) -> bool:
        return hmac.compare_digest(self.code_digest(phone, code), stored_digest)


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"
