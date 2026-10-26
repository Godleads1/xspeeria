"""ADR-058 tier rules: limits, Lagos calendar periods, naira equivalent (exact, half to even)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.domain.tier_rules import LIMITS, day_start, month_start, naira_minor_of


def test_limits_match_the_owner_decision() -> None:
    assert LIMITS[0] is None
    assert (LIMITS[1].daily_minor, LIMITS[1].monthly_minor) == (50_000_000, 200_000_000)  # type: ignore[union-attr]
    assert LIMITS[3].monthly_minor == 10_000_000_000  # type: ignore[union-attr]


def test_days_and_months_are_lagos_calendar() -> None:
    late = datetime(2026, 10, 31, 23, 30, tzinfo=UTC)  # 00:30 on 1 November in Lagos
    assert day_start(late).isoformat() == "2026-11-01T00:00:00+01:00"
    assert month_start(late).isoformat() == "2026-11-01T00:00:00+01:00"
    early = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)
    assert month_start(early).isoformat() == "2026-10-01T00:00:00+01:00"


def test_naira_equivalent_is_exact() -> None:
    assert naira_minor_of("USD", 30_000, Decimal("1320.50")) == 39_615_000  # 300 USD
    assert naira_minor_of("NGN", 12_345, Decimal("1320")) == 12_345
    # 0.01 USD × 1,320.125 = NGN 13.20125 = 1,320.125 kobo → 1,320 (half to even).
    assert naira_minor_of("USD", 1, Decimal("1320.125")) == 1320
    assert naira_minor_of("USD", 1, Decimal("1320.135")) == 1320  # .135 kobo rounds down
    assert naira_minor_of("USD", 2, Decimal("1320.125")) == 2640  # exactly 2,640.25 → 2,640


def test_lagos_time_works_without_a_system_time_zone_database() -> None:
    """Windows has no built-in time-zone database; the ``tzdata`` package must supply it, or
    the server cannot start there (found 2026-10-26 on the owner's PC)."""
    import os
    import subprocess
    import sys
    from pathlib import Path

    backend_root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, "-c", "import app.domain.tier_rules as t; print(t.LAGOS)"],
        capture_output=True,
        text=True,
        check=False,
        # An empty search path is how Python behaves on Windows: only ``tzdata`` is left.
        env={**os.environ, "PYTHONPATH": str(backend_root), "PYTHONTZPATH": ""},
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "Africa/Lagos"
