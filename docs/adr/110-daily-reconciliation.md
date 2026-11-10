# ADR-110 — Daily Reconciliation of Each Deal's Money In and Out

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED (server)** — 2026-11-10 |
| **Decision ID** | DEC-122 |
| **Authority** | Owner, 2026-11-10: "Daily reconciliation: check that each deal's money in matches its money out." |
| **Builds on** | ADR-001/002 (settlement and evidence), ADR-037 (partner messages), ADR-065 (recovery), ADR-074 (operations alerts). |

## Decision

Once a day, the worker checks every deal that finished in the last two days. A missed day is covered.

**What "money" means here:** the amounts in the partner bank's **signed confirmations**, in each escrow's currency (`EscrowFunded`, `PayoutConfirmed`, `EscrowReturned`). Xspeeria never holds money.

**Completed deals.** For each escrow:
- it received the amount plus the 1% fee;
- it paid out exactly the amount;
- it returned nothing;
- the payout accounts chosen add up to the amount.

What stays is the fee.

**Cancelled or unwound deals.**
- An escrow that received money returned all of it, amount plus fee, and paid out nothing.
- An escrow that received nothing paid nothing and was never marked funded.

A confirmation in the wrong currency, or with an unreadable amount, is a finding too.

**Every difference** becomes a **reconciliation exception** (`AMOUNT_MISMATCH` or `STATE_MISMATCH`, starting "Daily check:"). It also raises a **P1 alert** (`books_mismatch`) for Super Admins, by email and in the console. Nothing is changed or fixed automatically (L-22): a person decides.

**Running it again is safe:** while an exception is still open, the same finding on the same deal and escrow is not opened again. Once staff resolve it, a deal that is still wrong is opened again.

**Not judged here:** deals staff closed through recovery (`CLOSED_RECOVERED`, `CLOSED_WITH_LOSS`). Those are a person's decision with their own records (ADR-065).

**Settings and records:**
- `RECONCILIATION_SECONDS`: 86,400 by default; 0 turns it off. The first run is about 5 minutes after start-up.
- The job appears on System health as "Deal reconciliation" (ADR-072).

## Not verified

- **Partner statement:** comparing these records with the **partner bank's own statement** needs the partner's statement format and access. `UNKNOWN — NOT VERIFIED` until a partner bank is chosen. Today the check proves Xspeeria's records add up; it cannot prove the bank's do.

## Evidence

- `backend/tests/integration/test_reconciliation.py` (5 tests, real deals through the pretend bank):
  - a completed deal reconciles;
  - an extra payout is found once, with the expected and recorded figures, and raises one P1 alert;
  - resolving it lets a still-wrong deal be found again;
  - a one-sided payment returned in full reconciles;
  - money recorded on a cancelled deal and not returned is found;
  - the daily run looks back two days, and a full run looks at all deals.
- `backend/tests/unit/test_background_worker.py`: "deal reconciliation" runs in the worker.
