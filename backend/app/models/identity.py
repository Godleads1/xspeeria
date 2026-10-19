"""Identity and sign-in tables — Milestone AUTH-1 (ADR-025).

**No money lives here.** These tables hold who a person is and how they prove it; none of
them carries an amount, a rate, a balance or a foreign key into a money-bearing table.

Every timestamp is written by the server from its trusted clock, never taken from a client.
The PIN is stored only as an Argon2id hash, refresh tokens only as SHA-256, SMS codes only as
a keyed HMAC (`app.core.auth_tokens`). Nothing here stores a raw secret.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = [
    "AuthRefreshToken",
    "AuthSession",
    "MfaChallenge",
    "MfaFactor",
    "PhoneVerification",
    "RecoveryCode",
    "StepUpGrant",
    "TrustedDevice",
    "REVOKE_REASONS",
    "USER_STATUSES",
    "User",
]

USER_STATUSES = ("pending_verification", "active")
REVOKE_REASONS = ("logout", "revoked_by_user", "token_reuse", "replaced")

E164_CHECK = r"phone ~ '^\+[1-9][0-9]{7,14}$'"


class User(Base):
    """An individual account (S-3: individual accounts only, ADR-025 §1.5)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(E164_CHECK, name="phone_e164"),
        CheckConstraint("email = lower(email) AND email <> ''", name="email_normalised"),
        CheckConstraint("status IN ('pending_verification', 'active')", name="status_allowed"),
        CheckConstraint("failed_pin_attempts >= 0", name="failed_pin_attempts_non_negative"),
        CheckConstraint(
            "(status = 'active') = (phone_verified_at IS NOT NULL)", name="active_iff_verified"
        ),
        # A phone belongs to one account at a time, pending or not; a pending sign-up for a
        # number is replaced by a new one, never duplicated.
        Index("uq_users_phone", "phone", unique=True),
        # Email is unique among active accounts only, so an abandoned sign-up cannot block
        # the owner of that address from registering.
        Index(
            "uq_users_email_active",
            "email",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    phone: Mapped[str] = mapped_column(String(16), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    pin_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    failed_pin_attempts: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("0")
    )
    pin_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: ADR-026: wrong 2FA codes across challenges and step-ups; 5 → 15-minute lock.
    mfa_failed_attempts: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default=text("0")
    )
    mfa_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: ADR-008: set for 24 hours after a recovery-code log-in or an authenticator reset.
    #: Future payout endpoints must refuse while it is in the future.
    payout_hold_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuthSession(Base):
    """One signed-in device. Ends on log-out, revocation, 5 minutes idle or 7 days."""

    __tablename__ = "auth_sessions"
    __table_args__ = (
        CheckConstraint("expires_at > pin_verified_at", name="expires_after_start"),
        CheckConstraint(
            "(revoked_at IS NULL) = (revoke_reason IS NULL)", name="revoked_has_reason"
        ),
        CheckConstraint(
            "revoke_reason IS NULL OR revoke_reason IN "
            "('logout', 'revoked_by_user', 'token_reuse', 'replaced', 'pin_change', 'pin_reset')",
            name="revoke_reason_allowed",
        ),
        Index("ix_auth_sessions_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    device_id: Mapped[str | None] = mapped_column(String(128))
    user_agent: Mapped[str | None] = mapped_column(String(256))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    #: When the PIN was checked. The 7-day limit counts from here; refresh never moves it.
    pin_verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(32))


class AuthRefreshToken(Base):
    """Every refresh token ever issued for a session, by hash. Spent ones are kept so that
    presenting one again is recognised as theft and ends the session."""

    __tablename__ = "auth_refresh_tokens"
    __table_args__ = (
        CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_format"),
        Index("uq_auth_refresh_tokens_token_hash", "token_hash", unique=True),
        Index("ix_auth_refresh_tokens_session_id", "session_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_sessions.id", ondelete="RESTRICT"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PhoneVerification(Base):
    """One SMS code sent to a number. Rows are kept so the 5-per-hour and 10-per-day limits
    (ADR-024) are counted from durable records, not from memory."""

    __tablename__ = "phone_verifications"
    __table_args__ = (
        CheckConstraint(E164_CHECK, name="phone_e164"),
        CheckConstraint("code_digest ~ '^[0-9a-f]{64}$'", name="code_digest_format"),
        CheckConstraint("attempts BETWEEN 0 AND 5", name="attempts_range"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
        CheckConstraint("purpose IN ('signup', 'pin_reset')", name="purpose_allowed"),
        Index("ix_phone_verifications_phone_created_at", "phone", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    phone: Mapped[str] = mapped_column(String(16), nullable=False)
    code_digest: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: ADR-046: a sign-up code never resets a PIN and a reset code never activates an account.
    purpose: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'signup'"), default="signup"
    )


# --- AUTH-2: second factor (ADR-008, ADR-026) ------------------------------------------------


class MfaFactor(Base):
    """An authenticator-app secret, AES-256-GCM sealed and bound to the user ID.

    ``confirmed_at`` is set once the first code has been checked. A user has at most one
    confirmed, unrevoked factor; replacing it revokes the old row in the same transaction.
    """

    __tablename__ = "mfa_factors"
    __table_args__ = (
        CheckConstraint("kind = 'totp'", name="kind_allowed"),
        CheckConstraint("last_used_step IS NULL OR last_used_step >= 0", name="step_non_negative"),
        Index("ix_mfa_factors_user_id", "user_id"),
        Index(
            "uq_mfa_factors_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("confirmed_at IS NOT NULL AND revoked_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    secret_sealed: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    #: The last 30-second step accepted; codes at or before it are refused (replay).
    last_used_step: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MfaChallenge(Base):
    """Issued after the first factor; exchanged for a session once the second is shown."""

    __tablename__ = "mfa_challenges"
    __table_args__ = (
        CheckConstraint("purpose IN ('login', 'enrol')", name="purpose_allowed"),
        CheckConstraint("attempts BETWEEN 0 AND 5", name="attempts_range"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
        Index("ix_mfa_challenges_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    purpose: Mapped[str] = mapped_column(String(8), nullable=False)
    #: For an enrolment challenge: the pending factor being set up.
    factor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mfa_factors.id", ondelete="RESTRICT")
    )
    device_id: Mapped[str | None] = mapped_column(String(128))
    user_agent: Mapped[str | None] = mapped_column(String(256))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RecoveryCode(Base):
    """Single-use recovery code, stored only as a keyed hash bound to the user."""

    __tablename__ = "recovery_codes"
    __table_args__ = (
        CheckConstraint("code_digest ~ '^[0-9a-f]{64}$'", name="code_digest_format"),
        Index("ix_recovery_codes_user_id", "user_id"),
        Index("uq_recovery_codes_code_digest", "code_digest", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    code_digest: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TrustedDevice(Base):
    """A device that passed 2FA: PIN-only log-in there for 30 days (ADR-026)."""

    __tablename__ = "trusted_devices"
    __table_args__ = (
        CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_format"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
        Index("ix_trusted_devices_user_id", "user_id"),
        Index("uq_trusted_devices_token_hash", "token_hash", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    #: The client's own label for the device; never grants anything.
    device_id: Mapped[str | None] = mapped_column(String(128))
    user_agent: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StepUpGrant(Base):
    """One approval for one sensitive action, bound to user, session and action (ADR-026)."""

    __tablename__ = "step_up_grants"
    __table_args__ = (
        CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_format"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
        CheckConstraint(
            "action IN ('beneficiary.add', 'beneficiary.remove', 'contact.change', "
            "'pin.change', 'mfa.change', 'recovery_codes.regenerate', 'trade.accept', "
            "'payout.confirm')",
            name="action_allowed",
        ),
        Index("uq_step_up_grants_token_hash", "token_hash", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_sessions.id", ondelete="RESTRICT"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    token_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
