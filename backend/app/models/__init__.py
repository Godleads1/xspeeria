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
ADR-057: `Dispute`, `DisputeMessage` -- cases and messages; a dispute pauses escrow only
through a `settlement_holds` row, never by changing money state.
ADR-060: the admin console staff tables -- accounts, roles, codes, sessions and an
append-only audit log; separate from customers, no money.

Layering rule: api -> services -> domain + repositories + providers.
"""

from app.models.activity import CustomerActivity
from app.models.adverts import Advert
from app.models.currency_definition import CurrencyDefinition
from app.models.currency_switch import CurrencySwitch
from app.models.deal_pauses import DealPause
from app.models.disputes import Dispute, DisputeCategory, DisputeMessage
from app.models.fraud import FraudAlert
from app.models.help import HelpMessage, HelpRequest
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
    VerificationCheck,
)
from app.models.kyc import KycCase, KycWebhookEvent
from app.models.kyc_reviews import KycReview
from app.models.marketplace import IdempotencyRecord, Match, Offer
from app.models.monitoring import ApiMetric, JobStatus
from app.models.notifications import Notification, PushDelivery, PushToken
from app.models.official_rates import OfficialRate
from app.models.ops_alerts import OpsAlert
from app.models.outages import ServiceOutage
from app.models.payouts import Beneficiary, MatchPayoutSelection
from app.models.rate_limits import RateLimitHit
from app.models.reversals import Reversal
from app.models.security_notices import SecurityNotice
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
from app.models.staff import (
    StaffAccount,
    StaffAuditEntry,
    StaffCode,
    StaffKeyChallenge,
    StaffRole,
    StaffSecurityKey,
    StaffSession,
)
from app.models.tiers import TierCheck

__all__ = [
    "Advert",
    "DealPause",
    "OfficialRate",
    "FraudAlert",
    "HelpMessage",
    "HelpRequest",
    "KycCase",
    "KycReview",
    "ApiMetric",
    "CustomerActivity",
    "JobStatus",
    "KycWebhookEvent",
    "Notification",
    "OpsAlert",
    "PushDelivery",
    "PushToken",
    "RateLimitHit",
    "Reversal",
    "SecurityNotice",
    "ServiceOutage",
    "Dispute",
    "DisputeCategory",
    "DisputeMessage",
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
    "CurrencySwitch",
    "IdempotencyRecord",
    "Match",
    "MatchPayoutSelection",
    "Offer",
    "MfaChallenge",
    "MfaFactor",
    "PhoneVerification",
    "RecoveryCode",
    "StaffAccount",
    "StaffAuditEntry",
    "StaffCode",
    "StaffRole",
    "StaffSession",
    "StaffKeyChallenge",
    "StaffSecurityKey",
    "StepUpGrant",
    "TierCheck",
    "TrustedDevice",
    "User",
    "VerificationCheck",
]
