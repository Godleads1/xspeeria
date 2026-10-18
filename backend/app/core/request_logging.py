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


def install_request_logging(app: FastAPI) -> None:
    @app.middleware("http")
    async def _log(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        supplied = request.headers.get("x-request-id", "")
        request_id = supplied if _SAFE_ID.fullmatch(supplied) else str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            _logger.info(
                "request",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "route": _route_template(request),
                    "status": status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    "user_id": getattr(request.state, "user_id", None),
                },
            )
