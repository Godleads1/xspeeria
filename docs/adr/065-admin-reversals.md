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
3. **Asking pauses the payout.** The request opens a blocking `REVERSAL` settlement hold, so the deal cannot pay out while it waits, even if both sides pay in. Only one request can wait per deal (unique index). **The dispute cannot be closed while a refund waits** (409 `RES_409_REFUND_PENDING`; the console hides Close). This way a closed case and a refund can never contradict each other. The funding clock also treats a `REVERSAL` hold like an open dispute and leaves the deal for staff, which guards against a hold left open by mistake.
4. **Approving (`reversals.approve`).** Another staff member approves. **The person who asked can never approve**, which is checked in three places:
   - the server returns 403 `AUTH_403_OWN_REQUEST`;
   - a database CHECK refuses it;
   - the console hides the buttons from the person who asked.

   In one transaction, the server:
   - checks the deal again;
   - records a `ReversalApproved` settlement event carrying the reversal id and the approver;
   - moves the settlement `AWAITING_FUNDING → UNWINDING` (ADR-001 transition 5, now also started by an approved staff decision);
   - queues a `RETURN` command to the bank for each funded escrow;
   - closes the hold.

   When every return is confirmed, the settlement closes as `CLOSED_UNWOUND` with the new reason **`REVERSED`**, and the deal's amount goes back on the offer.
5. **Rejecting** needs a reason. It closes the hold, and the deal continues under its own rules: it pays out if both sides paid in.
6. **Decided once.** A database trigger enforces the request's lifecycle:
   - a new row must start as `pending`;
   - it must point at its own `REVERSAL` hold on the same settlement;
   - once approved or rejected it cannot change, and the request itself can never be rewritten.

   The app role cannot delete requests. Every step is in the staff audit log, on both the reversal and the dispute's timeline.
7. **Fix to ADR-063.** Closing a dispute when both sides had paid in was meant to let the escrow "continue under its own rules", but nothing re-checked the deal. Now closing a dispute, or rejecting a refund, re-checks it straight away: if both sides paid in and nothing else holds it, it pays out (ADR-063 decision 4). The funding sweep itself is **unchanged**. An earlier draft also made it pay out late fully funded deals; an independent review pointed out that this went beyond the owner's decision, so it was dropped.
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
- Idempotency keys on request, approve and reject. A retry gets a 409 from the current state; no money can move twice.
- Approval ignores other open holds (`RECONCILIATION`, `RISK`). Money on an escrow that never reached `FUNDED` is not part of the reversal and stays with reconciliation.

## Evidence

- `backend/tests/integration/test_admin_reversals.py`:
  - approved by someone else, and both escrows returned in full (`REVERSED`, offer amount restored, audit entries, decided-once trigger);
  - a rejected refund pays out;
  - a dispute closed after both paid pays out even after the window;
  - a dispute can't be closed while a refund waits;
  - money paid in after approval goes back too;
  - the requester can neither approve nor reject, which the database also refuses;
  - a request can't be rewritten, inserted already decided, or attached to another hold;
  - validation and access;
  - the app role cannot delete.
- `backend/tests/unit/test_reversal_rules.py`: the eligibility rule.
- An independent financial review (2026-10-26) found nothing critical or high. Its two medium points (the sweep change, and contradicting decisions) and low points (a ledger link, an insert guard) were fixed.
- `admin/__tests__/reversals.test.tsx`: the list (real money, no AI or risk columns), approve, reject needs a reason, the person who asked sees no buttons, Process Refund asks with a reason and has no amount box.
- Browser check: light, dark and Arabic.
