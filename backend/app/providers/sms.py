"""SMS provider interface (ADR-025 §2).

**No real provider is connected.** Choosing and contracting one is a human decision, and the
project must not contact real systems without approval. Until then the application holds no
sender, and sign-up answers ``SYS_503_SERVICE_UNAVAILABLE``.

``RecordingSmsSender`` is for tests only: it keeps messages in memory so a test can read the
code it would have received. It must never be wired into a deployed environment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

__all__ = ["RecordingSmsSender", "SentCode", "SmsSender"]


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
