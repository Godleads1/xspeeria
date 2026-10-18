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
    "ChallengeRequest",
    "ChallengeResponse",
    "EnrolConfirmRequest",
    "EnrolConfirmResponse",
    "EnrolStartResponse",
    "LoginRequest",
    "MfaVerifyRequest",
    "OtpCodeRequest",
    "RecoveryCodesResponse",
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
    #: Returned after a 2FA check; PIN-only log-in on this device for 30 days (ADR-026).
    device_token: str | None = Field(default=None, pattern=_URLSAFE_PATTERN)


class ChallengeResponse(BaseModel):
    mfa_required: Literal[True] = True
    mfa_challenge_id: uuid.UUID
    #: True at sign-up (or an unfinished sign-up): add an authenticator first.
    enrolment_required: bool


class ChallengeRequest(_Strict):
    mfa_challenge_id: uuid.UUID


class EnrolStartResponse(BaseModel):
    #: Base32 secret and otpauth link for the authenticator app. Shown once.
    secret: str
    otpauth_uri: str


class EnrolConfirmRequest(_Strict):
    mfa_challenge_id: uuid.UUID
    otp_code: str = Field(pattern=r"^[0-9]{6}$")
    device_id: str | None = Field(default=None, pattern=_DEVICE_ID)


class MfaVerifyRequest(_Strict):
    """Contract §3.1. Exactly one of ``otp_code`` or ``recovery_code``."""

    mfa_challenge_id: uuid.UUID
    otp_code: str | None = Field(default=None, pattern=r"^[0-9]{6}$")
    recovery_code: str | None = Field(default=None, min_length=8, max_length=16)
    device_id: str | None = Field(default=None, pattern=_DEVICE_ID)


StepUpAction = Literal[
    "beneficiary.add",
    "beneficiary.remove",
    "contact.change",
    "pin.change",
    "mfa.change",
    "recovery_codes.regenerate",
    "trade.accept",
    "payout.confirm",
]


class StepUpRequest(_Strict):
    action: StepUpAction
    otp_code: str = Field(pattern=r"^[0-9]{6}$")


class StepUpResponse(BaseModel):
    step_up_token: str
    action: str
    expires_in_seconds: int


class OtpCodeRequest(_Strict):
    otp_code: str = Field(pattern=r"^[0-9]{6}$")


class RecoveryCodesResponse(BaseModel):
    #: Shown once. Each works once.
    recovery_codes: list[str]


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
    mfa_required: Literal[False] = False
    #: Present when this device has just become trusted (30 days). Store it securely.
    device_token: str | None = None


class EnrolConfirmResponse(TokenResponse):
    recovery_codes: list[str]


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
