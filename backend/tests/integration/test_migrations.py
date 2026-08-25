"""D. upgrade from empty · E. downgrade/upgrade round-trip · F. head identity ·
G. metadata-vs-migration drift.

Every test drives Alembic **as an operator would** -- through `alembic.ini`, the real
async `env.py`, and a real PostgreSQL 16 database -- rather than importing the revision
modules and calling `upgrade()` directly. Calling the functions would skip exactly the
machinery most likely to break: config resolution, `prepend_sys_path`, the async engine
handling and the version-table bookkeeping.

These tests are synchronous on purpose: `env.py` owns its own event loop via
`asyncio.run`, so running them under `pytest-asyncio` would nest loops.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.core.config import Settings
from app.db.base import Base
from app.db.session import build_engine

pytestmark = pytest.mark.integration

REPO_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = REPO_ROOT / "alembic.ini"
MIGRATIONS_DIR = REPO_ROOT / "migrations"
EXPECTED_HEAD = "0001_baseline"


def _config(database_url: str) -> Config:
    """Real Alembic config, with the URL passed the way `-x database_url=...` passes it."""
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.cmd_opts = None
    config.attributes["database_url"] = database_url
    return config


def _query(database_url: str, sql: str) -> object:
    async def _run() -> object:
        engine = build_engine(Settings(_env_file=None, database_url=database_url))  # type: ignore[call-arg]
        try:
            async with engine.connect() as conn:
                return (await conn.execute(text(sql))).scalar()
        finally:
            await engine.dispose()

    return asyncio.run(_run())


def _current_revision(database_url: str) -> str | None:
    if _query(database_url, "SELECT to_regclass('public.alembic_version')") is None:
        return None
    value = _query(database_url, "SELECT version_num FROM alembic_version")
    return None if value is None else str(value)


def _public_tables(database_url: str) -> list[str]:
    async def _run() -> list[str]:
        engine = build_engine(Settings(_env_file=None, database_url=database_url))  # type: ignore[call-arg]
        try:
            async with engine.connect() as conn:
                rows = await conn.execute(
                    text(
                        "SELECT tablename FROM pg_tables "
                        "WHERE schemaname = 'public' ORDER BY tablename"
                    )
                )
                return [str(r) for r in rows.scalars().all()]
        finally:
            await engine.dispose()

    return asyncio.run(_run())


class TestMigrationChain:
    """F. Exactly one head, and it is the expected baseline."""

    def test_single_head(self) -> None:
        heads = ScriptDirectory(str(MIGRATIONS_DIR)).get_heads()
        assert len(heads) == 1, f"expected exactly one Alembic head, found {heads}"

    def test_head_is_the_expected_baseline(self) -> None:
        assert ScriptDirectory(str(MIGRATIONS_DIR)).get_current_head() == EXPECTED_HEAD

    def test_baseline_has_no_down_revision(self) -> None:
        revision = ScriptDirectory(str(MIGRATIONS_DIR)).get_revision(EXPECTED_HEAD)
        assert revision is not None
        assert revision.down_revision is None


class TestUpgradeAndRoundTrip:
    """D. empty -> head · E. head -> base -> head, exactly reversible."""

    def test_upgrade_from_empty_database(self, database_url: str) -> None:
        command.downgrade(_config(database_url), "base")
        assert _current_revision(database_url) is None

        command.upgrade(_config(database_url), "head")
        assert _current_revision(database_url) == EXPECTED_HEAD

    def test_round_trip_is_reversible(self, database_url: str) -> None:
        command.upgrade(_config(database_url), "head")
        assert _current_revision(database_url) == EXPECTED_HEAD

        command.downgrade(_config(database_url), "base")
        assert _current_revision(database_url) is None

        command.upgrade(_config(database_url), "head")
        assert _current_revision(database_url) == EXPECTED_HEAD

    def test_baseline_creates_no_table(self, database_url: str) -> None:
        """The baseline establishes the chain and nothing else.

        Only Alembic's own bookkeeping table may exist after `upgrade head`. A domain
        table appearing here would mean a batch created persistence ahead of approval.
        """
        command.downgrade(_config(database_url), "base")
        command.upgrade(_config(database_url), "head")

        tables = _public_tables(database_url)
        assert tables in ([], ["alembic_version"]), (
            f"baseline must create no domain table, found: {tables}"
        )


class TestMetadataDriftGuard:
    """G. Model metadata and the migration chain agree.

    Scoped to the CURRENT EMPTY DOMAIN: `Base.metadata` holds no table in 4.1A, so the
    guard asserts emptiness on both sides. It deliberately does **not** autogenerate
    against populated metadata, which would create future domain tables.

    From 4.1B this test is extended -- not replaced -- to compare real metadata against
    the migrated schema.
    """

    def test_declarative_metadata_is_empty_in_4_1a(self) -> None:
        assert Base.metadata.tables == {}, (
            "Milestone 4.1A defines no domain persistence, but Base.metadata carries: "
            f"{sorted(Base.metadata.tables)}"
        )

    def test_no_domain_table_is_declared_anywhere(self) -> None:
        forbidden = {
            "offers", "matches", "transactions", "settlements", "settlement_legs",
            "payout_executions", "kyc_cases", "kyc_profiles", "beneficiary_accounts",
            "idempotency_records", "users",
        }
        leaked = set(Base.metadata.tables) & forbidden
        assert not leaked, f"domain tables declared before their approved batch: {sorted(leaked)}"

    def test_migrated_schema_matches_empty_metadata(self, database_url: str) -> None:
        """The real drift check for this batch: migrated schema == declared metadata.

        Both sides must be empty. When either gains a table without the other, this fails.
        """
        command.upgrade(_config(database_url), "head")
        migrated = [t for t in _public_tables(database_url) if t != "alembic_version"]
        declared = sorted(Base.metadata.tables)
        assert migrated == declared == [], (
            f"drift: migrated schema {migrated} vs declared metadata {declared}"
        )

    def test_naming_convention_is_registered(self) -> None:
        """Deterministic constraint names must be in force before the first table exists."""
        convention = Base.metadata.naming_convention
        assert convention["pk"] == "pk_%(table_name)s"
        assert convention["uq"] == "uq_%(table_name)s_%(column_0_N_name)s"
        assert {"ck", "fk", "ix"} <= set(convention)
