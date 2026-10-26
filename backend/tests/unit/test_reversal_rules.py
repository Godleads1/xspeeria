"""ADR-065: when staff can return a deal's escrow (pure rule)."""

from app.domain.settlement_rules import reversal_problem


def test_only_money_still_in_escrow_before_any_payout_can_go_back() -> None:
    assert reversal_problem("AWAITING_FUNDING", False, ["FUNDED", "ESCROW_PROVISIONED"]) is None
    assert reversal_problem("AWAITING_FUNDING", False, ["FUNDED", "FUNDED"]) is None
    assert (
        reversal_problem("AWAITING_FUNDING", False, ["ESCROW_PROVISIONED"] * 2) == "nothing_paid_in"
    )
    assert reversal_problem("AWAITING_FUNDING", True, ["FUNDED", "FUNDED"]) == "closed"
    for phase in (
        "RELEASING",
        "COMPLETED",
        "UNWINDING",
        "CLOSED_UNWOUND",
        "CANCELLED",
        "INITIALIZING",
    ):
        assert reversal_problem(phase, False, ["FUNDED", "FUNDED"]) == "closed"
    for sent in ("RELEASE_SENT", "PAID_OUT", "RETURN_SENT", "RETURNED"):
        assert reversal_problem("AWAITING_FUNDING", False, ["FUNDED", sent]) == "closed"
