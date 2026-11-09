"""Fee quote — ADR-098.

``GET /api/v1/fees/quote`` tells a signed-in customer the coordination fee (1% of what one side
sends, ADR-021) on an amount, so the app can show it **before** they confirm. It reads nothing
about anyone and changes nothing; the fee that counts is worked out again on the server when
the escrow opens (``SettlementService.create_for_match``), from the deal itself.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from app.api.auth_deps import CurrentPrincipal, limit_by_account
from app.core.exceptions import AppError
from app.domain.settlement_rules import coordination_fee_minor
from app.services.offers import money_text

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/fees", tags=["fees"], dependencies=[Depends(limit_by_account)])

_AMOUNT = r"^[0-9]{1,13}(\.[0-9]{1,2})?$"


class FeeQuote(BaseModel):
    currency: str
    amount: str
    #: Decimal text in ``currency``.
    fee: str
    #: Amount + fee: what this side pays into its escrow.
    total: str


@router.get("/quote", response_model=FeeQuote, summary="The fee one side pays on an amount")
async def quote(
    _: CurrentPrincipal,
    currency: Literal["NGN", "USD", "GBP", "EUR", "CAD"],
    amount: str = Query(pattern=_AMOUNT),
) -> FeeQuote:
    whole, _dot, frac = amount.partition(".")
    minor = int(whole) * 100 + int(frac.ljust(2, "0") or "0")
    if minor <= 0:
        raise AppError(
            "VAL_422_INVALID_FIELD",
            "Enter an amount above zero.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            details={"field": "amount"},
        )
    fee = coordination_fee_minor(minor)
    return FeeQuote(
        currency=currency,
        amount=money_text(minor, 2),
        fee=money_text(fee, 2),
        total=money_text(minor + fee, 2),
    )
