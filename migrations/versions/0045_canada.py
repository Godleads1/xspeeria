"""Canada joins the MVP corridors — ADR-100 (owner 2026-11-09).

Identity checks may now be for Canada: ``ck_kyc_cases_country_allowed`` adds ``'CA'``. CAD
needs no schema change (currency columns accept any ISO code); its ``currency_definitions``
row is added by ``app.cli.currency_definitions`` from ``offer_rules.SCALE`` (insert-only, CD3).

Downgrade puts the three-country rule back. It fails, on purpose, while a Canadian identity
check exists: those records are kept for 5 years and are never silently removed.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0045"
down_revision: str | None = "0044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(
        op.f("ck_kyc_cases_country_allowed"), "kyc_cases", "country IN ('NG', 'GB', 'US', 'CA')"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(
        op.f("ck_kyc_cases_country_allowed"), "kyc_cases", "country IN ('NG', 'GB', 'US')"
    )
