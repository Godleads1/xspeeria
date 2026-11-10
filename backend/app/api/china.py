"""The China switch (ADR-105): yuan and identity checks for China stay off until legal clearance.

The owner chose to build China now and keep it switched off (2026-11-10). With
``CHINA_ENABLED=false`` the server refuses every way in: new offers or buy requests in yuan,
yuan payout accounts and identity checks for China. The yuan ceiling is hidden too, which is
how the app knows to hide China.
"""

from __future__ import annotations

from fastapi import status

from app.core.config import Settings
from app.core.exceptions import AppError

__all__ = ["refuse_china_if_off"]


def refuse_china_if_off(settings: Settings, *codes: str | None) -> None:
    """403 when China is off and any of ``codes`` is CNY or CN."""
    if settings.china_enabled:
        return
    if any((c or "").upper() in ("CNY", "CN") for c in codes):
        raise AppError(
            "BUS_403_NOT_AVAILABLE",
            "China and the yuan aren't available yet.",
            status_code=status.HTTP_403_FORBIDDEN,
        )
