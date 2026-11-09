"""Official naira rates fetched automatically — ADR-102 (owner 2026-11-09).

One row per successful fetch of one currency's CBN rate: what the provider said (the CBN's
date and central rate), where it came from and when it was fetched. Kept forever as the
record of which ceiling applied when; never changed or deleted (append-only trigger).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["OfficialRate"]


class OfficialRate(Base):
    __tablename__ = "official_rates"
    __table_args__ = (
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        CheckConstraint("rate > 0", name="rate_positive"),
        Index("ix_official_rates_currency_fetched", "currency", "fetched_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    #: The foreign currency; the rate is naira per 1 unit of it.
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    #: The CBN's own date for the figure.
    rate_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
