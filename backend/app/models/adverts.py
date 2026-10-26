"""Adverts in the app's advert slot — ADR-067 (ADR-056 decision 2).

The picture lives in the object store (ADR-049), never in PostgreSQL; this row keeps its key,
type and size, when it shows, an optional https link and an on/off switch. Never deleted.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["Advert"]


class Advert(Base):
    __tablename__ = "adverts"
    __table_args__ = (
        CheckConstraint("char_length(btrim(name)) BETWEEN 2 AND 60", name="name_length"),
        CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp')", name="content_type_allowed"
        ),
        CheckConstraint("width > 0 AND height > 0", name="size_positive"),
        CheckConstraint("ends_at > starts_at", name="end_after_start"),
        CheckConstraint(
            "link_url IS NULL OR link_url ~ '^https://[^\\s<>\"]+$'", name="link_https"
        ),
        Index("ix_adverts_window", "active", "starts_at", "ends_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    image_key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(16), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    link_url: Mapped[str | None] = mapped_column(String(500))
    #: Staff can switch an advert off before its end date.
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
