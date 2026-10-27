"""Request-ID and access-log middleware (ADR-025 §1.8, the F-16 logging rule).

Each request gets an ID (returned in ``X-Request-ID``) and one log line with only: method,
route template, status, duration, request ID and — when signed in — the user ID. The body,
headers, query string and path parameters are never read or logged. A client-supplied
request ID is accepted only if it is short and plain, so it cannot inject into log lines.
"""

from __future__ import annotations

import re
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from starlette.routing import Match

from app.core import activity
from app.core.api_metrics import recorder
from app.core.logging import get_logger

__all__ = ["install_request_logging"]

_SAFE_ID = re.compile(r"^[A-Za-z0-9\-]{8,64}$")
_logger = get_logger("app.access")


def _route_template(request: Request) -> str:
    """The route pattern (``/users/me/sessions/{session_id}``), never the concrete path,
    so identifiers in the URL do not reach the log. Router matching runs inside the app,
    so the matched route is read back from the scope after the response."""
    route = request.scope.get("route")
    if route is not None:
        return str(getattr(route, "path", "unmatched"))
    for candidate in request.app.router.routes:
        match, _ = candidate.matches(request.scope)
        if match == Match.FULL:
            return str(getattr(candidate, "path", "unmatched"))
    return "unmatched"


async def _record_activity(request: Request, route: str, status_code: int) -> None:
    """ADR-073: a signed-in customer's change (any non-GET request) goes in their activity log."""
    if request.method in ("GET", "HEAD", "OPTIONS") or route == "unmatched":
        return
    who = getattr(request.state, "user_id", None)
    if not who or str(who).startswith("staff:"):
        return
    settings = getattr(request.app.state, "settings", None)
    if settings is None or not settings.database_url:
        return
    try:
        from app.db.session import get_sessionmaker

        row = activity.for_request(
            uuid.UUID(str(who)),
            request.method,
            route,
            status_code,
            dict(request.scope.get("path_params") or {}),
        )
        async with get_sessionmaker(settings)() as db:
            db.add(row)
            await db.commit()
    except Exception:  # noqa: BLE001 - never fail the answer because the log failed
        _logger.exception("activity_record_failed", extra={"route": route})


def install_request_logging(app: FastAPI) -> None:
    @app.middleware("http")
    async def _log(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        supplied = request.headers.get("x-request-id", "")
        request_id = supplied if _SAFE_ID.fullmatch(supplied) else str(uuid.uuid4())
        request.state.request_id = request_id
        # ADR-073: what the activity log needs from this request (no body, query or headers
        # beyond a shortened device name and the hosting's country code).
        activity.current_request.set(request_id)
        activity.current_device.set(activity.short_device(request.headers.get("user-agent")))
        header = getattr(request.app.state, "settings", None)
        header = header.client_country_header if header is not None else None
        country = (request.headers.get(header, "") if header else "").upper()
        activity.current_country.set(country if len(country) == 2 and country.isalpha() else None)
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            route = _route_template(request)
            duration_ms = (time.perf_counter() - started) * 1000
            # ADR-072: counts and timings per route template (no user, no identifiers).
            kind = "webhook" if route.startswith("/api/v1/webhooks") else "own"
            recorder.record(kind, route, request.method, status_code, duration_ms)
            await _record_activity(request, route, status_code)
            _logger.info(
                "request",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "route": route,
                    "status": status_code,
                    "duration_ms": round(duration_ms, 1),
                    "user_id": getattr(request.state, "user_id", None),
                },
            )
