"""The rate ceilings in force — ADR-102.

``GET /api/v1/rates/official``: for each foreign currency, the highest rate (naira per 1 unit)
an offer may have right now, so the app can show it and check a rate before sending. The
server checks every rate again when an offer is made or taken; this answer is for display.
Signed-in customers only; nothing about any account is read.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session, limit_by_account
from app.domain.offer_rules import CAD_PER_USD
from app.services.auth import AuthRuntime
from app.services.official_rates import current_ceilings

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/rates", tags=["rates"], dependencies=[Depends(limit_by_account)])

#: Worked out from another ceiling, not published by the CBN (ADR-101).
DERIVED = frozenset({"CAD"})


class Ceiling(BaseModel):
    currency: str
    #: Decimal text, naira per 1 unit.
    max_rate: str
    derived: bool


class Ceilings(BaseModel):
    items: list[Ceiling]
    #: CAD per 1 USD used for the derived CAD ceiling (Bank of Canada, ADR-101).
    cad_per_usd: str


def _exact(v: Decimal) -> str:
    """The exact figure, at least 2 decimal places, never rounded (a ceiling must not grow)."""
    return f"{v:.2f}" if v == v.quantize(Decimal("0.01")) else format(v.normalize(), "f")


@router.get("/official", response_model=Ceilings, summary="Highest rate per currency now")
async def official(
    _: CurrentPrincipal,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Ceilings:
    ceilings = await current_ceilings(db, runtime.clock())
    return Ceilings(
        items=[
            Ceiling(currency=c, max_rate=_exact(v), derived=c in DERIVED)
            for c, v in sorted(ceilings.items())
        ],
        cad_per_usd=str(CAD_PER_USD),
    )
