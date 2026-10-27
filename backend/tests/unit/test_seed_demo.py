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
