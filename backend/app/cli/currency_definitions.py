"""Add the launch currency definitions if they are missing (ADR-029).

    cd backend && uv run python -m app.cli.currency_definitions

**Insert-only.** Rows in `currency_definitions` are permanent (CD3): this command never
updates or deletes, and a row that already exists is left exactly as it is. If an existing
row disagrees with the expected scale, the command stops with an error instead of "fixing" it
-- a different interpretation needs a new `currency_def_version`, decided by a human.

Which currencies exist is policy (ADR-020/029); the list lives in `app.domain.offer_rules`.
Running this against a shared or production database is a data change and needs approval.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import get_settings
from app.db.session import build_engine
from app.domain.offer_rules import CURRENCY_DEF_VERSION, SCALE

__all__ = ["ensure_currency_definitions"]


async def ensure_currency_definitions(conn: AsyncConnection) -> list[str]:
    """Insert missing rows; return the currencies added. Raises on a conflicting row."""
    added: list[str] = []
    for currency, scale in sorted(SCALE.items()):
        existing = await conn.scalar(
            text(
                "SELECT scale FROM currency_definitions "
                "WHERE currency = :c AND currency_def_version = :v"
            ),
            {"c": currency, "v": CURRENCY_DEF_VERSION},
        )
        if existing is None:
            await conn.execute(
                text(
                    "INSERT INTO currency_definitions (currency, currency_def_version, scale) "
                    "VALUES (:c, :v, :s)"
                ),
                {"c": currency, "v": CURRENCY_DEF_VERSION, "s": scale},
            )
            added.append(currency)
        elif existing != scale:
            raise RuntimeError(
                f"{currency} {CURRENCY_DEF_VERSION} exists with scale {existing}, expected "
                f"{scale}. Definitions are permanent (CD3): a human must decide on a new version."
            )
    return added


async def _main() -> None:
    engine = build_engine(get_settings())
    try:
        async with engine.begin() as conn:
            added = await ensure_currency_definitions(conn)
    finally:
        await engine.dispose()
    print("added:", ", ".join(added) if added else "nothing (all present)")


if __name__ == "__main__":
    asyncio.run(_main())
