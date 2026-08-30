"""Persistence models.

Importing this package registers every approved model on `app.db.base.Base.metadata`.
That is what makes them visible to Alembic: `migrations/env.py` compares against
`Base.metadata`, so a model not imported here is a model autogenerate cannot see, and a
schema it would silently propose dropping.

Registration is the *only* side effect. Importing this package opens no connection,
issues no DDL and writes no row.

MILESTONE 4.1B: `CurrencyDefinition` only. Offer, Match, Transaction, Settlement,
SettlementLeg, PayoutExecution, KycCase, BeneficiaryAccount and IdempotencyRecord belong
to 4.1C-4.1H and must not be added here ahead of their approved batch.

Layering rule: api -> services -> domain + repositories + providers.
"""

from app.models.currency_definition import CurrencyDefinition

__all__ = ["CurrencyDefinition"]
