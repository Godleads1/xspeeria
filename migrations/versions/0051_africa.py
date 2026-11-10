"""Eleven African countries join the corridors — ADR-107 (owner 2026-11-10).

Identity checks may now be for Egypt, South Africa, Morocco, Ethiopia, Kenya, Senegal, Ghana,
Zimbabwe, Uganda, Zambia and Tanzania: ``ck_kyc_cases_country_allowed`` adds their codes. The
currencies need no schema change (currency columns accept any ISO code); their
``currency_definitions`` rows come from ``app.cli.currency_definitions`` (insert-only, CD3).

Downgrade puts the seven-country rule back. It fails, on purpose, while an identity check for
one of the new countries exists: those records are kept and never silently removed.

Revision ID: 0051
Revises: 0050
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0051"
down_revision: str | None = "0050"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW = (
    "country IN ('NG', 'GB', 'US', 'CA', 'DE', 'FR', 'CN', 'EG', 'ZA', 'MA', 'ET', 'KE', "
    "'SN', 'GH', 'ZW', 'UG', 'ZM', 'TZ')"
)
_OLD = "country IN ('NG', 'GB', 'US', 'CA', 'DE', 'FR', 'CN')"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", _NEW)


def downgrade() -> None:
    op.drop_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", _OLD)
