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
    async def _unexpected_error(request: Request, _: Exception) -> JSONResponse:
        """Last resort: anything the handlers above did not claim.

        The response carries a fixed message and nothing else. Exception text, the
        traceback, stack frames and local variables stay server-side, because any of
        them can contain the request data that caused the failure -- a credential, a
        token, a KYC field or an account number.

        The log record deliberately names only the route. The request body is never
        read here: it is the most likely place for a secret to be sitting.
        """
        _logger.exception(
            "unhandled_exception",
            extra={"path": request.url.path, "method": request.method},
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_body("INTERNAL_ERROR", "An unexpected error occurred."),
        )
