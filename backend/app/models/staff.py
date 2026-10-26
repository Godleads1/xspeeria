"""Admin console staff (ADR-051, ADR-060).

Staff are separate from customers: their own table, their own password + email-code sign-in,
their own sessions. Passwords are Argon2id hashes, email codes keyed HMACs, session tokens
SHA-256 — nothing here stores a raw secret. ``staff_audit_log`` is append-only (the database
refuses UPDATE and DELETE).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = [
    "StaffAccount",
    "StaffAuditEntry",
    "StaffCode",
    "StaffRole",
    "StaffSession",
]


class StaffRole(Base):
    __tablename__ = "staff_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    #: ``"<module>.<action>"`` values from ``app.domain.staff_rules.ALL_PERMISSIONS``.
    permissions: Mapped[list[str]] = mapped_column(ARRAY(String(40)), nullable=False)
    #: Built in (TDS §11.2). Built-in roles cannot be deleted; ``super_admin`` cannot be edited.
    builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StaffAccount(Base):
    __tablename__ = "staff_accounts"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'disabled')", name="status_allowed"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint(r"phone ~ '^\+[1-9][0-9]{7,14}$'", name="phone_e164"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    #: International form (+234...). Required for new staff (owner decision 2026-10-26); not
    #: checked by SMS.
    phone: Mapped[str | None] = mapped_column(String(16))
    #: Where the photo is kept in the photo store (ADR-049). Never the photo itself.
    photo_key: Mapped[str | None] = mapped_column(String(64))
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_roles.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    #: Argon2id. Null until the person sets a password from their invitation code.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    failed_logins: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StaffCode(Base):
    """An emailed 6-digit code: the second step of a log-in, or a password (re)set."""

    __tablename__ = "staff_codes"
    __table_args__ = (
        CheckConstraint("purpose IN ('login', 'password')", name="purpose_allowed"),
        Index("ix_staff_codes_staff", "staff_id", "purpose", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    #: Null for a password-reset request on an email with no account (looks the same).
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="CASCADE")
    )
    purpose: Mapped[str] = mapped_column(String(10), nullable=False)
    code_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    tries: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class StaffSession(Base):
    __tablename__ = "staff_sessions"
    __table_args__ = (Index("ix_staff_sessions_staff", "staff_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    staff_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="CASCADE"), nullable=False
    )
    #: SHA-256 of the cookie value.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(256))


class StaffAuditEntry(Base):
    """Who did what in the admin console. Append-only (FX-04): the database refuses edits."""

    __tablename__ = "staff_audit_log"
    __table_args__ = (
        Index("ix_staff_audit_log_at", "at"),
        Index("ix_staff_audit_log_staff", "staff_id", "at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: Null when no account is known (a log-in with an unknown email).
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    action: Mapped[str] = mapped_column(String(48), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(24))
    target_id: Mapped[str | None] = mapped_column(String(64))
    #: Facts about the action. Never a password, code, token or customer secret.
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(256))
