"""Tell PostgreSQL whose rows a transaction may touch (row-level security, ADR-078).

Row-level security is the **second lock**. The first is in the code: every customer query
is filtered to the signed-in user and the tests prove it. This module makes the database
check the same thing, so one forgotten ``WHERE user_id = …`` can't hand a customer another
customer's private rows.

How it works
------------
* Every transaction, on every connection the application opens (ORM or Core), starts with
  ``set_config('xspeeria.scope', …, true)`` and ``set_config('xspeeria.user_id', …, true)``.
  ``true`` makes them **transaction-local**: they vanish at COMMIT/ROLLBACK, so a pooled
  connection can never carry one customer's scope into the next request.
* The values come from a context variable. A request starts in ``system`` scope (sign-in
  has to find the session before it knows who is asking). Once a customer is authenticated,
  :func:`scope_to_user` switches the rest of that request to ``user`` scope; the current
  transaction is updated straight away and every later one starts that way.
* Background jobs, staff (admin) routes and command-line tools stay in ``system`` scope:
  they act for the service, not for one customer, and their own checks (staff roles,
  ADR-060) are what limit them.
* A connection that never says anything (``psql`` as the app role, a script that skips this
  module) has neither setting, and the policies then match **no rows**. Fail closed.

The context variable is per asyncio task, so concurrent requests can't see each other's
scope; FastAPI runs a request's dependencies and handler in the same task.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any, Literal

from sqlalchemy import event, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

__all__ = [
    "SCOPE_SETTING",
    "acting_for_service",
    "USER_SETTING",
    "current_scope",
    "install_row_scope",
    "scope_to_user",
    "system_scope",
]

SCOPE_SETTING = "xspeeria.scope"
USER_SETTING = "xspeeria.user_id"

Scope = tuple[Literal["system", "user"], uuid.UUID | None]

_SYSTEM: Scope = ("system", None)
_scope: ContextVar[Scope] = ContextVar("xspeeria_row_scope", default=_SYSTEM)

_APPLY = text(
    "SELECT set_config('xspeeria.scope', :scope, true), "
    "set_config('xspeeria.user_id', :user_id, true)"
)


def current_scope() -> Scope:
    return _scope.get()


def _params(scope: Scope) -> dict[str, str]:
    kind, user_id = scope
    return {"scope": kind, "user_id": str(user_id) if user_id is not None else ""}


def _on_begin(conn: Connection) -> None:
    conn.execute(_APPLY, _params(_scope.get()))


def install_row_scope(engine: AsyncEngine) -> None:
    """Attach the per-transaction hook to an engine. Idempotent."""
    target: Any = engine.sync_engine
    if not event.contains(target, "begin", _on_begin):
        event.listen(target, "begin", _on_begin)


async def scope_to_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Limit the rest of this request to ``user_id``'s own private rows.

    Applied to the transaction already open on ``db`` (authentication opened one) as well as
    to every transaction after it.
    """
    if not isinstance(user_id, uuid.UUID):  # never a client-supplied string
        raise TypeError("scope_to_user needs the authenticated user's UUID")
    scope: Scope = ("user", user_id)
    _scope.set(scope)
    if db.in_transaction():
        await db.execute(_APPLY, _params(scope))


@asynccontextmanager
async def acting_for_service(db: AsyncSession, why: str) -> AsyncIterator[None]:
    """Run one server-side step in ``system`` scope inside a customer's request.

    For work the *service* does on both parties' behalf, triggered by one of them -- e.g.
    opening the escrow steps reads both sides' payout accounts (ADR-037). Never wraps
    anything that reads client input into a query. Every use is listed (with ``why``) in
    ``tests/integration/test_row_level_security.py``, which fails on a new one.
    """
    if not why:
        raise ValueError("acting_for_service needs a reason")
    before = _scope.get()
    token = _scope.set(_SYSTEM)
    try:
        if db.in_transaction():
            await db.execute(_APPLY, _params(_SYSTEM))
        yield
    finally:
        _scope.reset(token)
        if db.in_transaction():
            await db.execute(_APPLY, _params(before))


def system_scope() -> None:
    """Return this task to system scope (used by tests that reuse one task)."""
    _scope.set(_SYSTEM)
