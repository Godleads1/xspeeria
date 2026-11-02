"""Shared rate-limit attempts (ADR-080; readiness review H-1).

One row per attempt on a limited action (sign-in steps per network address, wrong PINs for
unknown accounts, market requests per user). The key is stored only as a SHA-256 hash, so no
address, phone number or email is kept. Rows live for an hour at most.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Identity, Index, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["RateLimitHit"]


class RateLimitHit(Base):
    __tablename__ = "rate_limit_hits"
    __table_args__ = (
        CheckConstraint("octet_length(key_hash) = 32", name="key_hash_sha256"),
        Index("ix_rate_limit_hits_key_at", "limiter", "key_hash", "at"),
        Index("ix_rate_limit_hits_at", "at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    limiter: Mapped[str] = mapped_column(String(32), nullable=False)
    key_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
