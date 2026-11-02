"""A software FIDO2 security key for tests (ADR-081).

Produces the same JSON a browser hands over after ``navigator.credentials.create`` / ``get``
with a real key: "none" attestation, an ES256 (P-256) key pair, and a use counter. Lets the
tests run the real py_webauthn checks without hardware.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
from typing import Any

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

__all__ = ["SoftKey", "b64u"]


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64u(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class SoftKey:
    def __init__(self, *, rp_id: str = "localhost", origin: str = "http://localhost:3000") -> None:
        self.rp_id = rp_id
        self.origin = origin
        self.credential_id = os.urandom(32)
        self._private = ec.generate_private_key(ec.SECP256R1())
        self.sign_count = 0

    def _cose_public_key(self) -> bytes:
        numbers = self._private.public_key().public_numbers()
        return cbor2.dumps(
            {
                1: 2,  # kty: EC2
                3: -7,  # alg: ES256
                -1: 1,  # crv: P-256
                -2: numbers.x.to_bytes(32, "big"),
                -3: numbers.y.to_bytes(32, "big"),
            }
        )

    def _client_data(self, kind: str, challenge_b64u: str, origin: str | None) -> bytes:
        return json.dumps(
            {
                "type": kind,
                "challenge": challenge_b64u,
                "origin": origin or self.origin,
                "crossOrigin": False,
            }
        ).encode()

    def _auth_data(self, flags: int, rp_id: str | None, extra: bytes = b"") -> bytes:
        rp_hash = hashlib.sha256((rp_id or self.rp_id).encode()).digest()
        return rp_hash + bytes([flags]) + struct.pack(">I", self.sign_count) + extra

    def register(self, options: dict[str, Any], *, origin: str | None = None) -> dict[str, Any]:
        """Answer ``navigator.credentials.create`` options."""
        client_data = self._client_data("webauthn.create", options["challenge"], origin)
        attested = (
            bytes(16)  # AAGUID (none)
            + struct.pack(">H", len(self.credential_id))
            + self.credential_id
            + self._cose_public_key()
        )
        auth_data = self._auth_data(0x01 | 0x40, options["rp"]["id"], attested)  # UP | AT
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": b64u(self.credential_id),
            "rawId": b64u(self.credential_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64u(client_data),
                "attestationObject": b64u(attestation),
                "transports": ["usb"],
            },
            "authenticatorAttachment": "cross-platform",
            "clientExtensionResults": {},
        }

    def sign_in(
        self,
        options: dict[str, Any],
        *,
        origin: str | None = None,
        rp_id: str | None = None,
        counter_step: int = 1,
    ) -> dict[str, Any]:
        """Answer ``navigator.credentials.get`` options (one touch of the key)."""
        allowed = {_unb64u(c["id"]) for c in options.get("allowCredentials", [])}
        if allowed and self.credential_id not in allowed:
            raise AssertionError("this key was not asked for")
        self.sign_count += counter_step
        client_data = self._client_data("webauthn.get", options["challenge"], origin)
        auth_data = self._auth_data(0x01, rp_id or options.get("rpId"))  # UP
        signature = self._private.sign(
            auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256())
        )
        return {
            "id": b64u(self.credential_id),
            "rawId": b64u(self.credential_id),
            "type": "public-key",
            "response": {
                "clientDataJSON": b64u(client_data),
                "authenticatorData": b64u(auth_data),
                "signature": b64u(signature),
                "userHandle": None,
            },
            "authenticatorAttachment": "cross-platform",
            "clientExtensionResults": {},
        }
