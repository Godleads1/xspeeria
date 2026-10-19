"""Identity checks — Milestone KYC-1 (ADR-039).

``KycCase`` is the data dictionary's KYCCases: one identity check for one user. The provider
(Didit) captures the ID document and selfie on its own screens and keeps them; Xspeeria keeps
only the outcome and the few facts it needs (legal name, date of birth, ID type, issuing
country). No ID images, no document numbers, no provider payloads are stored. ADR-041 adds a
keyed hash of the ID document (``identity_key``) so one person holds one verified account.

``KycWebhookEvent`` records each provider event id once, so a retried or replayed message is
never applied twice. It holds no personal data.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import CHAR, CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["KycCase", "KycWebhookEvent"]

_STATUSES = "'pending_documents', 'under_review', 'approved', 'rejected', 'expired'"


class KycCase(Base):
    __tablename__ = "kyc_cases"
    __table_args__ = (
        CheckConstraint(f"status IN ({_STATUSES})", name="status_allowed"),
        CheckConstraint("provider IN ('didit')", name="provider_allowed"),
        CheckConstraint(
            "id_type IS NULL OR id_type IN ('passport', 'national_id', 'drivers_license', 'other')",
            name="id_type_allowed",
        ),
        # Data dictionary: an approved case carries the name and date of birth from the ID.
        CheckConstraint(
            "status <> 'approved' OR (legal_name IS NOT NULL AND date_of_birth IS NOT NULL)",
            name="approved_has_identity",
        ),
        # Data dictionary: "decision_reason — required if rejected".
        CheckConstraint(
            "status <> 'rejected' OR decision_reason IS NOT NULL", name="rejected_has_reason"
        ),
        CheckConstraint(
            "(status IN ('approved', 'rejected')) = (decided_at IS NOT NULL) OR status = 'expired'",
            name="decided_iff_decision",
        ),
        Index("uq_kyc_cases_provider_session", "provider", "provider_session_id", unique=True),
        # Contract §3.3: one non-terminal case per user at a time — per country (ADR-042).
        Index(
            "uq_kyc_cases_one_active",
            "user_id",
            "country",
            unique=True,
            postgresql_where=text("status IN ('pending_documents', 'under_review')"),
        ),
        CheckConstraint("country IN ('NG', 'GB', 'US')", name="country_allowed"),
        Index("ix_kyc_cases_user_created", "user_id", "created_at"),
        CheckConstraint(
            "review_reason IS NULL OR review_reason IN "
            "('DUPLICATE_IDENTITY', 'CHECKS_INCOMPLETE', 'IDENTITY_MISMATCH')",
            name="review_reason_allowed",
        ),
        # ADR-041: one approved case per ID document (backstop to the advisory lock).
        Index(
            "uq_kyc_cases_identity_approved",
            "identity_key",
            unique=True,
            postgresql_where=text("status = 'approved' AND identity_key IS NOT NULL"),
        ),
        Index("ix_kyc_cases_identity_key", "identity_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    #: ADR-042: the country this check verifies (ISO alpha-2); set once.
    country: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    provider_session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    #: The provider's own status word, as last received (for support; not personal data).
    provider_status: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    id_type: Mapped[str | None] = mapped_column(String(16))
    #: ISO 3166-1 alpha-3, as the provider reports the document's issuer.
    issuing_country: Mapped[str | None] = mapped_column(CHAR(3))
    decision_reason: Mapped[str | None] = mapped_column(Text)
    #: ADR-041: HMAC-SHA256 (hex) of the ID document; set once. Not the document number.
    identity_key: Mapped[str | None] = mapped_column(CHAR(64))
    #: ADR-041: why a person must look at this case (internal; never shown to the user).
    review_reason: Mapped[str | None] = mapped_column(String(32))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class KycWebhookEvent(Base):
    __tablename__ = "kyc_webhook_events"
    __table_args__ = (
        CheckConstraint(
            "verdict IN ('APPLIED', 'IGNORED_STALE', 'IGNORED_UNKNOWN_SESSION', "
            "'IGNORED_WRONG_USER', 'IGNORED_UNKNOWN_STATUS')",
            name="verdict_allowed",
        ),
        Index("uq_kyc_webhook_events_event", "provider", "event_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    provider_session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_status: Mapped[str] = mapped_column(String(32), nullable=False)
    verdict: Mapped[str] = mapped_column(String(32), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
