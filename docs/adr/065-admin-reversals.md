# ADR-065 — Admin Reversals: Return Escrow to the Payer, Approved by a Second Person

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-26 (server, migration 0027, console) |
| **Decision ID** | DEC-072 |
| **Authority** | Product owner, 2026-10-26. Asked "Reversals: when staff approve a refund, what should actually happen?", the owner answered **"Return escrow to payer"**. Builds on ADR-051 decision 4 (one approver with the Approve permission, never on their own request), ADR-001 (state machine), ADR-037 (escrow returned in full, fee included), ADR-063 (disputes) and the Figma "Reversal", "Reversal Details" and "Process Refund" frames. |
| **Constraints** | ADR-001 and ADR-002: Xspeeria never holds or moves money; the partner bank returns it. SEC-008: separation of duties. Standing Standards: no floats for money, auditable and idempotent financial changes. Simulation only until a real partner is approved. |

## Decisions

1. **What a reversal is.** It sends money that is **still in escrow, before any payout**, back to whoever paid it in, in full with the fee included. It applies only when:
   - the deal is `AWAITING_FUNDING`;
   - the payout has not been authorised;
   - at least one escrow is `FUNDED`;
   - nothing has been sent out.

   A refund after money has been paid out is **not** possible here. That would be recovery (ADR-001 transitions 8 and 11–13), which has no approved rules yet.
2. **Where it starts.** "Process Refund" on a dispute case (permission `reversals.create`) takes a reason. Figma's amount box is left out because the escrow goes back in full; there is no partial refund.
3. **Asking pauses the payout.** The request opens a blocking `REVERSAL` settlement hold. While it waits:
   - the deal cannot pay out, even if both sides pay in or the dispute is closed;
   - the funding clock cannot close the deal (staff decide, as with an open dispute).

   Only one request can wait per deal (unique index).
4. **Approving (`reversals.approve`).** Another staff member approves. **The person who asked can never approve**, which is checked in three places:
   - the server returns 403 `AUTH_403_OWN_REQUEST`;
   - a database CHECK refuses it;
   - the console hides the buttons from the person who asked.

   In one transaction, the server:
   - checks the deal again;
   - records a `ReversalApproved` settlement event;
   - moves the settlement `AWAITING_FUNDING → UNWINDING` (ADR-001 transition 5, now also started by an approved staff decision);
   - queues a `RETURN` command to the bank for each funded escrow;
   - closes the hold.

   When every return is confirmed, the settlement closes as `CLOSED_UNWOUND` with the new reason **`REVERSED`**, and the deal's amount goes back on the offer.
5. **Rejecting** needs a reason. It closes the hold, and the deal continues under its own rules: it pays out if both sides paid in.
6. **Decided once.** A database trigger refuses any change to a request after approval or rejection, or any rewrite of the request itself. The app role cannot delete requests. Every step is in the staff audit log, on both the reversal and the dispute's timeline.
7. **Fix to ADR-063.** Closing a dispute when both sides had paid in was meant to let the escrow "continue under its own rules". In practice nothing re-checked the deal, and after the funding window passed the clock would have **returned** the money instead of paying it out. Now:
   - closing a dispute and rejecting a refund both re-check the deal straight away;
   - the funding sweep pays out a fully funded deal whose gates hold, rather than unwinding it.
8. **Design corrections to Figma:**
   - no "AI Flagged Issues" tile and no "Risk Level" column, because nothing computes them (ADR-061, ADR-064);
   - "Initiated by" is always a staff member, because no system-started reversals exist yet;
   - no account number or bank name: the money goes back to the account it came from (ADR-051: last 4 digits only, if ever);
   - "Resolved Reversals" becomes "Approved Reversals" and "Rejected Reversals";
   - "had been approved" is corrected to "has been approved".

## Not built

- System-started reversals (ADR-051 says these need one approver).
- Refunds after payout (recovery).
- Partial refunds.
- Notifications that name a reversal: the parties are already told about `UNWINDING` through the existing settlement notifications.

## Evidence

- `backend/tests/integration/test_admin_reversals.py`:
  - approved by someone else, and both escrows returned in full (`REVERSED`, offer amount restored, audit entries, decided-once trigger);
  - a rejected refund pays out;
  - a dispute closed after both paid pays out even after the window;
  - a pending refund stops the clock;
  - validation and access;
  - the app role cannot delete.
- `admin/__tests__/reversals.test.tsx`: the list (real money, no AI or risk columns), approve, reject needs a reason, the person who asked sees no buttons, Process Refund asks with a reason and has no amount box.
- Browser check: light, dark and Arabic.
