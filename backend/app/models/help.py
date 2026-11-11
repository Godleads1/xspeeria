"""Help requests from people who can't log in — ADR-103 (owner 2026-11-09).

A person stuck at log-in (usually the face check on a new phone) writes from the "Need help?"
form. Staff reply in the admin console; the person reads and replies in the app with the
private key their phone got when the request was made (only its SHA-256 is kept here).
Nothing proves who wrote the form, so staff never share account details in it.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["HelpMessage", "HelpRequest"]


class HelpRequest(Base):
    __tablename__ = "help_requests"
    __table_args__ = (
        CheckConstraint(r"phone ~ '^\+[1-9][0-9]{7,14}$'", name="phone_e164"),
        CheckConstraint("email = lower(email) AND email <> ''", name="email_normalised"),
        CheckConstraint("status IN ('open', 'closed')", name="status_allowed"),
        CheckConstraint("length(key_hash) = 64", name="key_hash_sha256"),
        Index("ix_help_requests_status_last", "status", "last_message_at"),
        # ADR-103: the hourly clean-up finds requests closed 12 hours ago (migration 0052).
        Index(
            "ix_help_requests_closed_at", "closed_at", postgresql_where=text("status = 'closed'")
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    #: As typed in the form; never trusted to prove who wrote it.
    phone: Mapped[str] = mapped_column(String(16), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    #: The account with this phone number, if any (for staff only; the form never says).
    matched_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    #: SHA-256 (hex) of the private key the phone holds.
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by_staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id"), nullable=True
    )


class HelpMessage(Base):
    __tablename__ = "help_messages"
    __table_args__ = (
        CheckConstraint("author IN ('customer', 'staff')", name="author_allowed"),
        CheckConstraint("(author = 'staff') = (staff_id IS NOT NULL)", name="staff_author_named"),
        CheckConstraint("length(body) BETWEEN 1 AND 2000", name="body_length"),
        Index("ix_help_messages_request", "request_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("help_requests.id", ondelete="CASCADE"), nullable=False
    )
    author: Mapped[str] = mapped_column(String(16), nullable=False)
    staff_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
