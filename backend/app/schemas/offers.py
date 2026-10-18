"""Request and response bodies for offers (Milestone 4.1C, ADR-029).

Amounts and rates travel as decimal **strings**, never JSON numbers, so no client or
parser turns them into binary floating point. Request models forbid unknown fields: a
client cannot send ``user_id``, ``status``, ``matched_amount`` or ``version`` and have it
taken.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "AcceptRequest",
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
    desired_rate: str = Field(min_length=1, max_length=24)


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


class ListingsResponse(BaseModel):
    items: list[OfferResponse]
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
