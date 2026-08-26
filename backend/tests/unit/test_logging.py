"""Logging-surface tests.

Two concerns, both of them security-shaped:

* what the unexpected-exception handler is allowed to write to the log, and
* whether request-derived text can forge a second log record (CWE-117).

Every value here is a synthetic marker. No real credential appears in this file.
"""

from __future__ import annotations

import io
import json
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.logging import JsonFormatter
from app.main import create_app

#: Stands in for anything an exception message might interpolate: a token, an account
#: number, a DSN. It must never reach the log.
SECRET_MARKER = "SYNTHETIC-TOKEN-abc123-NOT-REAL"
MESSAGE_MARKER = "SYNTHETIC-EXCEPTION-TEXT-MARKER"


@contextmanager
def captured_json_logs() -> Iterator[io.StringIO]:
    """Render root-logger output through ``JsonFormatter`` into a buffer.

    The real handler writes to stdout through the same formatter, so the captured text
    is what an operator's log sink would receive. ``httpx`` is quietened for the
    duration: its per-request INFO line is the TestClient's own noise, not the
    application's, and counting records is part of the contract under test.
    """
    buffer = io.StringIO()
    handler = logging.StreamHandler(buffer)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    httpx_logger = logging.getLogger("httpx")
    previous_handlers, previous_level = list(root.handlers), root.level
    previous_httpx_level = httpx_logger.level

    root.handlers = [handler]
    root.setLevel(logging.INFO)
    httpx_logger.setLevel(logging.WARNING)
    try:
        yield buffer
    finally:
        root.handlers = previous_handlers
        root.setLevel(previous_level)
        httpx_logger.setLevel(previous_httpx_level)


@contextmanager
def preserved_logging_state() -> Iterator[None]:
    """Snapshot every logger's mutable state and put all of it back afterwards.

    ``TestLoggingSurvivesAlembicConfiguration`` deliberately runs a real Alembic
    configuration, which rewrites the root handlers and touches logger levels
    process-wide. Restoring here is what keeps these tests independent of -- and harmless
    to -- the order the suite happens to run in.
    """
    manager = logging.Logger.manager
    root = logging.getLogger()
    named = [value for value in manager.loggerDict.values() if isinstance(value, logging.Logger)]
    snapshot = [
        (logger, logger.disabled, logger.level, logger.propagate, list(logger.handlers))
        for logger in [root, *named]
    ]
    pre_existing = set(manager.loggerDict)
    try:
        yield
    finally:
        for logger, disabled, level, propagate, handlers in snapshot:
            logger.disabled = disabled
            logger.level = level
            logger.propagate = propagate
            logger.handlers = handlers
        for name in set(manager.loggerDict) - pre_existing:
            del manager.loggerDict[name]


def emit_unexpected_exception() -> tuple[str, list[str]]:
    """Drive one unhandled exception through a fresh app; return (response text, records).

    Shared by the fixture below and by the regression tests, so both exercise exactly the
    same path: ``create_app`` -> ``TestClient`` -> the ``Exception`` handler.
    """
    app = create_app(Settings(_env_file=None))  # type: ignore[call-arg]

    @app.get("/_test/unexpected")
    async def _boom() -> None:
        raise RuntimeError(f"{MESSAGE_MARKER} carrying {SECRET_MARKER}")

    client = TestClient(app, raise_server_exceptions=False)
    with captured_json_logs() as buffer:
        response = client.get("/_test/unexpected")
    return response.text, [line for line in buffer.getvalue().splitlines() if line.strip()]


@pytest.fixture
def unexpected_error_log() -> tuple[dict[str, object], str, list[str]]:
    """Trigger one unhandled exception and return (record, response text, raw lines)."""
    response_text, lines = emit_unexpected_exception()
    assert len(lines) == 1, f"expected exactly one record, got {len(lines)}: {lines}"
    return json.loads(lines[0]), response_text, lines


class TestUnexpectedExceptionLogging:
    def test_emits_exactly_one_parseable_json_record(
        self, unexpected_error_log: tuple[dict[str, object], str, list[str]]
    ) -> None:
        record, _, lines = unexpected_error_log
        assert len(lines) == 1
        assert json.loads(lines[0]) == record
        assert record["message"] == "unhandled_exception"
        assert record["level"] == "ERROR"

    def test_exception_message_is_not_logged(
        self, unexpected_error_log: tuple[dict[str, object], str, list[str]]
    ) -> None:
        _, _, lines = unexpected_error_log
        assert MESSAGE_MARKER not in lines[0]

    def test_secret_embedded_in_the_exception_is_not_logged(
        self, unexpected_error_log: tuple[dict[str, object], str, list[str]]
    ) -> None:
        """The regression this test exists for: it used to appear."""
        _, _, lines = unexpected_error_log
        assert SECRET_MARKER not in lines[0]

    def test_traceback_is_not_logged(
        self, unexpected_error_log: tuple[dict[str, object], str, list[str]]
    ) -> None:
        record, _, lines = unexpected_error_log
        assert "exception" not in record
        for fragment in ("Traceback (most recent call last)", "site-packages", "_boom"):
            assert fragment not in lines[0]

    def test_exception_type_is_logged(
        self, unexpected_error_log: tuple[dict[str, object], str, list[str]]
    ) -> None:
        """A class name is chosen by the developer, never interpolated from a request."""
        record, _, _ = unexpected_error_log
        assert record["exception_type"] == "RuntimeError"

    def test_route_metadata_is_logged(
        self, unexpected_error_log: tuple[dict[str, object], str, list[str]]
    ) -> None:
        record, _, _ = unexpected_error_log
        assert record["path"] == "/_test/unexpected"
        assert record["method"] == "GET"

    def test_response_stays_generic(
        self, unexpected_error_log: tuple[dict[str, object], str, list[str]]
    ) -> None:
        _, response_text, _ = unexpected_error_log
        assert json.loads(response_text) == {
            "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."}
        }
        for forbidden in (MESSAGE_MARKER, SECRET_MARKER, "RuntimeError", "Traceback"):
            assert forbidden not in response_text


class TestJsonFormatterEscaping:
    """CWE-117 log forging -- **FALSE POSITIVE** for this formatter, pinned here.

    A scanner flags ``request.url.path`` as unsanitised request-derived input. It does
    not need sanitising: ``json.dumps`` escapes every control character, so hostile text
    cannot end a line or open a new record. Stripping newlines from the path would
    corrupt the recorded value while removing nothing exploitable, so the formatter is
    deliberately left alone and this test keeps that decision honest.

    The control characters are named rather than written as escapes: a test about
    backslash handling should not itself be hard to read through layers of escaping.
    """

    NEWLINE = chr(10)
    CARRIAGE_RETURN = chr(13)
    TAB = chr(9)
    QUOTE = chr(34)
    BACKSLASH = chr(92)

    #: A path carrying a complete forged JSON record plus every character that could
    #: plausibly break a JSON-lines sink.
    HOSTILE = (
        "/x" + NEWLINE
        + '{"level":"CRITICAL","message":"FORGED"}' + CARRIAGE_RETURN + NEWLINE
        + QUOTE + "quote" + QUOTE + BACKSLASH + "backslash" + TAB + "tab"
    )

    def _render(self, **extra: str) -> str:
        record = logging.LogRecord(
            name="app.core.exceptions",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="unhandled_exception",
            args=(),
            exc_info=None,
        )
        for key, value in extra.items():
            setattr(record, key, value)
        return JsonFormatter().format(record)

    def test_hostile_path_yields_exactly_one_physical_line(self) -> None:
        rendered = self._render(path=self.HOSTILE, method="GET")
        assert len(rendered.splitlines()) == 1
        assert self.NEWLINE not in rendered
        assert self.CARRIAGE_RETURN not in rendered

    def test_output_still_parses_as_one_json_object(self) -> None:
        parsed = json.loads(self._render(path=self.HOSTILE, method="GET"))
        assert parsed["message"] == "unhandled_exception"

    def test_control_characters_are_escaped_not_removed(self) -> None:
        rendered = self._render(path=self.HOSTILE, method="GET")
        for escape in (
            self.BACKSLASH + "n",
            self.BACKSLASH + "r",
            self.BACKSLASH + "t",
            self.BACKSLASH + self.QUOTE,
            self.BACKSLASH + self.BACKSLASH,
        ):
            assert escape in rendered

    def test_path_round_trips_exactly(self) -> None:
        """Escaped, not mutated: the recorded value stays forensically accurate."""
        parsed = json.loads(self._render(path=self.HOSTILE, method="GET"))
        assert parsed["path"] == self.HOSTILE

    def test_no_forged_record_is_produced(self) -> None:
        forged_method = "GET" + self.NEWLINE + '{"message":"FORGED_METHOD"}'
        rendered = self._render(path=self.HOSTILE, method=forged_method)
        lines = [line for line in rendered.splitlines() if line.strip()]
        assert len(lines) == 1
        assert json.loads(lines[0])["message"] == "unhandled_exception"


class TestLoggingSurvivesAlembicConfiguration:
    """Regression: configuring Alembic must not switch the application's loggers off.

    ``migrations/env.py`` calls ``logging.config.fileConfig(alembic.ini)``. That function's
    ``disable_existing_loggers`` argument defaults to **True**, which sets
    ``disabled = True`` on every logger that already exists and is not named in the config
    -- ``app.core.exceptions`` and ``app.main`` among them, both created at import time. A
    disabled logger fails ``isEnabledFor`` outright, so ``_logger.error`` becomes a no-op
    and the unhandled-exception record is never written, silently, for the rest of the
    process.

    This is what broke CI on 05b52ab: the integration suite drives ``alembic.command``
    against PostgreSQL and runs before ``backend/tests/unit``, so by the time this file's
    tests ran the application loggers were already disabled -- 7 errors, all of them
    "expected exactly one record, got 0". It never reproduced locally because without a
    database the integration tests skip, and Alembic therefore never runs at all.

    These tests drive the real ``migrations/env.py`` in **offline** mode, which emits SQL
    instead of connecting. That exercises the actual ``fileConfig`` call with no database,
    so the guard lives in the unit suite and cannot be skipped into a false green.
    """

    REPO_ROOT = Path(__file__).resolve().parents[3]
    ALEMBIC_INI = REPO_ROOT / "alembic.ini"
    MIGRATIONS_DIR = REPO_ROOT / "migrations"

    #: Never connected to -- offline mode renders SQL to stdout and opens no socket.
    OFFLINE_URL = "postgresql+asyncpg://unit-test@localhost/unit-test"

    def _run_offline_migration(self) -> None:
        config = Config(str(self.ALEMBIC_INI))
        config.set_main_option("script_location", str(self.MIGRATIONS_DIR))
        config.cmd_opts = None
        config.attributes["database_url"] = self.OFFLINE_URL
        command.upgrade(config, "head", sql=True)

    def test_application_loggers_stay_enabled(self) -> None:
        with preserved_logging_state():
            self._run_offline_migration()
            for name in ("app.core.exceptions", "app.main"):
                assert logging.getLogger(name).disabled is False, (
                    f"{name} was disabled by the Alembic logging configuration; "
                    "every record it emits from here on is silently dropped"
                )

    def test_exactly_one_record_is_still_emitted(self) -> None:
        """The end-to-end shape of the CI failure: one record, not zero."""
        with preserved_logging_state():
            self._run_offline_migration()
            _, lines = emit_unexpected_exception()

        assert len(lines) == 1, f"expected exactly one record, got {len(lines)}: {lines}"
        assert json.loads(lines[0])["message"] == "unhandled_exception"

    def test_redaction_is_unaffected(self) -> None:
        """The security contract must hold on this path too, not just the clean one."""
        with preserved_logging_state():
            self._run_offline_migration()
            response_text, lines = emit_unexpected_exception()

        record = json.loads(lines[0])
        assert record["exception_type"] == "RuntimeError"
        assert "exception" not in record
        for forbidden in (MESSAGE_MARKER, SECRET_MARKER, "Traceback (most recent call last)"):
            assert forbidden not in lines[0]
            assert forbidden not in response_text


class TestConfigureLoggingIdempotence:
    """Repeated ``create_app()`` must not accumulate handlers.

    Every call runs ``configure_logging``, which replaces the root handlers rather than
    appending to them. If that ever regressed to an append, one exception would produce one
    record *per application ever built* -- and ``len(lines) == 1`` above would start failing
    with too many records instead of none. Both directions are worth pinning.
    """

    def test_repeated_creation_leaves_exactly_one_root_handler(self) -> None:
        with preserved_logging_state():
            for _ in range(3):
                create_app(Settings(_env_file=None))  # type: ignore[call-arg]
            assert len(logging.getLogger().handlers) == 1

    def test_repeated_creation_still_yields_exactly_one_record(self) -> None:
        with preserved_logging_state():
            for _ in range(3):
                create_app(Settings(_env_file=None))  # type: ignore[call-arg]
            _, lines = emit_unexpected_exception()

        assert len(lines) == 1, f"expected exactly one record, got {len(lines)}: {lines}"
