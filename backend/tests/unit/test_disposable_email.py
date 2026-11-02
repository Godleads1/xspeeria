"""ADR-079: throwaway email domains are refused at sign-up."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.domain.disposable_email import _LIST, is_disposable_email


@pytest.mark.parametrize(
    "email",
    [
        "a@mailinator.com",
        "a@10minutemail.com",
        "A@GuerrillaMail.com",
        "a@x.yopmail.com",
        "a@mailinator.com.",
    ],
)
def test_throwaway_domains_are_refused(email: str) -> None:
    assert is_disposable_email(email)


@pytest.mark.parametrize(
    "email",
    [
        "a@gmail.com",
        "a@yahoo.com",
        "a@outlook.com",
        "a@icloud.com",
        "a@proton.me",
        "a@company.ng",
        "a@co.uk",
        "",
        "nope",
    ],
)
def test_real_providers_are_accepted(email: str) -> None:
    assert not is_disposable_email(email)


def test_the_list_is_the_pinned_public_copy() -> None:
    text = Path(_LIST).read_text(encoding="utf-8")
    assert "Commit: fe48a3092fd7749893732f1c089730acccd78817" in text
    assert "CC0" in text
    domains = [x for x in text.splitlines() if x and not x.startswith("#")]
    assert len(domains) > 5000
    assert all(d == d.strip().lower() and "." in d and "@" not in d for d in domains)
    # Mainstream providers must never be in it.
    assert not {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"} & set(domains)
