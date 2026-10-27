"""API monitoring tables (ADR-072). Written with plain SQL by ``app.core.api_metrics``; declared
here so the schema drift guard sees them. Counts and timings only — no personal data."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["ApiMetric", "JobStatus"]


class ApiMetric(Base):
    __tablename__ = "api_metrics"
    __table_args__ = (
        CheckConstraint("kind IN ('own', 'webhook', 'outside')", name="kind_allowed"),
        CheckConstraint(
            "calls >= 0 AND client_errors >= 0 AND server_errors >= 0 AND network_errors >= 0 "
            "AND total_ms >= 0 AND max_ms >= 0 AND slow_calls >= 0",
            name="not_negative",
        ),
        Index("ix_api_metrics_kind_minute", "kind", "minute"),
    )

    minute: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    kind: Mapped[str] = mapped_column(String(8), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), primary_key=True)
    method: Mapped[str] = mapped_column(String(8), primary_key=True)
    calls: Mapped[int] = mapped_column(Integer, nullable=False)
    client_errors: Mapped[int] = mapped_column(Integer, nullable=False)
    server_errors: Mapped[int] = mapped_column(Integer, nullable=False)
    network_errors: Mapped[int] = mapped_column(Integer, nullable=False)
    total_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    max_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    slow_calls: Mapped[int] = mapped_column(Integer, nullable=False)


class JobStatus(Base):
    __tablename__ = "job_status"

    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    interval_s: Mapped[int] = mapped_column(Integer, nullable=False)
    runs: Mapped[int] = mapped_column(BigInteger, nullable=False)
    failures: Mapped[int] = mapped_column(BigInteger, nullable=False)
    last_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_ok_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(80))
    last_duration_ms: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
