"""Super Admin hardware security keys (ADR-051 Decision 2, ADR-081).

A Super Admin registers one or more FIDO2 security keys (YubiKey and similar) from My Profile.
From then on, signing in to the console is: email and password, the emailed code, **then a
touch of the key**. With ``SUPER_ADMIN_KEY_REQUIRED`` (required in production) a Super Admin
who has no key yet can sign in only to register one.

* Only the public key is stored; the private key never leaves the physical key.
* Every challenge is random, single-use and valid for 5 minutes; a failed key step ends the
  log-in (start again with the password).
* A key that reports a lower use counter than last time is refused as a possible copy.
* A lost key: another Super Admin removes it (reason required, audited, alerted), or an
  operator on the server runs ``python -m app.cli.staff_keys remove``.

What can't be proven: that the authenticator is a separate hardware key rather than a phone or
laptop's built-in one. The console asks the browser for a "cross-platform" key, but checking
the maker's attestation certificate is not done (``attestation: none``). See ADR-081.
"""

from __future__ import annotations

import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from fastapi import status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.exceptions import WebAuthnException
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.models.staff import StaffKeyChallenge, StaffSecurityKey, StaffSession
from app.services.auth import AuthRuntime

__all__ = [
    "CHALLENGE_TTL",
    "MAX_KEYS",
    "KeyStep",
    "StaffKeys",
]

_logger = get_logger(__name__)

CHALLENGE_TTL = timedelta(minutes=5)
#: Enough for a main key and spares; bounds the list sent to the browser.
MAX_KEYS = 10
_RP_NAME = "Xspeeria Admin"
_TIMEOUT_MS = 120_000


@dataclass(frozen=True)
class KeyStep:
    """The third step of a Super Admin's log-in: touch the security key."""

    challenge_id: uuid.UUID
    options: dict[str, Any]


def _err(code: str, message: str, http: int) -> AppError:
    return AppError(code, message, status_code=http)


def _key_failed() -> AppError:
    return _err(
        "ADMIN_401_KEY_CHECK_FAILED",
        "The security key check didn't work. Please log in again.",
        status.HTTP_401_UNAUTHORIZED,
    )


def _not_super_admin() -> AppError:
    return _err(
        "ADMIN_403_SUPER_ADMIN_ONLY",
        "Only a Super Admin uses a security key.",
        status.HTTP_403_FORBIDDEN,
    )


class StaffKeys:
    """Registration, the log-in step, and removal. The caller owns the transaction."""

    def __init__(self, db: AsyncSession, runtime: AuthRuntime) -> None:
        self._db = db
        self._rt = runtime

    # --- shared -------------------------------------------------------------------------

    async def keys_of(self, staff_id: uuid.UUID) -> list[StaffSecurityKey]:
        return list(
            (
                await self._db.scalars(
                    select(StaffSecurityKey)
                    .where(StaffSecurityKey.staff_id == staff_id)
                    .order_by(StaffSecurityKey.created_at)
                )
            ).all()
        )

    async def _challenge(
        self, staff_id: uuid.UUID, purpose: str, now: datetime
    ) -> StaffKeyChallenge:
        row = StaffKeyChallenge(
            id=uuid.uuid4(),
            staff_id=staff_id,
            purpose=purpose,
            challenge=secrets.token_bytes(32),
            expires_at=now + CHALLENGE_TTL,
            created_at=now,
        )
        self._db.add(row)
        await self._db.flush()
        return row

    async def _use_challenge(
        self, challenge_id: uuid.UUID, purpose: str, now: datetime
    ) -> StaffKeyChallenge | None:
        row = await self._db.scalar(
            select(StaffKeyChallenge)
            .where(StaffKeyChallenge.id == challenge_id, StaffKeyChallenge.purpose == purpose)
            .with_for_update()
        )
        if row is None or row.used_at is not None or now >= row.expires_at:
            return None
        row.used_at = now  # single use, whatever happens next
        return row

    @staticmethod
    def view(key: StaffSecurityKey) -> dict[str, Any]:
        return {
            "id": key.id,
            "name": key.name,
            "created_at": key.created_at,
            "last_used_at": key.last_used_at,
        }

    # --- log-in -------------------------------------------------------------------------

    async def login_step(self, staff_id: uuid.UUID, now: datetime) -> KeyStep:
        """After the email code: the challenge the Super Admin's key must sign."""
        keys = await self.keys_of(staff_id)
        row = await self._challenge(staff_id, "login", now)
        options = generate_authentication_options(
            rp_id=self._rt.staff_key_rp_id,
            challenge=row.challenge,
            timeout=_TIMEOUT_MS,
            allow_credentials=[PublicKeyCredentialDescriptor(id=k.credential_id) for k in keys],
            user_verification=UserVerificationRequirement.PREFERRED,
        )
        return KeyStep(row.id, json.loads(options_to_json(options)))

    async def finish_login(
        self, challenge_id: uuid.UUID, credential: dict[str, Any], now: datetime
    ) -> tuple[uuid.UUID, StaffSecurityKey]:
        """Check the key's answer. Returns (staff id, key used); raises on any failure.

        The challenge is spent either way: a failed attempt means starting again.
        """
        row = await self._use_challenge(challenge_id, "login", now)
        if row is None:
            raise _key_failed()
        try:
            raw_id = base64url_to_bytes(str(credential.get("rawId") or credential.get("id")))
        except (ValueError, TypeError):
            raise _key_failed() from None
        key = await self._db.scalar(
            select(StaffSecurityKey)
            .where(
                StaffSecurityKey.staff_id == row.staff_id, StaffSecurityKey.credential_id == raw_id
            )
            .with_for_update()
        )
        if key is None:
            raise _key_failed()
        try:
            checked = verify_authentication_response(
                credential=credential,
                expected_challenge=row.challenge,
                expected_rp_id=self._rt.staff_key_rp_id,
                expected_origin=self._rt.staff_key_origin,
                credential_public_key=key.public_key,
                credential_current_sign_count=key.sign_count,
                require_user_verification=False,
            )
        except (WebAuthnException, ValueError, TypeError, KeyError) as exc:
            # Includes a use counter that went backwards (a possibly copied key).
            _logger.warning(
                "staff_key_check_failed",
                extra={"staff_id": str(row.staff_id), "error": type(exc).__name__},
            )
            raise _key_failed() from None
        key.sign_count = checked.new_sign_count
        key.last_used_at = now
        return row.staff_id, key

    # --- registration -------------------------------------------------------------------

    async def begin_register(
        self, staff_id: uuid.UUID, email: str, is_super_admin: bool, now: datetime
    ) -> KeyStep:
        if not is_super_admin:
            raise _not_super_admin()
        keys = await self.keys_of(staff_id)
        if len(keys) >= MAX_KEYS:
            raise _err(
                "ADMIN_409_TOO_MANY_KEYS",
                f"You already have {MAX_KEYS} security keys. Remove one first.",
                status.HTTP_409_CONFLICT,
            )
        row = await self._challenge(staff_id, "register", now)
        options = generate_registration_options(
            rp_id=self._rt.staff_key_rp_id,
            rp_name=_RP_NAME,
            user_id=staff_id.bytes,
            user_name=email,
            user_display_name=email,
            challenge=row.challenge,
            timeout=_TIMEOUT_MS,
            attestation=AttestationConveyancePreference.NONE,
            authenticator_selection=AuthenticatorSelectionCriteria(
                authenticator_attachment=AuthenticatorAttachment.CROSS_PLATFORM,
                resident_key=ResidentKeyRequirement.DISCOURAGED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            exclude_credentials=[PublicKeyCredentialDescriptor(id=k.credential_id) for k in keys],
        )
        return KeyStep(row.id, json.loads(options_to_json(options)))

    async def finish_register(
        self,
        staff_id: uuid.UUID,
        is_super_admin: bool,
        challenge_id: uuid.UUID,
        name: str,
        credential: dict[str, Any],
        now: datetime,
    ) -> StaffSecurityKey:
        if not is_super_admin:
            raise _not_super_admin()
        row = await self._use_challenge(challenge_id, "register", now)
        if row is None or row.staff_id != staff_id:
            raise _err(
                "ADMIN_410_KEY_CHALLENGE_EXPIRED",
                "That took too long. Please try adding the key again.",
                status.HTTP_410_GONE,
            )
        try:
            checked = verify_registration_response(
                credential=credential,
                expected_challenge=row.challenge,
                expected_rp_id=self._rt.staff_key_rp_id,
                expected_origin=self._rt.staff_key_origin,
                require_user_verification=False,
            )
        except (WebAuthnException, ValueError, TypeError, KeyError) as exc:
            _logger.warning(
                "staff_key_register_failed",
                extra={"staff_id": str(staff_id), "error": type(exc).__name__},
            )
            raise _err(
                "ADMIN_422_KEY_NOT_ACCEPTED",
                "That security key couldn't be added. Please try again.",
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            ) from None
        taken = await self._db.scalar(
            select(func.count())
            .select_from(StaffSecurityKey)
            .where(StaffSecurityKey.credential_id == checked.credential_id)
        )
        if taken:
            raise _err(
                "ADMIN_409_KEY_ALREADY_ADDED",
                "That security key is already added.",
                status.HTTP_409_CONFLICT,
            )
        key = StaffSecurityKey(
            id=uuid.uuid4(),
            staff_id=staff_id,
            credential_id=checked.credential_id,
            public_key=checked.credential_public_key,
            sign_count=checked.sign_count,
            name=name.strip()[:60] or "Security key",
            created_at=now,
        )
        self._db.add(key)
        # A Super Admin who signed in only to set up a key now has a full session.
        await self._db.execute(
            update(StaffSession)
            .where(StaffSession.staff_id == staff_id, StaffSession.key_setup_only.is_(True))
            .values(key_setup_only=False)
        )
        await self._db.flush()
        return key

    # --- removal ------------------------------------------------------------------------

    async def remove_own(self, staff_id: uuid.UUID, key_id: uuid.UUID) -> StaffSecurityKey:
        keys = await self.keys_of(staff_id)
        key = next((k for k in keys if k.id == key_id), None)
        if key is None:
            raise _err("RES_404_NOT_FOUND", "Not found.", status.HTTP_404_NOT_FOUND)
        if self._rt.super_admin_key_required and len(keys) == 1:
            raise _err(
                "ADMIN_409_LAST_KEY",
                "This is your only security key. Add another one before removing it.",
                status.HTTP_409_CONFLICT,
            )
        await self._db.delete(key)
        await self._db.flush()
        return key

    async def remove_all_of(self, staff_id: uuid.UUID) -> int:
        """Every key of one staff member (lost key). Their sessions are ended by the caller."""
        result = await self._db.execute(
            delete(StaffSecurityKey).where(StaffSecurityKey.staff_id == staff_id)
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]


def credential_id_text(key: StaffSecurityKey) -> str:
    """For logs and the audit trail: a short, non-secret label of the key."""
    return bytes_to_base64url(key.credential_id)[:12]
