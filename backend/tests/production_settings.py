"""Settings every production app needs (ADR-081: Super Admin security keys are required)."""

from __future__ import annotations

__all__ = ["PRODUCTION_KEYS"]

PRODUCTION_KEYS: dict[str, object] = {
    "super_admin_key_required": True,
    "staff_key_rp_id": "admin.xspeeria.test",
    "staff_key_origin": "https://admin.xspeeria.test",
}
