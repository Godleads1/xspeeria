"""Security notice emails — ADR-084 (owner 2026-11-02).

One "was this you?" email to send: written in the same transaction as the log-in or change it
reports (an outbox), sent by a background job. Holds the kind and a shortened device name
only. The "this wasn't me" link's token is made when the email is sent; only its SHA-256 is
kept, so nothing here can rebuild a working link.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CHAR, CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["SecurityNotice"]


class SecurityNotice(Base):
    __tablename__ = "security_notices"
    __table_args__ = (
        CheckConstraint("attempts BETWEEN 0 AND 10", name="attempts_range"),
        CheckConstraint(
            "token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_format"
        ),
        CheckConstraint(
            "(token_hash IS NULL) = (token_expires_at IS NULL)", name="token_has_expiry"
        ),
        Index(
            "ix_security_notices_unsent",
            "created_at",
            postgresql_where=sql_text("sent_at IS NULL AND gave_up_at IS NULL"),
        ),
        Index("ix_security_notices_user", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    #: A key of ``app.providers.email.ALERT_TEXT``.
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    device: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    #: None: send as soon as the job runs.
    next_try_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    gave_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    token_hash: Mapped[str | None] = mapped_column(CHAR(64), unique=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
