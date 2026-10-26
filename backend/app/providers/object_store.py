"""Where photos are kept (ADR-049, ADR-060).

Photos are never stored in PostgreSQL. The approved home is a **private Cloudflare R2
bucket**; its client is added when the owner creates the Cloudflare account and bucket (the
connection must be tried against the real bucket, so it is not written blind). Until then:

* ``LocalFolderStore`` — a developer's own computer only (``APP_ENV=local``): files in a
  folder next to the project. The server refuses to use it anywhere else.
* No store at all — photo uploads answer "not available yet".

Object keys are made by the server (random hex), never taken from a request.
"""

from __future__ import annotations

import re
import secrets
from pathlib import Path
from typing import Protocol

__all__ = ["LocalFolderStore", "ObjectStore", "new_key"]

_KEY = re.compile(r"^[a-z]+/[0-9a-f]{32}$")


def new_key(prefix: str) -> str:
    return f"{prefix}/{secrets.token_hex(16)}"


class ObjectStore(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes | None: ...

    def delete(self, key: str) -> None: ...


class LocalFolderStore:
    """Local development only. Keys are checked, so no path can leave the folder."""

    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        if not _KEY.fullmatch(key):
            raise ValueError("bad object key")
        return self._root / key

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)
