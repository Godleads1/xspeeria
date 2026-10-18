"""CD3 enforcement verification against PostgreSQL 16 (DECISION 4.1B-CD3, ADR-028).

Each ruling is checked on the real migrated table:
H1 database-level · H2 no UPDATE · H3 no DELETE (referenced or not) · H4 no TRUNCATE ·
H5 whole-row (``created_at`` too) · H6 non-owning runtime role · H7 fixed, alertable signature ·
H9 no routine override (downgrade refuses without explicit authorization).
INSERT stays permitted: corrections are new versions, never edits.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import Settings
from app.db.session import build_engine
from tests.integration.test_migrations import ALEMBIC_INI, MIGRATIONS_DIR

pytestmark = pytest.mark.integration

APP_ROLE = "xspeeria_app"
ROW = {"currency": "NGN", "v": "cd3-test-v1", "scale": 2}


def _config(database_url: str, *, authorized: bool, records: bool = True) -> Config:
    """``authorized`` is the CD3 (H9) switch under test. Removing the 0006 offer tables on
    the way down has its own switch, on by default here so these tests isolate CD3."""
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.attributes["database_url"] = database_url
    if authorized:
        config.attributes["cd3_downgrade"] = "authorized"
    if records:
        config.attributes["records_downgrade"] = "authorized"
    return config


@pytest.fixture(scope="module", autouse=True)
def at_head(database_url: str) -> Iterator[None]:
    command.upgrade(_config(database_url, authorized=False), "head")
    yield


@pytest_asyncio.fixture
async def conn(db_settings: Settings) -> AsyncIterator[AsyncConnection]:
    """A connection whose work is always rolled back: no test leaves a row behind."""
    engine = build_engine(db_settings)
    try:
        async with engine.connect() as connection:
            trans = await connection.begin()
            await connection.execute(
                text(
                    "INSERT INTO currency_definitions (currency, currency_def_version, scale) "
                    "VALUES (:currency, :v, :scale)"
                ),
                ROW,
            )
            try:
                yield connection
            finally:
                await trans.rollback()
    finally:
        await engine.dispose()


def _sqlstate(error: DBAPIError) -> str | None:
    orig = error.orig
    return getattr(orig, "sqlstate", None) or getattr(
        getattr(orig, "__cause__", None), "sqlstate", None
    )


async def _refused(conn: AsyncConnection, sql: str, **params: object) -> DBAPIError:
    with pytest.raises(DBAPIError) as caught:
        async with conn.begin_nested():
            await conn.execute(text(sql), params)
    return caught.value


# --- Stage 1: the triggers refuse even the owner -----------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE currency_definitions SET scale = 3 WHERE currency_def_version = :v",
        "UPDATE currency_definitions SET created_at = now() WHERE currency_def_version = :v",
        "UPDATE currency_definitions SET scale = scale WHERE currency_def_version = :v",
        "DELETE FROM currency_definitions WHERE currency_def_version = :v",
    ],
    ids=["update-scale", "update-created_at-H5", "no-op-update", "delete-H3"],
)
async def test_update_and_delete_are_refused(conn: AsyncConnection, sql: str) -> None:
    err = await _refused(conn, sql, v=ROW["v"])
    assert _sqlstate(err) == "XS001"
    assert "CD3: currency_definitions rows are permanent" in str(err.orig)


@pytest.mark.asyncio
async def test_truncate_is_refused_by_its_own_trigger(conn: AsyncConnection) -> None:
    # Since 0006, offers reference this table, so a plain TRUNCATE is stopped by PostgreSQL
    # (0A000) before the trigger runs; CASCADE gets past that check and must hit CD3.
    err = await _refused(conn, "TRUNCATE currency_definitions CASCADE")
    assert _sqlstate(err) == "XS001"
    assert "TRUNCATE refused" in str(err.orig)


@pytest.mark.asyncio
async def test_plain_truncate_is_refused(conn: AsyncConnection) -> None:
    err = await _refused(conn, "TRUNCATE currency_definitions")
    assert _sqlstate(err) in {"XS001", "0A000"}


@pytest.mark.asyncio
async def test_insert_of_a_new_version_is_still_permitted(conn: AsyncConnection) -> None:
    await conn.execute(
        text(
            "INSERT INTO currency_definitions (currency, currency_def_version, scale) "
            "VALUES ('NGN', 'cd3-test-v2', 2)"
        )
    )
    count = await conn.scalar(
        text(
            "SELECT count(*) FROM currency_definitions WHERE currency_def_version LIKE 'cd3-test-%'"
        )
    )
    assert count == 2


@pytest.mark.asyncio
async def test_the_row_is_unchanged_after_refusals(conn: AsyncConnection) -> None:
    before = (
        await conn.execute(
            text("SELECT * FROM currency_definitions WHERE currency_def_version = :v"), ROW
        )
    ).one()
    await _refused(
        conn,
        "UPDATE currency_definitions SET scale = 4 WHERE currency_def_version = :v",
        v=ROW["v"],
    )
    await _refused(
        conn, "DELETE FROM currency_definitions WHERE currency_def_version = :v", v=ROW["v"]
    )
    after = (
        await conn.execute(
            text("SELECT * FROM currency_definitions WHERE currency_def_version = :v"), ROW
        )
    ).one()
    assert before == after


@pytest.mark.asyncio
async def test_triggers_are_installed_and_enabled(conn: AsyncConnection) -> None:
    rows = (
        await conn.execute(
            text(
                "SELECT tgname, tgenabled::text AS tgenabled FROM pg_trigger "
                "WHERE tgrelid = 'public.currency_definitions'::regclass AND NOT tgisinternal"
            )
        )
    ).all()
    assert {r.tgname: r.tgenabled for r in rows} == {
        "cd3_refuse_update_delete": "O",
        "cd3_refuse_truncate": "O",
    }


# --- Stage 2: the runtime role cannot change or unlock the table -------------------------------


@pytest.mark.asyncio
async def test_runtime_role_has_only_select_and_insert(conn: AsyncConnection) -> None:
    for privilege, expected in [
        ("SELECT", True),
        ("INSERT", True),
        ("UPDATE", False),
        ("DELETE", False),
        ("TRUNCATE", False),
        ("TRIGGER", False),
        ("REFERENCES", False),
    ]:
        has = await conn.scalar(
            text("SELECT has_table_privilege(:role, 'public.currency_definitions', :p)"),
            {"role": APP_ROLE, "p": privilege},
        )
        assert has is expected, privilege


@pytest.mark.asyncio
async def test_runtime_role_is_not_the_owner(conn: AsyncConnection) -> None:
    owner = await conn.scalar(
        text("SELECT tableowner FROM pg_tables WHERE tablename = 'currency_definitions'")
    )
    assert owner != APP_ROLE
    is_super = await conn.scalar(
        text("SELECT rolsuper FROM pg_roles WHERE rolname = :r"), {"r": APP_ROLE}
    )
    assert is_super is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE currency_definitions SET scale = 3 WHERE currency_def_version = :v",
        "DELETE FROM currency_definitions WHERE currency_def_version = :v",
        "TRUNCATE currency_definitions",
        "ALTER TABLE currency_definitions DISABLE TRIGGER cd3_refuse_update_delete",
        "DROP TRIGGER cd3_refuse_update_delete ON currency_definitions",
    ],
    ids=["update", "delete", "truncate", "disable-trigger", "drop-trigger"],
)
async def test_runtime_role_is_refused_before_the_trigger(conn: AsyncConnection, sql: str) -> None:
    await conn.execute(text(f"SET LOCAL ROLE {APP_ROLE}"))
    err = await _refused(conn, sql, v=ROW["v"])
    assert _sqlstate(err) == "42501"  # insufficient_privilege / must be owner


@pytest.mark.asyncio
async def test_runtime_role_can_read_and_add_versions(conn: AsyncConnection) -> None:
    await conn.execute(text(f"SET LOCAL ROLE {APP_ROLE}"))
    assert (
        await conn.scalar(
            text("SELECT count(*) FROM currency_definitions WHERE currency_def_version = :v"), ROW
        )
        == 1
    )
    await conn.execute(
        text(
            "INSERT INTO currency_definitions (currency, currency_def_version, scale) "
            "VALUES ('NGN', 'cd3-test-v3', 2)"
        )
    )


@pytest.mark.asyncio
async def test_every_table_grants_the_runtime_role_explicitly(conn: AsyncConnection) -> None:
    """A new table without a grant would make the app fail, or tempt someone to run it as
    owner. Every table except Alembic's own must be reachable by the runtime role."""
    tables = (
        (
            await conn.execute(
                text(
                    "SELECT tablename FROM pg_tables "
                    "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
                )
            )
        )
        .scalars()
        .all()
    )
    missing = [
        t
        for t in tables
        if not await conn.scalar(
            text("SELECT has_table_privilege(:r, 'public.' || :t, 'SELECT')"),
            {"r": APP_ROLE, "t": t},
        )
    ]
    assert missing == []


# --- H9: no routine override ------------------------------------------------------------------


def test_downgrade_refuses_without_explicit_authorization(database_url: str) -> None:
    with pytest.raises(RuntimeError, match="H9"):
        command.downgrade(_config(database_url, authorized=False), "0004")
    command.upgrade(_config(database_url, authorized=False), "head")  # still at head


def test_offer_records_downgrade_needs_its_own_authorization(database_url: str) -> None:
    with pytest.raises(RuntimeError, match="records_downgrade"):
        command.downgrade(_config(database_url, authorized=True, records=False), "0005")
    command.upgrade(_config(database_url, authorized=False), "head")


def test_authorized_round_trip_restores_the_protection(database_url: str) -> None:
    command.downgrade(_config(database_url, authorized=True), "0004")
    command.upgrade(_config(database_url, authorized=False), "head")
