"""Currency on/off switches — ADR-106 (owner 2026-11-10: "Switch built ones on/off").

A Super Admin switches a built-in currency off or back on in the admin console. No row means
the built-in default (every currency on except the yuan, which stays off until China is
cleared, ADR-105). Who switched it is in the staff audit log as well as here (no foreign key
to staff, so staff rows can be cleared alone in tests).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["CurrencySwitch"]


class CurrencySwitch(Base):
    __tablename__ = "currency_switches"
    __table_args__ = (
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_code"),
        CheckConstraint("currency <> 'NGN'", name="naira_always_on"),
        CheckConstraint("length(reason) BETWEEN 5 AND 300", name="reason_length"),
    )

    currency: Mapped[str] = mapped_column(String(3), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reason: Mapped[str] = mapped_column(String(300), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    changed_by_staff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
