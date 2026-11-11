"""The rate ceilings in force — ADR-102.

``GET /api/v1/rates/official``: for each foreign currency, the highest rate (naira per 1 unit)
an offer may have right now, so the app can show it and check a rate before sending. The
server checks every rate again when an offer is made or taken; this answer is for display.
Signed-in customers only; nothing about any account is read.

ADR-111: ``pairs`` lists the limits of pairs without naira (e.g. cedis per US dollar),
worked out from the official naira rates.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import CurrentPrincipal, get_auth_runtime, get_db_session, limit_by_account
from app.api.deps import get_app_settings
from app.core.config import Settings
from app.domain.offer_rules import AFRICAN, CAD_PER_USD, CNY_PER_USD
from app.services.auth import AuthRuntime
from app.services.official_rates import current_ceilings

__all__ = ["router"]

router = APIRouter(prefix="/api/v1/rates", tags=["rates"], dependencies=[Depends(limit_by_account)])

#: Worked out from another ceiling, not published by the CBN (ADR-101).
DERIVED = frozenset({"CAD", "CNY"}) | AFRICAN  # ADR-101, ADR-105, ADR-107


class Ceiling(BaseModel):
    currency: str
    #: Decimal text, naira per 1 unit.
    max_rate: str
    derived: bool


class PairCeiling(BaseModel):
    #: The rate is ``quote`` per 1 ``base`` (ADR-111), e.g. GHS per 1 USD.
    base: str
    quote: str
    max_rate: str


class Ceilings(BaseModel):
    items: list[Ceiling]
    #: ADR-111: pairs without naira, worked out from the naira rates (cut down to 3 decimals).
    pairs: list[PairCeiling] = []
    #: CAD per 1 USD used for the derived CAD ceiling (Bank of Canada, ADR-101).
    cad_per_usd: str
    #: CNY per 1 USD for the derived CNY ceiling (PBOC central parity, ADR-105); None while
    #: China is switched off.
    cny_per_usd: str | None = None


def _exact(v: Decimal) -> str:
    """The exact figure, at least 2 decimal places, never rounded (a ceiling must not grow)."""
    return f"{v:.2f}" if v == v.quantize(Decimal("0.01")) else format(v.normalize(), "f")


@router.get("/official", response_model=Ceilings, summary="Highest rate per currency now")
async def official(
    _: CurrentPrincipal,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Ceilings:
    ceilings = await current_ceilings(db, runtime.clock())
    china = settings.china_enabled
    return Ceilings(
        items=[
            Ceiling(currency=c, max_rate=_exact(v), derived=c in DERIVED)
            for c, v in sorted(ceilings.items())
            # ADR-105: the app shows China only when the server offers the yuan.
            if "/" not in c and (china or c != "CNY")
        ],
        pairs=[
            PairCeiling(base=k.split("/")[0], quote=k.split("/")[1], max_rate=_exact(v))
            for k, v in sorted(ceilings.items())
            if "/" in k and (china or "CNY" not in k.split("/"))
        ],
        cad_per_usd=str(CAD_PER_USD),
        cny_per_usd=str(CNY_PER_USD) if china else None,
    )
