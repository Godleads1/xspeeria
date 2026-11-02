# ADR-075 — Emergency Controls: Pause All Deals, Sign Everyone Out

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 (server, migration 0037, console) |
| **Decision ID** | DEC-082 |
| **Authority** | Product owner, 2026-11-02: *"do these"* (the "pause all deals" switch and "end every session" action from the incident plan's gaps), then chose: **"Freeze the clocks"** and **"Any Super Admin, reason required"**. Meets SEC-039's kill switch; used by the incident plan (ADR-074). |
| **Constraints** | Never moves money. Never cancels or expires anything by itself. Every use is audited and alerted. Super Admin only, checked on the server. |

## Decisions

1. **Pause all deals** (`deal_pauses`; at most one open). While paused:
   - **Refused** with `SYS_503_SERVICE_UNAVAILABLE` and details `{"reason": "deals_paused"}`, an existing catalogue identifier (no new code): posting, grouping or editing an offer; taking an offer; joining a waiting queue; choosing payout accounts; asking for more time to pay.
   - **Still allowed**, because they only reduce what's at stake: withdrawing an offer and leaving a queue.
   - **Clocks frozen**: nothing is expired, whether by a sweep or by a request. That covers payout-choice windows (ADR-035), escrow funding windows (ADR-021), queue turns (ADR-059), including the F-009 pass-on during a take.
   - **Bank commands held**: the outbox isn't sent, so no escrow opens, no payout and no return. Messages *from* the bank are still recorded.
   - The demo robots stop.
2. **Resume**, in one transaction, with the paused time added to every window still open:
   - each payout-choice deadline, with a staff audit entry `deal_window_extended` on the deal;
   - each funding deadline, with a `DeadlineExtended` settlement event;
   - each queue turn.

   The counts are kept on the pause. A window opened during the pause also gets the full paused time, erring on the customer's side.
3. **Sign everyone out**:
   - all customers (`auth_sessions.revoke_reason = 'incident'`), all other staff, or both. The Super Admin doing it stays signed in.
   - Trusted phones stay trusted, and the PIN is still needed to sign in again.
4. **Who and record:**
   - any Super Admin, with a reason of 5–500 characters;
   - audit actions `deals_paused`, `deals_resumed`, `sessions_ended`;
   - the alert rules raise a **P1** `emergency_control_used` alert for each use (ADR-074).
5. **Console**: System Health › Emergency controls, shown to Super Admins only. It has pause/resume with a reason, "Sign out" for a chosen group, and the current state (who paused, when, why, and the time given back last time).

## Evidence

- `backend/tests/integration/test_deal_pause.py`:
  - pause refuses new offers, nothing expires while paused, and resume gives exactly the paused time back with an event;
  - bank commands are held while paused and sent after resume;
  - Super Admin only, reason required, no double pause, no resume without a pause;
  - sign everyone out ends customer and other staff sessions but not the caller's (reason `incident`);
  - each use raises a P1 alert emailed to Super Admins.
- `admin/__tests__/emergency.test.tsx`: pause, resume, sign out a chosen group, hidden from other roles.
