"""The local-only reset (sign up again with the same phone and email). Against PostgreSQL."""

from __future__ import annotations

import pytest

from app.cli.reset_local_data import USER_TABLES, _main, reset_user_data
from app.core.config import Settings
from app.db.base import Base
from app.db.session import build_engine
from tests.integration.test_auth_api import PHONE, Env, _sql, clean, env, migrated  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


def test_every_account_table_is_listed() -> None:
    import app.models  # noqa: F401

    # Staff accounts are not customer data: a local reset keeps the admin console log-ins, and
    # the dispute category list staff manage (ADR-063), the outage history (ADR-066) and adverts
    # (ADR-067).
    kept = {
        "currency_definitions",
        "partners",
        "dispute_categories",
        "service_outages",
        "adverts",
    } | {t for t in Base.metadata.tables if t.startswith("staff_")}
    assert set(USER_TABLES) == set(Base.metadata.tables) - kept


async def test_deletes_accounts_and_keeps_reference_data(env: Env, db_settings: Settings) -> None:  # noqa: F811
    await env.sign_up()
    currencies = await _sql(db_settings, "SELECT count(*) FROM currency_definitions")
    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn:
            assert await reset_user_data(conn) == 1
    finally:
        await engine.dispose()
    assert await _sql(db_settings, "SELECT count(*) FROM users") == 0
    assert await _sql(db_settings, "SELECT count(*) FROM currency_definitions") == currencies
    env.clock.advance(minutes=2)
    await env.sign_up()  # the same phone and email work again
    assert await _sql(db_settings, "SELECT phone FROM users") == PHONE


async def test_refused_without_local_and_the_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.cli.reset_local_data as cli

    monkeypatch.setattr(
        cli, "get_settings", lambda: Settings.model_validate({"app_env": "staging"})
    )
    with pytest.raises(SystemExit, match="APP_ENV=local"):
        await _main(True)
    monkeypatch.setattr(cli, "get_settings", lambda: Settings.model_validate({"app_env": "local"}))
    with pytest.raises(SystemExit, match="Nothing deleted"):
        await _main(False)
