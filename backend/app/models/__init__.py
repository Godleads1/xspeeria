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
money. MILESTONE 4.1C (ADR-029): `Offer`, `IdempotencyRecord`; MILESTONE 4.1D (ADR-031):
`Match`; MILESTONE 4.1E (ADR-035): `Beneficiary`, `MatchPayoutSelection` -- records with
amounts, not money. MILESTONE 4.1F (ADR-037, simulation only): the escrow settlement records
-- workflow decisions and partner-confirmed facts, never balances. KycCase belongs to a later
milestone and must not be added here ahead of its approved batch.
MILESTONE KYC-1 (ADR-039): `KycCase` (data dictionary KYCCases) and `KycWebhookEvent` --
identity-check outcomes only; ID images stay with the provider.

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
from app.models.kyc import KycCase, KycWebhookEvent
from app.models.marketplace import IdempotencyRecord, Match, Offer
from app.models.payouts import Beneficiary, MatchPayoutSelection
from app.models.settlement import (
    OutboxMessage,
    Partner,
    PayoutExecution,
    PendingEvent,
    ReconciliationException,
    Settlement,
    SettlementEvent,
    SettlementHold,
    SettlementLeg,
    Transaction,
    WebhookReceipt,
)

__all__ = [
    "KycCase",
    "KycWebhookEvent",
    "OutboxMessage",
    "Partner",
    "PayoutExecution",
    "PendingEvent",
    "ReconciliationException",
    "Settlement",
    "SettlementEvent",
    "SettlementHold",
    "SettlementLeg",
    "Transaction",
    "WebhookReceipt",
    "AuthRefreshToken",
    "AuthSession",
    "Beneficiary",
    "CurrencyDefinition",
    "IdempotencyRecord",
    "Match",
    "MatchPayoutSelection",
    "Offer",
    "MfaChallenge",
    "MfaFactor",
    "PhoneVerification",
    "RecoveryCode",
    "StepUpGrant",
    "TrustedDevice",
    "User",
]
