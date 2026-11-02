"""Throwaway email domains are refused at sign-up (ADR-079).

The list is the public, CC0-licensed ``disposable-email-domains`` list, copied into the repo
at a pinned commit (``app/data/disposable_email_domains.txt``; the header names the commit).
It is read from disk once; nothing is fetched at run time. A subdomain of a listed domain
(``x.mailinator.com``) counts as listed.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

__all__ = ["is_disposable_email"]

_LIST = Path(__file__).resolve().parent.parent / "data" / "disposable_email_domains.txt"


@lru_cache(maxsize=1)
def _domains() -> frozenset[str]:
    lines = _LIST.read_text(encoding="utf-8").splitlines()
    return frozenset(
        s.strip().lower() for s in lines if s.strip() and not s.lstrip().startswith("#")
    )


def is_disposable_email(email: str) -> bool:
    """True when the address's domain, or any parent of it, is a known throwaway domain."""
    domain = email.rpartition("@")[2].strip().lower().rstrip(".")
    if not domain:
        return False
    listed = _domains()
    parts = domain.split(".")
    return any(".".join(parts[i:]) in listed for i in range(len(parts) - 1))
