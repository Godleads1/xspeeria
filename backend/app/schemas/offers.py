"""Request and response bodies for offers (Milestone 4.1C, ADR-029).

Amounts and rates travel as decimal **strings**, never JSON numbers, so no client or
parser turns them into binary floating point. Request models forbid unknown fields: a
client cannot send ``user_id``, ``status``, ``matched_amount`` or ``version`` and have it
taken.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "AcceptRequest",
    "AddPayoutAccountRequest",
    "ChoosePayoutAccountsRequest",
    "PayoutAccountResponse",
    "PayoutChoiceIn",
    "CreateOfferRequest",
    "ListingsResponse",
    "MatchResponse",
    "OfferResponse",
    "UpdateRateRequest",
]

_CURRENCY = r"^[A-Za-z]{3}$"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class CreateOfferRequest(_Strict):
    source_currency: str = Field(pattern=_CURRENCY)
    target_currency: str = Field(pattern=_CURRENCY)
    #: Decimal text in the source currency, e.g. "250000.00".
    source_amount: str = Field(min_length=1, max_length=24)
    #: NGN per 1 unit of the foreign currency, e.g. "1320.50".
    desired_rate: str = Field(min_length=1, max_length=24)


class UpdateRateRequest(_Strict):
    """ADR-059 Decision 3: change the rate, the amount, or both (at least one)."""

    desired_rate: str | None = Field(default=None, min_length=1, max_length=24)
    #: Exact decimal text in the offer's own (source) currency.
    source_amount: str | None = Field(default=None, min_length=1, max_length=24)


class OfferResponse(BaseModel):
    offer_id: str
    source_currency: str
    target_currency: str
    source_amount: str
    matched_amount: str
    remaining_amount: str
    desired_rate: str
    status: str
    is_own: bool
    version: int
    created_at: str
    #: ADR-059 Decision 4 (listings only): held by unpaid deals or by someone's turn; queue.
    waiting: bool = False
    #: What may come back to take (decimal text, offer currency), when waiting.
    waiting_amount: str | None = None
    queue_length: int = 0
    in_queue: bool = False
    your_turn: bool = False


class CompletedTradeResponse(BaseModel):
    """A recent completed trade (ADR-059 "Success"): no ids, no names, nothing to take."""

    #: The pair's foreign currency; ``amount`` is in it.
    currency: str
    amount: str
    #: NGN per 1 unit of ``currency``, as agreed.
    rate: str
    completed_at: str


class ListingsResponse(BaseModel):
    #: "available" (offers in ``items``) or "success" (completed trades in ``trades``).
    status: str = "available"
    #: ADR-059 Decision 2: the country used for the location rule (null when unknown).
    viewer_country: str | None = None
    #: True when this pair sells the viewer's own currency, so nothing is shown.
    hidden: bool = False
    #: True when no country is known (location off and no approved check): nothing is shown.
    needs_location: bool = False
    items: list[OfferResponse]
    trades: list[CompletedTradeResponse] = []
    limit: int
    offset: int
    #: Where the next page starts, or null when there is no more.
    next_offset: int | None


class AcceptRequest(_Strict):
    #: Exact decimal text in the offer's currency. Required: a missing value answers
    #: VAL_422_MISSING_FIELD and never means "take everything" (contract §3.5).
    accepted_amount: str | None = Field(default=None, min_length=1, max_length=24)


class MatchResponse(BaseModel):
    match_id: str
    offer_id: str
    currency: str
    counter_currency: str
    allocated_amount: str
    agreed_rate: str
    accepted_at: str
    server_order_key: str
    your_role: str
    you_receive_currency: str
    you_receive_amount: str
    preparation_state: str
    preparation_deadline: str | None
    you_chose_payout_accounts: bool
    other_side_chose_payout_accounts: bool
    #: ADR-045: the amount in the counter currency (absent on answers recorded before it).
    counter_amount: str | None = None
    #: ADR-045: the escrow phase on "my matches" (None before the escrow opens).
    settlement_phase: str | None = None


class PayoutChoiceIn(_Strict):
    payout_account_id: uuid.UUID
    #: Exact decimal text in the currency you receive.
    amount: str = Field(min_length=1, max_length=24)


class ChoosePayoutAccountsRequest(_Strict):
    accounts: list[PayoutChoiceIn] = Field(min_length=1, max_length=10)


class AddPayoutAccountRequest(_Strict):
    currency: str = Field(pattern=r"^[A-Za-z]{3}$")
    bank_name: str = Field(min_length=1, max_length=60)
    #: Never logged, never returned; only the last 4 digits are kept readable.
    account_number: str = Field(min_length=1, max_length=17, repr=False)
    routing_number: str | None = Field(default=None, max_length=9)
    sort_code: str | None = Field(default=None, max_length=6)
    account_type: str | None = Field(default=None, max_length=16)


class PayoutAccountResponse(BaseModel):
    payout_account_id: str
    currency: str
    bank_name: str
    account_last4: str
    account_type: str | None
    account_name: str | None
    validation_state: str
    payout_hold_until: str
    created_at: str


class QueueEntryResponse(BaseModel):
    """ADR-059 Decision 4: my place in an offer's waiting queue."""

    offer_id: str
    #: "waiting", or "notified" when it is my turn (5 minutes to take it).
    status: str
    position: int
    queue_length: int
    turn_deadline: str | None
