"""Germany, France and China join the corridors — ADR-105 (owner 2026-11-10).

Identity checks may now be for Germany, France and China: ``ck_kyc_cases_country_allowed``
adds ``'DE'``, ``'FR'`` and ``'CN'``. CNY needs no schema change (currency columns accept any
ISO code); its ``currency_definitions`` row is added by ``app.cli.currency_definitions`` from
``offer_rules.SCALE`` (insert-only, CD3). China stays switched off (``CHINA_ENABLED``).

Downgrade puts the four-country rule back. It fails, on purpose, while an identity check for
one of the new countries exists: those records are kept and never silently removed.

Revision ID: 0049
Revises: 0048
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0049"
down_revision: str | None = "0048"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(
        op.f("ck_kyc_cases_country_allowed"),
        "kyc_cases",
        "country IN ('NG', 'GB', 'US', 'CA', 'DE', 'FR', 'CN')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(
        op.f("ck_kyc_cases_country_allowed"), "kyc_cases", "country IN ('NG', 'GB', 'US', 'CA')"
    )
