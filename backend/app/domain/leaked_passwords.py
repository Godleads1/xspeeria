"""Staff passwords found in public leaked-password lists are refused (security check 9).

The list is built from three public lists in SecLists (MIT licence, fetched 23 Nov 2026):
``100k-most-used-passwords-NCSC.txt``, ``Pwdb_top-1000000.txt`` and ``rockyou-75.txt``. Only
entries of 12 to 128 characters are kept, because shorter ones are already refused by length;
they are lower-cased and stored gzipped in ``app/data/leaked_passwords_12plus.txt.gz``
(30,447 entries). It is read from disk once; nothing is fetched at run time and no password is
sent anywhere. The comparison ignores case, so "Password1234" counts as "password1234".
"""

from __future__ import annotations

import gzip
from functools import lru_cache
from pathlib import Path

__all__ = ["is_leaked_password"]

_LIST = Path(__file__).resolve().parent.parent / "data" / "leaked_passwords_12plus.txt.gz"


@lru_cache(maxsize=1)
def _leaked() -> frozenset[str]:
    with gzip.open(_LIST, "rt", encoding="utf-8") as f:
        return frozenset(line.rstrip("\n") for line in f if line.strip())


def is_leaked_password(password: str) -> bool:
    return password.lower() in _leaked()
