"""Request and response bodies for the AUTH-1 endpoints (ADR-025).

Every request model forbids unknown fields, so a client cannot slip in ``user_id``,
``status`` or ``role`` and have it silently ignored today and honoured tomorrow. Response
models are separate from the database models: no hash, counter or internal field can leak.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.auth_rules import normalise_email

__all__ = [
    "BiometricEnableRequest",
    "BiometricEnableResponse",
    "BiometricUnlockRequest",
    "CheckCodesRequest",
    "CheckResponse",
    "DeviceRequest",
    "EmailCodeRequest",
    "FaceStartResponse",
    "LoginRequest",
    "PinResetVerifyRequest",
    "StepUpCheckRequest",
    "StepUpRequest",
    "StepUpResponse",
    "TrustedDeviceResponse",
    "ProfileResponse",
    "RegisterRequest",
    "RegisterResponse",
    "SessionResponse",
    "TokenResponse",
    "VerifyPhoneRequest",
]

_DEVICE_ID = r"^[A-Za-z0-9._:\-]{1,128}$"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class RegisterRequest(_Strict):
    phone: str = Field(min_length=1, max_length=32)
    email: str = Field(min_length=3, max_length=254)
    pin: str = Field(min_length=1, max_length=16)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        normalised = normalise_email(value)
        if normalised is None:
            raise ValueError("enter a valid email address")
        return normalised


class RegisterResponse(BaseModel):
    status: Literal["pending_verification"] = "pending_verification"


class VerifyPhoneRequest(_Strict):
    phone: str = Field(min_length=1, max_length=32)
    code: str = Field(pattern=r"^[0-9]{6}$")
    device_id: str | None = Field(default=None, pattern=_DEVICE_ID)


#: URL-safe base64 characters, as produced by ``secrets.token_urlsafe``.
_URLSAFE_PATTERN = r"^[A-Za-z0-9_\-]{20,128}$"


class LoginRequest(_Strict):
    #: Phone (E.164) or email.
    identifier: str = Field(min_length=1, max_length=254)
    pin: str = Field(min_length=1, max_length=16)
    device_id: str | None = Field(default=None, pattern=_DEVICE_ID)
    #: Returned after the second check; PIN-only log-in on this phone for 30 days.
    device_token: str | None = Field(default=None, pattern=_URLSAFE_PATTERN)


_CODE = r"^[0-9]{6}$"


class CheckResponse(BaseModel):
    """ADR-054: the second check still needed. ``method``: ``email`` (a code to the email),
    ``sms_email`` (an SMS code and an email code) or ``face`` (a face check)."""

    check_required: Literal[True] = True
    check_id: uuid.UUID
    purpose: Literal["signup", "login", "step_up", "pin_reset"]
    method: Literal["email", "sms_email", "face"]
    #: Masked, for the screen ("d***@example.com", "***3838").
    email_hint: str | None = None
    phone_hint: str | None = None


class CheckCodesRequest(_Strict):
    email_code: str = Field(pattern=_CODE)
    #: Only for ``sms_email`` checks.
    sms_code: str | None = Field(default=None, pattern=_CODE)
    device_id: str | None = Field(default=None, pattern=_DEVICE_ID)


class DeviceRequest(_Strict):
    device_id: str | None = Field(default=None, pattern=_DEVICE_ID)


class FaceStartResponse(BaseModel):
    #: The provider's selfie page; open it once, never store it. None: the local developer
    #: check, which needs no page.
    url: str | None


class EmailCodeRequest(_Strict):
    email_code: str = Field(pattern=_CODE)


class ChangePinRequest(_Strict):
    """ADR-046: signed in, with an approval for ``pin.change`` (ADR-054)."""

    current_pin: str = Field(min_length=1, max_length=16)
    new_pin: str = Field(min_length=1, max_length=16)


class BiometricEnableRequest(_Strict):
    """ADR-048: the trusted-device token proves this phone passed the second check."""

    device_token: str = Field(min_length=1, max_length=128)


class BiometricEnableResponse(BaseModel):
    #: Shown once. The phone keeps it behind Face ID/fingerprint; the server keeps a hash.
    unlock_key: str


class BiometricUnlockRequest(_Strict):
    refresh_token: str = Field(min_length=1, max_length=128)
    unlock_key: str = Field(min_length=1, max_length=128)


class PinResetStartRequest(_Strict):
    phone: str = Field(min_length=1, max_length=32)


class PinResetVerifyRequest(_Strict):
    """Forgot PIN, step 2: the SMS code."""

    phone: str = Field(min_length=1, max_length=32)
    code: str = Field(pattern=_CODE)


class PinResetConfirmRequest(_Strict):
    """Forgot PIN, step 3 (ADR-054): the check from step 2, the email code when that check
    is by email (none for a face check), and the new PIN."""

    check_id: uuid.UUID
    new_pin: str = Field(min_length=1, max_length=16)
    email_code: str | None = Field(default=None, pattern=_CODE)


class PhoneChangeStartRequest(_Strict):
    new_phone: str = Field(min_length=1, max_length=32)


class PhoneChangeConfirmRequest(_Strict):
    new_phone: str = Field(min_length=1, max_length=32)
    code: str = Field(pattern=r"^[0-9]{6}$")


StepUpAction = Literal[
    "beneficiary.add",
    "beneficiary.remove",
    "contact.change",
    "pin.change",
    "trade.accept",
    "payout.confirm",
]


class StepUpRequest(_Strict):
    """ADR-054: fingerprint/Face ID on a trusted phone releases the session's unlock key."""

    action: StepUpAction
    unlock_key: str = Field(min_length=1, max_length=128)


class StepUpCheckRequest(_Strict):
    """No fingerprint: start a face check (or an email code before the identity check)."""

    action: StepUpAction


class StepUpResponse(BaseModel):
    step_up_token: str
    action: str
    expires_in_seconds: int


class TrustedDeviceResponse(BaseModel):
    trusted_device_id: uuid.UUID
    device_id: str | None
    user_agent: str | None
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    check_required: Literal[False] = False
    #: Present when this device has just become trusted (30 days). Store it securely.
    device_token: str | None = None


class ProfileResponse(BaseModel):
    user_id: uuid.UUID
    phone: str
    email: str
    status: str
    created_at: datetime


class SessionResponse(BaseModel):
    session_id: uuid.UUID
    device_id: str | None
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    last_active_at: datetime
    expires_at: datetime
    current: bool
