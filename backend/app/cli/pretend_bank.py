"""Add the pretend partner banks if they are missing (ADR-037). **Developer computers only.**

    cd backend && APP_ENV=local uv run python -m app.cli.pretend_bank

Insert-only, and refused unless ``APP_ENV=local``: the rows are marked ``is_simulated`` and
the server only opens escrows with simulated partners while ``PRETEND_BANK=true``. A real
partner is never added this way — it needs legal and compliance sign-off (ADR-001 §12).
"""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import get_settings
from app.db.session import build_engine
from app.domain.settlement_rules import JURISDICTION
from app.providers.pretend_bank import PRETEND_PARTNERS

__all__ = ["ensure_pretend_partners"]


async def ensure_pretend_partners(conn: AsyncConnection) -> list[str]:
    """Insert missing pretend partners; return the codes added."""
    added: list[str] = []
    for currency, (code, name) in sorted(PRETEND_PARTNERS.items()):
        exists = await conn.scalar(text("SELECT 1 FROM partners WHERE code = :c"), {"c": code})
        if exists is None:
            await conn.execute(
                text(
                    "INSERT INTO partners (id, code, name, jurisdiction, currency, is_simulated, "
                    "created_at) VALUES (:id, :code, :name, :j, :cur, true, now())"
                ),
                {
                    "id": uuid.uuid4(),
                    "code": code,
                    "name": name,
                    "j": JURISDICTION[currency],
                    "cur": currency,
                },
            )
            added.append(code)
    return added


async def _main() -> None:
    settings = get_settings()
    if settings.app_env != "local":
        raise SystemExit("Pretend partners are for APP_ENV=local only (ADR-037).")
    engine = build_engine(settings)
    try:
        async with engine.begin() as conn:
            added = await ensure_pretend_partners(conn)
    finally:
        await engine.dispose()
    print("added:", ", ".join(added) if added else "nothing (all present)")


if __name__ == "__main__":
    asyncio.run(_main())
