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
    "LoginRequest",
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


class LoginRequest(_Strict):
    #: Phone (E.164) or email.
    identifier: str = Field(min_length=1, max_length=254)
    pin: str = Field(min_length=1, max_length=16)
    device_id: str | None = Field(default=None, pattern=_DEVICE_ID)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    #: Always false in AUTH-1: no second factor can be enrolled yet (ADR-025 §2).
    mfa_required: bool = False


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
