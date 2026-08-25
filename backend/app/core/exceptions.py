"""Error-envelope foundation.

One response shape for every failure, so clients never have to branch on error format:

    {"error": {"code": "...", "message": "...", "details": {...}}}

Error *codes* are deliberately not enumerated here. The catalogue in
`docs/04-api-data/05_API_Contract_Data_Dictionary.md` is a **derived, not ratified**
draft, and freezing identifiers in code would give that draft an authority it does not
have.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

__all__ = ["AppError", "error_body", "install_exception_handlers"]

_logger = get_logger(__name__)


class AppError(Exception):
    """Base class for errors that carry an explicit code and HTTP status."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return body


def install_exception_handlers(app: FastAPI) -> None:
    """Register handlers so every failure leaves through the same envelope."""

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_body(
                "VALIDATION_ERROR",
                "Request failed validation.",
                {"errors": exc.errors()},
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body("HTTP_ERROR", str(exc.detail)),
        )

    @app.exception_handler(Exception)
    async def _unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        """Last resort: anything the handlers above did not claim.

        The response carries a fixed message and nothing else. Nothing derived from the
        exception reaches the client.

        **The log record carries no exception content either.** Not the message, not the
        traceback: an exception's ``str()`` is whatever the raising code interpolated into
        it, which in a payments system is exactly where a token, an account number, a KYC
        field or a DSN ends up. ``logger.exception`` and ``exc_info=True`` would serialize
        both through ``JsonFormatter`` onto stdout. Reproduced before this was changed: a
        synthetic token embedded in an exception message appeared in the emitted record.

        What is logged is bounded and non-sensitive by construction -- the route, the
        method, and the exception **class name**. The class name is a fixed identifier
        chosen by the developer who defined the type; it carries no request data. The
        request body, headers and query string are never read here.

        This is a deliberate Phase 1 trade: losing the stack trace costs diagnostic
        depth. Richer production diagnostics -- traceback capture, structured error
        reporting, sampled payloads -- require the **F-16 logging / redaction /
        observability policy** to exist first, and that policy is **OPEN** under
        Decision 2. It must land before any route accepts a credential, a KYC field or a
        monetary amount. Until then, no exception content leaves this handler.
        """
        _logger.error(
            "unhandled_exception",
            extra={
                "path": request.url.path,
                "method": request.method,
                "exception_type": type(exc).__name__,
            },
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("INTERNAL_ERROR", "An unexpected error occurred."),
        )
