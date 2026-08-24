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

import pytest
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


@pytest.fixture
def unexpected_error_log() -> tuple[dict[str, object], str, list[str]]:
    """Trigger one unhandled exception and return (record, response text, raw lines)."""
    app = create_app(Settings(_env_file=None))  # type: ignore[call-arg]

    @app.get("/_test/unexpected")
    async def _boom() -> None:
        raise RuntimeError(f"{MESSAGE_MARKER} carrying {SECRET_MARKER}")

    client = TestClient(app, raise_server_exceptions=False)
    with captured_json_logs() as buffer:
        response = client.get("/_test/unexpected")
    lines = [line for line in buffer.getvalue().splitlines() if line.strip()]
    assert len(lines) == 1, f"expected exactly one record, got {len(lines)}: {lines}"
    return json.loads(lines[0]), response.text, lines


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
