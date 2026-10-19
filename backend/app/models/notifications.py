"""In-app notifications — Milestone N-1 (ADR-044).

Data dictionary "Notification": one message for one user. ``payload`` holds only an event name
and ids/codes the app needs for its words and its link (never names, amounts, account numbers
or anything from an ID). The app writes the words in the user's language.

``dedupe_key`` makes each fact notify once per user, so a retried webhook or a repeated job
never doubles a message. Only ``read_at`` may change (guard trigger); rows are never deleted
by the app.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Identity, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["NOTIFICATION_TYPES", "Notification"]

#: Data dictionary Notification.type.
NOTIFICATION_TYPES = (
    "kyc_status",
    "match_found",
    "settlement_update",
    "dispute_update",
    "system",
)
_TYPES = ", ".join(f"'{t}'" for t in NOTIFICATION_TYPES)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(f"type IN ({_TYPES})", name="type_allowed"),
        Index("uq_notifications_user_dedupe", "user_id", "dedupe_key", unique=True),
        Index("ix_notifications_user_seq", "user_id", "seq"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    #: Insert order (several messages can share one timestamp): newest first = highest seq.
    seq: Mapped[int] = mapped_column(BigInteger, Identity(always=True), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(24), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
