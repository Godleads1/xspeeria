"""Demo data (owner 2026-10-27): only on a developer's computer, clearly fake."""

from __future__ import annotations

import asyncio

import pytest

from app.cli import seed_demo
from app.core.config import Settings
from app.domain.auth_rules import normalise_phone, pin_problem
from app.domain.staff_rules import password_problem


def test_refused_outside_a_developer_computer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        seed_demo,
        "get_settings",
        lambda: Settings(_env_file=None, app_env="staging"),  # type: ignore[call-arg]
    )
    with pytest.raises(SystemExit, match="APP_ENV=local only"):
        asyncio.run(seed_demo.seed())


def test_demo_values_pass_the_real_rules_and_look_fake() -> None:
    assert pin_problem(seed_demo.DEMO_PIN) is None
    for email, _, _ in seed_demo.STAFF:
        assert email.endswith("@example.com")
        assert password_problem(seed_demo.DEMO_STAFF_PASSWORD, email=email) is None
    for c in seed_demo.CUSTOMERS:
        assert c.email.endswith("@example.com") and normalise_phone(c.phone) == c.phone
        # Every verified demo customer can receive naira and at least one foreign currency,
        # so any demo deal between them can be finished.
        if c.checks:
            currencies = {a[0] for a in c.accounts}
            assert "NGN" in currencies and currencies - {"NGN"}


def test_robots_are_ben_and_chloe_and_you_play_the_others() -> None:
    from app.services.demo_autopilot import bot_phones

    robots = {c.key for c in seed_demo.CUSTOMERS if c.robot}
    assert robots == {"ben", "chloe"}
    assert set(bot_phones()) == {c.phone for c in seed_demo.CUSTOMERS if c.robot}
    # Ada and Dan are for the person testing: no standing offers of their own.
    assert all(not c.offers for c in seed_demo.CUSTOMERS if not c.robot)


def test_autopilot_only_on_a_developer_computer() -> None:
    from app.main import build_auth_runtime

    build_auth_runtime(Settings(_env_file=None, demo_autopilot=True))  # type: ignore[call-arg]
    with pytest.raises(ValueError, match="DEMO_AUTOPILOT"):
        build_auth_runtime(
            Settings(_env_file=None, demo_autopilot=True, app_env="staging")  # type: ignore[call-arg]
        )


def test_amount_text_keeps_the_currency_scale() -> None:
    from app.services.demo_autopilot import _minor_to_text

    assert _minor_to_text(10_000_000, 2) == "100000.00"
    assert _minor_to_text(4005, 2) == "40.05"
