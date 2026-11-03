"""pytest plugin (ADR-094): the server's own database connections run as ``xspeeria_app``.

Test fixtures keep the login they were given (they create and empty tables, which only the
owner may do); every connection the app itself opens -- through ``get_engine`` -- switches to
the non-owning app role first. A missing grant then fails the test that needs it.

    uv run pytest -p tests.as_app_role tests/integration

Run before a release, and after any migration that adds a table. Needs a database user that
may ``SET ROLE xspeeria_app`` (the tables' owner or a superuser).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine

import app.db.session as session_module

_real_get_engine = session_module.get_engine


def _as_app_role(engine: AsyncEngine) -> None:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_role(dbapi_conn: Any, _record: Any) -> None:
        cursor = dbapi_conn.cursor()
        cursor.execute("SET ROLE xspeeria_app")
        cursor.close()
        dbapi_conn.commit()  # kept after the driver's first rollback


def _get_engine(settings: Any = None) -> AsyncEngine:
    new = session_module._engine is None
    engine = _real_get_engine(settings)
    if new:
        _as_app_role(engine)
    return engine


session_module.get_engine = _get_engine
