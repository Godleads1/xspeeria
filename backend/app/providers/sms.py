"""SMS provider interface (ADR-025 §2).

**No real provider is connected.** Choosing and contracting one is a human decision, and the
project must not contact real systems without approval. Until then the application holds no
sender, and sign-up answers ``SYS_503_SERVICE_UNAVAILABLE``.

``DevConsoleSmsSender`` is for a developer's own computer only (ADR-027): it prints the code
to the server window so sign-up can be tried before a provider exists. The server refuses to
start with it outside ``APP_ENV=local``. It writes to the terminal directly, never through the
logging pipeline, so no log sink ever receives a code.

``RecordingSmsSender`` is for tests only: it keeps messages in memory so a test can read the
code it would have received. It must never be wired into a deployed environment.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from typing import Protocol, TextIO

__all__ = ["DevConsoleSmsSender", "RecordingSmsSender", "SentCode", "SmsSender"]


class SmsSender(Protocol):
    async def send_code(self, phone: str, code: str) -> None:
        """Deliver a verification code. Must not log the code or the full number."""
        ...


@dataclass(frozen=True)
class SentCode:
    phone: str
    code: str


@dataclass
class RecordingSmsSender:
    sent: list[SentCode] = field(default_factory=list)

    async def send_code(self, phone: str, code: str) -> None:
        self.sent.append(SentCode(phone=phone, code=code))

    def last_code_for(self, phone: str) -> str | None:
        for item in reversed(self.sent):
            if item.phone == phone:
                return item.code
        return None


class DevConsoleSmsSender:
    """Local development only (ADR-027). Prints the code to the server terminal."""

    def __init__(self, stream: TextIO | None = None) -> None:
        self._stream = stream

    async def send_code(self, phone: str, code: str) -> None:
        out = self._stream or sys.stderr
        masked = f"***{phone[-4:]}"
        out.write(f"\n[DEV SMS — local only] code for {masked}: {code}\n\n")
        out.flush()
