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
import os
import subprocess
import sys
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
# The first revision in the chain -- a historical fact, and always parentless.
BASELINE_REVISION = "0001_baseline"
# The current approved head. Advances with each approved migration; 4.1B Step 8 -> "0002".
EXPECTED_HEAD = "0002"


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
    """F. Exactly one head, and it is the expected revision."""

    def test_single_head(self) -> None:
        heads = ScriptDirectory(str(MIGRATIONS_DIR)).get_heads()
        assert len(heads) == 1, f"expected exactly one Alembic head, found {heads}"

    def test_head_is_the_expected_revision(self) -> None:
        """Exact equality, deliberately: an unapproved revision must not pass unnoticed."""
        assert ScriptDirectory(str(MIGRATIONS_DIR)).get_current_head() == EXPECTED_HEAD

    def test_baseline_has_no_down_revision(self) -> None:
        """A historical claim about 0001, not about the head -- it stays pinned to 0001."""
        revision = ScriptDirectory(str(MIGRATIONS_DIR)).get_revision(BASELINE_REVISION)
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

        Only Alembic's own bookkeeping table may exist at 0001. A domain table appearing
        here would mean a batch created persistence ahead of approval.

        Until 4.1B the head *was* the baseline, so this migrated to `head` and the two
        readings coincided. Now that 0002 is head the target is pinned explicitly to
        `BASELINE_REVISION`: this is a claim about what 0001 creates, and tables added by
        later approved revisions must neither satisfy nor break it.
        """
        command.downgrade(_config(database_url), "base")
        command.upgrade(_config(database_url), BASELINE_REVISION)

        tables = _public_tables(database_url)
        assert tables in ([], ["alembic_version"]), (
            f"baseline must create no domain table, found: {tables}"
        )


class TestMetadataDriftGuard:
    """G. Model metadata and the migration chain agree.

    Scoped to the CURRENT APPROVED DOMAIN: 4.1B approves exactly `currency_definitions`,
    so the guard asserts that exact set on both sides. It deliberately does **not**
    autogenerate against populated metadata, which would create future domain tables.

    As 4.1A intended, this test is extended -- not replaced -- at 4.1B to compare real
    metadata against the migrated schema.
    """

    def test_declarative_metadata_holds_exactly_the_approved_tables(self) -> None:
        """Extended from the 4.1A "must be empty" form, as this module always intended.

        4.1B declares `currency_definitions`; nothing else is approved yet. Asserting the
        exact set rather than emptiness keeps the guard meaningful: it still fails the
        moment an unapproved table is declared.

        NOTE: this assertion is order-sensitive by nature. `Base.metadata` is process-wide,
        so it is populated only once something has imported `app.models` -- which the unit
        suite does. Running this module alone leaves the metadata empty, which is why the
        expected set is derived from what is actually importable rather than hard-coded to
        the in-process state.
        """
        import app.models  # noqa: F401  -- registration side effect, as `env.py` does it

        assert set(Base.metadata.tables) == {"currency_definitions"}, (
            "Milestone 4.1B approves only `currency_definitions`, but Base.metadata "
            f"carries: {sorted(Base.metadata.tables)}"
        )

    def test_no_domain_table_is_declared_anywhere(self) -> None:
        forbidden = {
            "offers", "matches", "transactions", "settlements", "settlement_legs",
            "payout_executions", "kyc_cases", "kyc_profiles", "beneficiary_accounts",
            "idempotency_records", "users",
        }
        leaked = set(Base.metadata.tables) & forbidden
        assert not leaked, f"domain tables declared before their approved batch: {sorted(leaked)}"

    def test_migrated_schema_matches_declared_metadata(self, database_url: str) -> None:
        """The real drift check for this batch: migrated schema == declared metadata.

        At head both sides must be exactly the approved set; when either gains or loses a
        table without the other, this fails. It stays an exact-set comparison: a subset or
        contains check would let an unapproved table through on either side.
        """
        import app.models  # noqa: F401  -- registration side effect, as `env.py` does it

        command.upgrade(_config(database_url), "head")
        migrated = [t for t in _public_tables(database_url) if t != "alembic_version"]
        declared = sorted(Base.metadata.tables)
        assert migrated == declared == ["currency_definitions"], (
            f"drift: migrated schema {migrated} vs declared metadata {declared}"
        )

    def test_naming_convention_is_registered(self) -> None:
        """Deterministic constraint names must be in force before the first table exists."""
        convention = Base.metadata.naming_convention
        assert convention["pk"] == "pk_%(table_name)s"
        assert convention["uq"] == "uq_%(table_name)s_%(column_0_N_name)s"
        assert {"ck", "fk", "ix"} <= set(convention)


class TestAlembicModelDiscovery:
    """H. `env.py` must actually populate `target_metadata`.

    `app/models/__init__.py` registering a model is necessary but not sufficient: Alembic
    runs `env.py`, and if nothing on *that* import path reaches `app.models`, then
    `target_metadata` is empty and autogenerate emits a DROP for every table it cannot
    see instead of a CREATE. Traced 2026-08-27: `app/__init__.py` is docstring-only and
    none of `app.core.config`, `app.db.base` or `app.db.session` imports the model
    package, so the registration import in `env.py` is load-bearing.

    **These need no database.** They are Python-import assertions about the migration
    environment, run in a subprocess so the surrounding test session's own imports cannot
    make an empty chain look populated.
    """

    EXPECTED_TABLES = ["currency_definitions"]

    @staticmethod
    def _app_import_lines() -> str:
        """The `app.*` import statements taken verbatim from `env.py`.

        Read from the file rather than restated, so this proof cannot drift from the
        module it is proving.
        """
        source = (MIGRATIONS_DIR / "env.py").read_text(encoding="utf-8")
        lines = [
            line
            for line in source.splitlines()
            if line.startswith("import app.") or line.startswith("from app.")
        ]
        assert lines, "env.py imports nothing from `app`"
        return "\n".join(lines)

    def _run(self, snippet: str) -> str:
        result = subprocess.run(
            [sys.executable, "-c", snippet],
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "PYTHONPATH": str(REPO_ROOT / "backend")},
        )
        assert result.returncode == 0, result.stderr
        return result.stdout.strip()

    def test_env_py_imports_the_model_package(self) -> None:
        """Guards against the import being removed as 'unused'."""
        source = (MIGRATIONS_DIR / "env.py").read_text(encoding="utf-8")
        assert "import app.models" in source

    def test_env_py_import_chain_populates_target_metadata(self) -> None:
        """The regression itself: env.py's own imports must yield the model tables."""
        snippet = (
            f"{self._app_import_lines()}\n"
            "from app.db.base import Base\n"
            "print(sorted(Base.metadata.tables))"
        )
        assert self._run(snippet) == str(self.EXPECTED_TABLES)

    def test_env_py_import_chain_registers_no_future_table(self) -> None:
        forbidden = {
            "offers", "matches", "transactions", "settlements", "settlement_legs",
            "payout_executions", "kyc_cases", "kyc_profiles", "beneficiary_accounts",
            "idempotency_records", "users",
        }
        snippet = (
            f"{self._app_import_lines()}\n"
            "from app.db.base import Base\n"
            "print(sorted(Base.metadata.tables))"
        )
        assert forbidden.isdisjoint(set(eval(self._run(snippet))))  # noqa: S307

    def test_the_registration_import_builds_no_engine(self) -> None:
        """Importing models must not make the migration environment connect on import.
        `env.py` builds its engine explicitly inside `_run_async_migrations`."""
        snippet = (
            f"{self._app_import_lines()}\n"
            "import app.db.session as s\n"
            "print(s._engine is None, s._sessionmaker is None)"
        )
        assert self._run(snippet) == "True True"
