"""Delete every account and everything made with them. **Developer computers only.**

    cd backend
    uv run python -m app.cli.reset_local_data --yes-delete-everything

For testing sign-up again with the same phone number and email. Refused unless
``APP_ENV=local`` and the flag is given. Keeps the currency definitions and the pretend
partner banks; deletes users, sessions, checks, identity checks, offers, deals, payout
accounts, escrow simulation records and notifications. Never use it on shared data.
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import get_settings
from app.db.session import build_engine

__all__ = ["USER_TABLES", "reset_user_data"]

#: Everything that belongs to accounts, children before parents. Not `currency_definitions`
#: (append-only reference data), `partners` (the pretend banks), staff tables, or
#: `dispute_categories` (the list staff manage, ADR-063).
USER_TABLES = (
    "customer_activity",
    "tier_checks",
    "offer_queue_entries",
    "fraud_alerts",
    "kyc_reviews",
    "reversals",
    "dispute_messages",
    "disputes",
    "verification_checks",
    "push_deliveries",
    "push_tokens",
    "notifications",
    "kyc_webhook_events",
    "kyc_cases",
    "outbox_messages",
    "reconciliation_exceptions",
    "settlement_holds",
    "pending_events",
    "settlement_events",
    "webhook_receipts",
    "payout_executions",
    "settlement_legs",
    "settlements",
    "transactions",
    "match_payout_selections",
    "beneficiaries",
    "matches",
    "idempotency_records",
    "offers",
    "offer_groups",
    "step_up_grants",
    "trusted_devices",
    "recovery_codes",
    "mfa_challenges",
    "mfa_factors",
    "auth_refresh_tokens",
    "auth_sessions",
    "phone_verifications",
    "users",
)


async def reset_user_data(conn: AsyncConnection) -> int:
    """Empty the account tables in one statement; returns how many accounts there were."""
    users = int(await conn.scalar(text("SELECT count(*) FROM users")) or 0)
    await conn.execute(text(f"TRUNCATE {', '.join(USER_TABLES)}"))  # fixed table names only
    return users


async def _main(confirmed: bool) -> None:
    settings = get_settings()
    if settings.app_env != "local":
        raise SystemExit("This deletes data and is for APP_ENV=local only.")
    if not confirmed:
        raise SystemExit("Nothing deleted. Add --yes-delete-everything to really delete.")
    engine = build_engine(settings)
    try:
        async with engine.begin() as conn:
            users = await reset_user_data(conn)
    finally:
        await engine.dispose()
    print(f"deleted {users} account(s) and everything made with them")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--yes-delete-everything", action="store_true")
    asyncio.run(_main(parser.parse_args().yes_delete_everything))
