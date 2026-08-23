"""Shared FastAPI dependencies.

Settings are resolved from the running application rather than from the module-level
cache, so an application built with injected settings behaves the same at request time
as it does at construction time. Reading the global cache inside a route silently
ignores injected configuration.
"""

from __future__ import annotations

from fastapi import Request

from app.core.config import Settings

__all__ = ["get_app_settings"]


def get_app_settings(request: Request) -> Settings:
    settings = request.app.state.settings
    if not isinstance(settings, Settings):  # pragma: no cover - defensive
        raise RuntimeError("application state carries no Settings instance")
    return settings
