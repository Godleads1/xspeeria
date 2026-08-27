"""baseline -- establish the migration chain, create nothing

Revision ID: 0001_baseline
Revises:
Create Date: 2026-08-25

MILESTONE 4.1A. This migration is **intentionally empty**, and that is the whole point of
it: it fixes the head of the chain and gives every later migration a `down_revision` to
attach to, without encoding a single future entity.

No table is created here. Offer, Match, Transaction, Settlement, SettlementLeg,
PayoutExecution, KycCase, BeneficiaryAccount and IdempotencyRecord are 4.1B-4.1H, each
behind its own reviewed migration and its own approved schema. Pre-creating any of them
now -- even "just the easy ones" -- would commit column types (above all monetary ones)
ahead of the batch that is supposed to justify them.

`upgrade()` and `downgrade()` are both no-ops, so the round-trip
`base -> head -> base -> head` is exactly reversible and destroys nothing.
"""

from __future__ import annotations

from collections.abc import Sequence

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """No schema change. Establishes the chain head only."""


def downgrade() -> None:
    """No schema change to reverse."""
