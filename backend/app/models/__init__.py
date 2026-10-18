"""Persistence models.

Importing this package registers every approved model on `app.db.base.Base.metadata`.
That is what makes them visible to Alembic: `migrations/env.py` compares against
`Base.metadata`, so a model not imported here is a model autogenerate cannot see, and a
schema it would silently propose dropping.

Registration is the *only* side effect. Importing this package opens no connection,
issues no DDL and writes no row.

MILESTONE 4.1B: `CurrencyDefinition`. MILESTONE AUTH-1 (ADR-025): the identity tables
`User`, `AuthSession`, `AuthRefreshToken`, `PhoneVerification`; MILESTONE AUTH-2 (ADR-026):
`MfaFactor`, `MfaChallenge`, `RecoveryCode`, `TrustedDevice`, `StepUpGrant` -- none carries
money. MILESTONE 4.1C (ADR-029): `Offer`, `IdempotencyRecord` -- records with amounts, not money.
Match, Transaction, Settlement, SettlementLeg, PayoutExecution, KycCase,
BeneficiaryAccount and IdempotencyRecord belong to 4.1C-4.1H and must not be added here
ahead of their approved batch.

Layering rule: api -> services -> domain + repositories + providers.
"""

from app.models.currency_definition import CurrencyDefinition
from app.models.identity import (
    AuthRefreshToken,
    AuthSession,
    MfaChallenge,
    MfaFactor,
    PhoneVerification,
    RecoveryCode,
    StepUpGrant,
    TrustedDevice,
    User,
)
from app.models.marketplace import IdempotencyRecord, Offer

__all__ = [
    "AuthRefreshToken",
    "AuthSession",
    "CurrencyDefinition",
    "IdempotencyRecord",
    "Offer",
    "MfaChallenge",
    "MfaFactor",
    "PhoneVerification",
    "RecoveryCode",
    "StepUpGrant",
    "TrustedDevice",
    "User",
]
