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
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
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
    "PhoneVerification",
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
            "('logout', 'revoked_by_user', 'token_reuse', 'replaced')",
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
        Index("ix_phone_verifications_phone_created_at", "phone", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    phone: Mapped[str] = mapped_column(String(16), nullable=False)
    code_digest: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
