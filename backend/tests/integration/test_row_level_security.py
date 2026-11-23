# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Row-level security, the second lock (readiness review H-3, ADR-078), against PostgreSQL.

The first lock is the code: every customer query is filtered to the signed-in user. These
tests switch that lock *off* on purpose -- they run unfiltered queries -- and prove the
database still only hands a customer their own private rows.
"""

from __future__ import annotations

import asyncio
import importlib.util
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import event, func, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import Settings
from app.db.base import Base
from app.db.row_scope import current_scope, scope_to_user, system_scope
from app.db.session import build_engine
from app.models.notifications import Notification
from app.services.notifications import notify
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401
from tests.integration.test_kyc_api import K, _user, k  # noqa: F401
from tests.integration.test_matches_api import TAKER
from tests.integration.test_notifications_api import _inbox, _seed

# The offer test needs the currency rows; another file may have cleared them first.
from tests.integration.test_offers_api import currencies  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

_VERSIONS = Path(__file__).resolve().parents[3] / "migrations" / "versions"
#: Migrations that put tables under the owner-rows policy (each has an ``OWNED_TABLES``).
_POLICY_MIGRATIONS = ("0038_row_level_security.py", "0041_security_notices.py")


def _as_app_role(engine: Any) -> Any:
    """Every connection of ``engine`` runs as the application role (ADR-025 §1.4).

    Superusers and BYPASSRLS roles skip row-level security entirely; CI's database user is a
    superuser. The app must never connect as one, so these tests take the app's role.
    """

    @event.listens_for(engine.sync_engine, "connect")
    def _set_role(dbapi_conn: Any, _record: Any) -> None:
        cursor = dbapi_conn.cursor()
        cursor.execute("SET ROLE xspeeria_app")
        cursor.close()
        # The driver runs that inside a transaction; without this commit the first rollback
        # in a test would undo it and put the connection back on CI's superuser.
        dbapi_conn.commit()

    return engine


def _owned_tables() -> dict[str, str]:
    owned: dict[str, str] = {}
    for name in _POLICY_MIGRATIONS:
        spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), _VERSIONS / name)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        owned.update(module.OWNED_TABLES)
    return owned


#: Tables with a customer column that are deliberately NOT under a row policy, and why.
#: Both sides of a deal (or staff, or the customer's own earlier session) read these, so the
#: code checks (``require_party`` and friends, ADR-025 §2) are what protect them. A new table
#: with a customer column must be added to the policy list or here, with a reason.
SHARED_TABLES = {
    "offers": "every customer browses other customers' offers (the marketplace)",
    "matches": "the offer owner and the taker both read the deal",
    "offer_queue_entries": "the offer owner sees who is waiting in line",
    "settlement_legs": "both parties read both legs of their deal",
    "disputes": "the other party in the deal reads and answers the dispute",
    "dispute_messages": "both parties and staff read the thread",
    "offer_groups": "taking one offer of a group hides the owner's other offers from the taker",
    "match_payout_selections": "each side sees whether the other has chosen a payout account",
    "push_tokens": "a phone's push token moves to whoever signs in on that phone next",
}

_USER_COLUMNS = {
    "user_id",
    "counterparty_user_id",
    "initiator_user_id",
    "author_user_id",
    "funder_user_id",
    "payee_user_id",
}


def test_every_customer_table_is_either_locked_or_explained() -> None:
    owned = _owned_tables()
    for table in Base.metadata.sorted_tables:
        if not _USER_COLUMNS & set(table.c.keys()):
            continue
        assert table.name in owned or table.name in SHARED_TABLES, (
            f"{table.name} holds customer rows: add it to a migration's OWNED_TABLES (a row "
            "policy, listed in _POLICY_MIGRATIONS) "
            "or to SHARED_TABLES here with the reason both sides need it"
        )
        assert not (table.name in owned and table.name in SHARED_TABLES), table.name


async def test_policies_are_on_and_forced(migrated: None, db_settings: Settings) -> None:
    engine = build_engine(db_settings)
    try:
        async with engine.connect() as conn:
            rows = (
                await conn.execute(
                    text(
                        "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, "
                        "(SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid "
                        "AND p.polname LIKE 'xspeeria_owner_rows%') "
                        "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = current_schema() AND c.relkind = 'r'"
                    )
                )
            ).all()
    finally:
        await engine.dispose()
    state = {r[0]: (r[1], r[2], r[3]) for r in rows}
    for table in _owned_tables():
        expected = 4 if table == "notifications" else 1  # notifications: one per command
        assert state[table] == (True, True, expected), table
    # And nothing else was switched on by accident (a policy-less RLS table hides everything).
    others = {t for t, (on, _f, _n) in state.items() if on} - set(_owned_tables())
    assert others == set()


async def _two_customers(k: K, db_settings: Settings) -> tuple[uuid.UUID, uuid.UUID]:
    _ta, a = await _user(k)
    _tb, b = await _user(k, TAKER)
    await _seed(db_settings, a, 2)
    await _seed(db_settings, b, 3)
    return uuid.UUID(a), uuid.UUID(b)


async def test_customer_scope_sees_only_their_rows_even_unfiltered(
    db_settings: Settings, k: K
) -> None:
    a, b = await _two_customers(k, db_settings)
    engine = _as_app_role(build_engine(db_settings))
    try:
        async with AsyncSession(engine) as db:
            # System scope (jobs, staff): everything.
            assert await db.scalar(select(func.count()).select_from(Notification)) == 5
            await scope_to_user(db, a)
            # The code "forgot" its WHERE: the database still filters.
            owners = set((await db.scalars(select(Notification.user_id))).all())
            assert owners == {a}
            # A later transaction in the same request keeps the customer scope.
            await db.commit()
            assert await db.scalar(select(func.count()).select_from(Notification)) == 2
            assert (
                await db.scalar(
                    select(func.count()).select_from(Notification).where(Notification.user_id == b)
                )
                == 0
            )
    finally:
        system_scope()
        await engine.dispose()


async def test_customer_scope_cannot_write_someone_elses_rows(db_settings: Settings, k: K) -> None:
    a, b = await _two_customers(k, db_settings)
    engine = _as_app_role(build_engine(db_settings))
    try:
        async with AsyncSession(engine) as db:
            await scope_to_user(db, a)
            changed = await db.execute(
                update(Notification)
                .where(Notification.user_id == b)
                .values(read_at=datetime(2026, 11, 2, tzinfo=UTC))
            )
            assert changed.rowcount == 0  # type: ignore[attr-defined]  # invisible, so untouched
            await db.commit()
            db.add(
                Notification(
                    id=uuid.uuid4(),
                    user_id=b,
                    type="kyc.in_review",
                    payload={},
                    dedupe_key="planted",
                    created_at=datetime(2026, 11, 2, tzinfo=UTC),
                )
            )
            with pytest.raises(DBAPIError, match="row-level security"):
                await db.flush()
            await db.rollback()
    finally:
        system_scope()
        await engine.dispose()
    unread = await _sql(
        db_settings,
        "SELECT count(*) FROM notifications WHERE user_id = :b AND read_at IS NULL",
        b=b,
    )
    assert unread == 3


async def test_a_customer_may_notify_someone_else_but_not_read_it(
    db_settings: Settings, k: K
) -> None:
    a, b = await _two_customers(k, db_settings)
    engine = _as_app_role(build_engine(db_settings))
    try:
        async with AsyncSession(engine) as db:
            await scope_to_user(db, a)
            # Taking B's offer tells B (ADR-044): allowed...
            await notify(
                db,
                user_id=b,
                event="kyc.in_review",
                dedupe_key="told-b",
                now=datetime(2026, 11, 2, tzinfo=UTC),
                kyc_case_id="x",
                country="NG",
            )
            await db.commit()
            # ...but A still can't see what B was told.
            assert await db.scalar(select(func.count()).select_from(Notification)) == 2
    finally:
        system_scope()
        await engine.dispose()
    assert (
        await _sql(db_settings, "SELECT count(*) FROM notifications WHERE user_id = :b", b=b) == 4
    )


async def test_a_connection_that_never_sets_a_scope_sees_nothing(
    db_settings: Settings, database_url: str, k: K
) -> None:
    await _two_customers(k, db_settings)
    # A bare engine: no app.db.row_scope hook, like psql or a stray script.
    bare = _as_app_role(create_async_engine(database_url))
    try:
        async with bare.connect() as conn:
            # The application role (ADR-025 §1.4), with nothing set: no rows.
            assert (await conn.execute(text("SELECT current_user"))).scalar() == "xspeeria_app"
            assert (await conn.execute(text("SELECT count(*) FROM notifications"))).scalar() == 0
            await conn.execute(text("SELECT set_config('xspeeria.scope', 'system', true)"))
            assert (await conn.execute(text("SELECT count(*) FROM notifications"))).scalar() == 5
            await conn.rollback()
            # Transaction-local: gone after the transaction, so a pooled connection is clean.
            assert (await conn.execute(text("SELECT count(*) FROM notifications"))).scalar() == 0
            await conn.rollback()
    finally:
        await bare.dispose()


async def test_the_table_owner_is_held_too_unless_superuser(
    db_settings: Settings, database_url: str, k: K
) -> None:
    await _two_customers(k, db_settings)
    owner = create_async_engine(database_url)
    try:
        async with owner.connect() as conn:
            superuser = (
                await conn.execute(
                    text(
                        "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user"
                    )
                )
            ).scalar()
            seen = (await conn.execute(text("SELECT count(*) FROM notifications"))).scalar()
            # FORCE ROW LEVEL SECURITY: the owner sees nothing without a scope. Only a superuser
            # or BYPASSRLS role sees everything, which is why the app must never use one.
            assert seen == (5 if superuser else 0)
            await conn.rollback()
    finally:
        await owner.dispose()


async def test_a_bad_user_setting_never_matches(
    db_settings: Settings, database_url: str, k: K
) -> None:
    await _two_customers(k, db_settings)
    bare = _as_app_role(create_async_engine(database_url))
    try:
        async with bare.connect() as conn:
            await conn.execute(text("SELECT set_config('xspeeria.scope', 'user', true)"))
            # Customer scope with no customer: nothing (and no cast error).
            assert (await conn.execute(text("SELECT count(*) FROM notifications"))).scalar() == 0
            await conn.rollback()
            await conn.execute(text("SELECT set_config('xspeeria.scope', 'admin', true)"))
            assert (await conn.execute(text("SELECT count(*) FROM notifications"))).scalar() == 0
            await conn.rollback()
    finally:
        await bare.dispose()


async def test_scope_never_leaks_between_tasks() -> None:
    seen: list[tuple[str, uuid.UUID | None]] = []

    class _Idle:
        def in_transaction(self) -> bool:
            return False

    async def customer() -> None:
        await scope_to_user(_Idle(), uuid.uuid4())  # type: ignore[arg-type]
        await asyncio.sleep(0)
        seen.append(current_scope())

    async def job() -> None:
        await asyncio.sleep(0)
        seen.append(current_scope())

    await asyncio.gather(customer(), job())
    assert sorted(s[0] for s in seen) == ["system", "user"]
    assert current_scope() == ("system", None)  # the caller is untouched


async def test_scope_refuses_anything_but_a_uuid() -> None:
    with pytest.raises(TypeError):
        await scope_to_user(None, "not-a-uuid")  # type: ignore[arg-type]
    assert current_scope() == ("system", None)


async def test_customer_requests_run_in_their_own_scope(db_settings: Settings, k: K) -> None:
    token_a, a = await _user(k)
    _tb, b = await _user(k, TAKER)
    await _seed(db_settings, a, 1)
    await _seed(db_settings, b, 4)
    body = await _inbox(k.env.client, token_a, limit=50)
    assert body["unread_count"] == 1 and len(body["items"]) == 1
    # The request's scope stayed inside the request; the test's own task is still "system".
    assert current_scope() == ("system", None)


#: Every place a customer's request steps up to ``system`` scope, and why. Adding one is a
#: security review: the step must be the service's own work, never a query built from input.
APPROVED_SERVICE_STEPS = {
    ("app/services/matches.py", "open escrow: both parties' payout accounts"),
    ("app/services/settlement.py", "pretend bank: partner messages and commands"),
    # Found by the load test (ADR-085): the offer owner's verification level and usage decide
    # whether the deal is within their limits; the taker is told only "can't be taken".
    ("app/services/limits.py", "deal limits: the other party's tier and usage"),
}


def test_every_step_up_to_system_scope_is_approved() -> None:
    import re

    root = Path(__file__).resolve().parents[2]
    found = set()
    for path in (root / "app").rglob("*.py"):
        if path.name == "row_scope.py":
            continue
        source = path.read_text(encoding="utf-8")
        for why in re.findall(r'acting_for_service\(\s*[\w.]+,\s*"([^"]+)"\s*\)', source):
            found.add((path.relative_to(root).as_posix(), why))
        assert source.count("acting_for_service(") == len(
            re.findall(r'acting_for_service\(\s*[\w.]+,\s*"[^"]+"\s*\)', source)
        ), f"{path}: acting_for_service needs a literal reason"
    assert found == APPROVED_SERVICE_STEPS


async def _row_rules_server(db_settings: Settings) -> None:
    """The server's own engine is held by the row rules from here on, with the privileges it
    normally has. Locally the database user owns the tables and isn't a superuser, so the
    forced rules already apply. CI's user is a superuser (which skips every rule): there the
    server switches to a plain role that inherits the owner's privileges."""
    from app.db.session import dispose_engine, get_engine

    await dispose_engine()
    if not await _sql(db_settings, "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"):
        return
    owner = await _sql(db_settings, "SELECT tableowner FROM pg_tables WHERE tablename = 'offers'")
    await _sql(
        db_settings,
        "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xs_rules_test') "
        "THEN CREATE ROLE xs_rules_test NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$",
    )
    await _sql(db_settings, f'GRANT "{owner}" TO xs_rules_test')  # a name read from the catalog

    @event.listens_for(get_engine(db_settings).sync_engine, "connect")
    def _set_role(dbapi_conn: Any, _record: Any) -> None:
        cursor = dbapi_conn.cursor()
        cursor.execute("SET ROLE xs_rules_test")
        cursor.close()
        dbapi_conn.commit()


async def _verified(db_settings: Settings, phone: str) -> None:
    await _sql(
        db_settings,
        "INSERT INTO kyc_cases (id, user_id, provider, country, provider_session_id, "
        "provider_status, status, legal_name, date_of_birth, decided_at, created_at, updated_at) "
        "SELECT gen_random_uuid(), id, 'didit', c, 'rls-' || c || id, 'Approved', 'approved', "
        "'Ada Obi', DATE '1990-01-01', now(), now(), now() "
        "FROM users CROSS JOIN (VALUES ('NG'), ('US')) AS countries(c) WHERE phone = :p",
        p=phone,
    )


async def test_taking_an_offer_reads_the_owners_tier_under_the_row_rules(
    db_settings: Settings, clean: None
) -> None:
    """Found by the load test (ADR-085). With real identity checks (no developer bypass) and
    the row rules on, the taker's request couldn't see the owner's identity check, so every
    offer answered "can't be taken right now"."""
    from tests.integration.test_auth_api import _env
    from tests.integration.test_matches_api import OWNER, _person

    async for env in _env(db_settings):
        owner = await _person(env, OWNER)
        taker = await _person(env, TAKER)
        for p in (OWNER[0], TAKER[0]):
            await _verified(db_settings, p)
        await _row_rules_server(db_settings)
        offer = await owner.publish(source_amount="500.00", desired_rate="1320.50")
        assert offer.status_code == 201, offer.text
        r = await taker.take(offer.json()["offer_id"], "10.00")
        assert r.status_code == 201, r.text
        # The owner's state is still checked: their identity check expires, the offer can't be
        # taken, and the taker learns nothing about why.
        await _sql(
            db_settings,
            "UPDATE kyc_cases SET status = 'expired' WHERE provider_session_id LIKE 'rls-%' "
            "AND user_id = (SELECT id FROM users WHERE phone = :p)",
            p=OWNER[0],
        )
        r = await taker.take(offer.json()["offer_id"], "10.00")
        assert (r.status_code, r.json()["error"]["code"]) == (403, "TRADE_403_COUNTERPARTY_LIMIT")
        assert "verif" not in r.text.lower()
    from app.db.session import dispose_engine

    await dispose_engine()
