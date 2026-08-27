"""The versioned minor-unit definition for a currency.

DECISION S4-1 binds every authoritative persisted monetary amount to a
`currency_def_version`. This table is what that version points at: the interpretation
under which an amount's `scale` is meaningful. Without it, a stored `amount_minor` of
`1000` is ambiguous the moment a currency's minor-unit rule changes.

**Rows are immutable historical definitions.** A changed interpretation creates a *new*
`(currency, currency_def_version)` row; it never edits an existing one, because amounts
already persisted against the old version must keep meaning what they meant when they were
written. There is deliberately no `updated_at`, no `is_active` and no soft delete: each
would imply a row can be revised or retired in place, which is exactly what must not
happen.

**This table does not establish which currencies Xspeeria supports.** It defines how a
currency code is *interpreted* if it appears. Supported currencies, corridors, regulatory
availability, rates, providers and liquidity are policy held elsewhere and must never be
added here -- a column for any of them would turn an interpretation record into a pricing
or eligibility authority.

`currency_def_version` is **opaque and application-issued**, at most 32 characters. No
format is prescribed: `v1`, `iso4217-2024a` and `2024-01-01` are all structurally valid.
Only emptiness is refused.

DECISION 4.1B-CD1 / CD2 / CD3, HUMAN-APPROVED 2026-08-27.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    CHAR,
    CheckConstraint,
    DateTime,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.money import (
    CURRENCY_CODE_REGEX,
    CURRENCY_DEF_VERSION_LENGTH,
    MAX_SCALE,
    MIN_SCALE,
)

__all__ = ["CurrencyDefinition"]


class CurrencyDefinition(Base):
    """One `(currency, currency_def_version)` interpretation, with its minor-unit scale."""

    __tablename__ = "currency_definitions"

    #: Part of the composite primary key. Versioning is **per currency**, so `USD` and
    #: `EUR` may each carry a `v1` without collision.
    currency: Mapped[str] = mapped_column(CHAR(3), primary_key=True)

    #: Part of the composite primary key. Opaque, application-issued, max 32 chars.
    currency_def_version: Mapped[str] = mapped_column(
        String(CURRENCY_DEF_VERSION_LENGTH), primary_key=True
    )

    #: The minor-unit exponent this definition assigns to `currency`.
    scale: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    #: Provenance metadata only -- **not** a mutation timestamp. Set by the database so the
    #: value is the server's clock rather than an application host's, and so no caller can
    #: choose it.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        # The bounds and the regex are imported from `app.db.money` rather than restated,
        # so a row this table accepts can always interpret an amount that the money
        # columns accept. They are *shared constants*, not a shared constraint set: this
        # is not a money binding, and coupling the two constraint helpers would let a
        # change to one silently alter the other.
        CheckConstraint(f"currency ~ '{CURRENCY_CODE_REGEX}'", name="currency_format"),
        CheckConstraint(f"scale BETWEEN {MIN_SCALE} AND {MAX_SCALE}", name="scale_range"),
        CheckConstraint("currency_def_version <> ''", name="def_version_not_empty"),
        # DECISION 4.1B-CD2. Redundant as a uniqueness statement -- the primary key already
        # implies it -- but PostgreSQL requires a UNIQUE constraint over exactly the
        # referenced columns before a three-column foreign key can target them. It exists
        # so a future money-bearing table can bind (currency, currency_def_version, scale)
        # and let the database make a scale that disagrees with its own definition
        # unrepresentable, rather than relying on every call site to check.
        # Deliberately unnamed. The `uq` convention in `app.db.base` is
        # `uq_%(table_name)s_%(column_0_N_name)s` -- it has no `%(constraint_name)s`
        # token, so passing an explicit `name=` would BYPASS the convention and create a
        # bare identifier with no table prefix. Letting the convention render it yields
        # `uq_currency_definitions_currency_currency_def_version_scale` (59 bytes, inside
        # PostgreSQL's limit). CHECK constraints are the opposite case: their convention
        # does interpolate `%(constraint_name)s`, so the short names above are required.
        UniqueConstraint("currency", "currency_def_version", "scale"),
    )

    # GATE 4.1B-CD3 -- database-level immutability enforcement is NOT implemented here.
    # Nothing references this table yet, so there is nothing to protect; the mechanism
    # (trigger, role-level REVOKE, or repository-layer refusal under the 4.1I UnitOfWork)
    # is deliberately unchosen and requires explicit human approval before the first
    # authoritative money-bearing foreign key is introduced. Until then immutability is a
    # documented contract, not an enforced constraint.

    def __repr__(self) -> str:
        return (
            f"CurrencyDefinition(currency={self.currency!r}, "
            f"currency_def_version={self.currency_def_version!r}, scale={self.scale!r})"
        )
