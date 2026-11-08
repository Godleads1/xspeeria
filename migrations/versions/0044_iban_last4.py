"""EUR payout accounts by IBAN — ADR-099 (owner 2026-11-08: "Iban").

An IBAN can end in letters, so the readable last four characters of a payout account may now
be digits or capital letters (``ck_beneficiaries_last4_digits`` → ``..._last4_format``).
Nothing else changes; the full account number stays sealed (ADR-022).

Downgrade puts the digits-only rule back. It fails, on purpose, while any saved account ends
in a letter: those accounts must be removed by a person first, never silently changed.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0044"
down_revision: str | None = "0043"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_beneficiaries_last4_digits"), "beneficiaries", type_="check")
    op.create_check_constraint(
        op.f("ck_beneficiaries_last4_format"), "beneficiaries", "account_last4 ~ '^[0-9A-Z]{4}$'"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_beneficiaries_last4_format"), "beneficiaries", type_="check")
    op.create_check_constraint(
        op.f("ck_beneficiaries_last4_digits"), "beneficiaries", "account_last4 ~ '^[0-9]{4}$'"
    )
