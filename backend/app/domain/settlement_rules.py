"""Escrow settlement rules — ADR-001, ADR-002, ADR-021, ADR-037. Pure: no I/O, no clock.

Xspeeria never holds money. Each side pays into a partner bank's escrow in its own country;
the bank pays out from escrow to the other side's chosen accounts. These rules decide what may
happen next; money facts themselves (FUNDED, PAID_OUT, RETURNED) come only from signed partner
evidence (ADR-001 §4, F-6).
"""

from __future__ import annotations

from datetime import timedelta

__all__ = [
    "DISPATCH_MAX_ATTEMPTS",
    "FUNDING_EXTENSION",
    "FUNDING_WINDOW",
    "JURISDICTION",
    "LEG_STATES",
    "LEG_TRANSITIONS",
    "MONEY_FACTS",
    "PARTNER_VOCABULARY",
    "PHASES",
    "PHASE_TRANSITIONS",
    "REPLAY_WINDOW",
    "TERMINAL_PHASES",
]

#: ADR-021 §1: each side pays a fee on what it sends, in that currency, on top. How much:
#: ``app.domain.fee_rules`` (ADR-098, the Xspeeria Fair Fee; replaced the flat 1%).
#: ADR-021 §2 (product owner, confirmed 2026-10-19: "Keep 5 minutes").
FUNDING_WINDOW = timedelta(minutes=5)
#: ADR-059 Decision 4 (product owner, 2026-10-21): the taker may ask once for 5 more minutes.
FUNDING_EXTENSION = timedelta(minutes=5)
#: Banking spec §5.3: partner timestamps outside ±5 minutes are replay-suspected.
REPLAY_WINDOW = timedelta(minutes=5)
#: PROPOSED (ADR-037): dispatch attempts before a DISPATCH_FAILURE hold (ADR-001 §6c says "N").
DISPATCH_MAX_ATTEMPTS = 5

#: Each leg is domestic (F-8): its currency fixes its jurisdiction. EUR has no single
#: jurisdiction or approved payout form, so EUR deals cannot settle yet (fail closed).
JURISDICTION: dict[str, str] = {"NGN": "NG", "USD": "US", "GBP": "GB"}

#: ADR-001 §4 — 9 leg states and their only allowed transitions.
LEG_STATES = (
    "PENDING",
    "ESCROW_PROVISIONED",
    "FUNDED",
    "RELEASE_SENT",
    "PAID_OUT",
    "RETURN_SENT",
    "RETURNED",
    "PROVISION_FAILED",
    "PAYOUT_FAILED",
)
LEG_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("PENDING", "ESCROW_PROVISIONED"),
        ("ESCROW_PROVISIONED", "FUNDED"),
        ("FUNDED", "RELEASE_SENT"),
        ("RELEASE_SENT", "PAID_OUT"),
        ("PENDING", "PROVISION_FAILED"),
        ("RELEASE_SENT", "PAYOUT_FAILED"),
        ("PAYOUT_FAILED", "RELEASE_SENT"),
        ("PAYOUT_FAILED", "RETURN_SENT"),
        ("FUNDED", "RETURN_SENT"),
        ("RETURN_SENT", "RETURNED"),
    }
)
#: Only a signature-verified, in-window partner webhook may set these (F-6, F-7).
MONEY_FACTS = frozenset({"FUNDED", "PAID_OUT", "RETURNED"})

#: ADR-001 §5 — 10 phases; 13 forward-only transitions (§5.1).
PHASES = (
    "INITIALIZING",
    "AWAITING_FUNDING",
    "RELEASING",
    "COMPLETED",
    "UNWINDING",
    "CLOSED_UNWOUND",
    "RECOVERY_REQUIRED",
    "CLOSED_RECOVERED",
    "CLOSED_WITH_LOSS",
    "CANCELLED",
)
PHASE_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("INITIALIZING", "AWAITING_FUNDING"),
        ("INITIALIZING", "CANCELLED"),
        ("AWAITING_FUNDING", "RELEASING"),
        ("AWAITING_FUNDING", "UNWINDING"),
        ("AWAITING_FUNDING", "CANCELLED"),
        ("RELEASING", "COMPLETED"),
        ("RELEASING", "UNWINDING"),
        ("RELEASING", "RECOVERY_REQUIRED"),
        ("UNWINDING", "CLOSED_UNWOUND"),
        ("UNWINDING", "RECOVERY_REQUIRED"),
        ("RECOVERY_REQUIRED", "CLOSED_RECOVERED"),
        ("RECOVERY_REQUIRED", "CLOSED_WITH_LOSS"),
    }
)
TERMINAL_PHASES = frozenset(
    {"COMPLETED", "CLOSED_UNWOUND", "CLOSED_RECOVERED", "CLOSED_WITH_LOSS", "CANCELLED"}
)

#: ADR-001 §8 — partner vocabulary → canonical leg state, for the money facts the webhook
#: carries. Acknowledgements (provisioned, release/return sent) arrive as the partner's
#: synchronous command response, not as money facts.
PARTNER_VOCABULARY: dict[str, str] = {
    "verified": "FUNDED",
    "completed": "PAID_OUT",
    "reversed": "RETURNED",
    "failed": "PAYOUT_FAILED",
}


def reversal_problem(phase: str, release_authorized: bool, leg_states: list[str]) -> str | None:
    """ADR-065: why staff cannot return this deal's escrow now, or ``None`` if they can.

    Only money still sitting in escrow can go back: the deal is waiting for funding, the payout
    has not been authorised, at least one escrow is funded and nothing has been sent out.
    """
    if phase != "AWAITING_FUNDING" or release_authorized:
        return "closed"
    if any(s in ("RELEASE_SENT", "PAID_OUT", "RETURN_SENT", "RETURNED") for s in leg_states):
        return "closed"
    if not any(s == "FUNDED" for s in leg_states):
        return "nothing_paid_in"
    return None
