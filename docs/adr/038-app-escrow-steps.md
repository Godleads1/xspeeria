# ADR-038 — App: Escrow Steps on a Deal

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — 2026-10-19 (screen layout; no Figma frame exists yet) |
| **Decision ID** | DEC-045 |
| **Authority** | Product owner, 2026-10-19: **"App escrow screens (Recommended)"**. Builds on ADR-037 (server escrow, simulation only) and DEC-044 (payout at once). |

## What the app does (server builds only)

- **My Deals**: a deal where both sides chose payout accounts shows **Escrow steps**.
- **Escrow screen** (`/market/escrow?match=…`; the id is untrusted, checked as a UUID and by the server):
  - a status line in plain words for every phase (pay, paid and waiting, both paid, done, cancelled, refunded in full incl. fee, paused for a check);
  - **You pay into escrow**: amount, Xspeeria fee (1%), total — as decimal strings from the server, never floats;
  - the bank's escrow account, account name and reference while the 5-minute window is open (this is the bank's escrow account for this deal, not a user's account, so it is shown in full);
  - a **m:ss countdown**; four steps ticked only from bank-confirmed states;
  - it re-reads the server every 3 seconds until the deal is finished.
- **Simulate my transfer**: shown only when the server says the bank is pretend (`simulated`) and the window is open. It calls the dev-only route, which goes through the pretend bank's signed message. A "Pretend bank — no real money moves" line is always shown in that mode.
- Copy across the app no longer mentions a 24-hour payout hold (DEC-044).

## Not built

Copy-to-clipboard buttons; push notifications when the other side pays; a History entry for
escrow steps; any real-bank pay-in method.

## Evidence

`mobile/__tests__/escrow.test.tsx` (wording for every phase, countdown, no balance/wallet words,
steps, simulate, refusal, polling, load error, My Deals link). Browser run against the real
server with the pretend bank: two accounts, offer, take, payout choice, both pay in, both see
**Done** (seller paid 202.00 USD incl. fee, buyer 266,741.00 NGN incl. fee).
