"""Response bodies for the escrow steps (Milestone 4.1F, ADR-037). Amounts are decimal strings."""

from __future__ import annotations

from pydantic import BaseModel

__all__ = ["PayIn", "SettlementResponse", "YouPay", "YouReceive"]


class PayIn(BaseModel):
    bank_name: str
    account_name: str
    account_number: str
    reference: str


class YouPay(BaseModel):
    leg_id: str
    currency: str
    amount: str
    fee: str
    total: str
    state: str
    pay_in: PayIn | None


class YouReceive(BaseModel):
    currency: str
    amount: str
    state: str


class SettlementResponse(BaseModel):
    settlement_id: str
    #: ADR-057: the deal's transaction, which a dispute is opened against.
    transaction_id: str
    phase: str
    closure_reason: str | None
    simulated: bool
    funding_deadline: str | None
    #: ADR-059 Decision 4: the taker's one extra 5 minutes has been used.
    funding_extended: bool = False
    #: True for the taker while the window is open and the extra time is unused.
    can_extend: bool = False
    on_hold: bool
    you_pay: YouPay
    you_receive: YouReceive
