# ADR-014 — Confirm-Trade Flow (Demo)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-020 |
| **Authority** | Product owner, 2026-10-17: "ok. start" on the recommended confirm-trade flow (Figma 120:990 → 190:1791) — `DOCUMENT_INDEX.md` §1 rank 2 |

> **SUPERSEDED 2026-10-17 (product owner):** the coordination fee is now **1% of the money
> each side sends**, in that side's currency, not a flat fee
> (`docs/adr/021-percentage-fee-and-split-payouts.md`). Totals include the 1% fee.

## 1. Flow

| Step | Figma | Implementation |
|---|---|---|
| Select Match → tap a match | 106:1150 | Opens **Confirm trade** sheet (added, see §3) |
| Confirm trade: amount, rate, fee, total, payout account | — | `ConfirmTradeSheet` |
| 2 FA re-check before accepting | — | `requestStepUp` (ADR-008) |
| Transaction In Progress: note box, transfer details, countdown, Request Extension / I Have Paid, progress | 120:990, 189:1429 | `/trade/[id]` |
| Confirming payment → Payment received | 122:1602, 122:1773, 124:1243 | same screen, by phase |
| Transaction Completed: View Receipt, rating, feedback | 124:1408 | same screen, completed phase |
| Receipt | 190:1791 | existing History receipt (ADR-006); trades now appear in History |

Phases (user level of ADR-001): awaiting payment → confirming → awaiting counterparty →
releasing → completed; or expired / cancelled. Money is integer minor units; the buyer
transfers `amount × rate` (half to even since `docs/adr/019-review-decisions-and-multi-offer-fill.md`; BigInt) **plus** the flat coordination fee, matching the
receipt. Cancelling is allowed only before "I have paid".

## 2. Rules that mirror the server

- Accepting needs a 2 FA re-check (ADR-008); if it fails nothing is created.
- Payouts go only to the user's **own, verified** account in the currency they receive
  (Banking spec §3.3; ALLOCATION_FUNDING_READY). Without one, Accept is disabled and the
  sheet offers "Add account".
- If the selected listings fill less than requested, the sheet says so; each part's amount
  was picked explicitly on Select Match, and the store refuses any amount over what a
  listing has left (no silent resize). Several listings can fill one request — see
  `docs/adr/019-review-decisions-and-multi-offer-fill.md` §3.
- "I have paid" asks for confirmation that the exact amount was sent from an account in
  the user's name. Paying after the window is refused; the trade expires.
- One extension per trade.

## 3. Deviations from Figma

| Figma | Implementation | Why |
|---|---|---|
| Tap a match → straight to Transaction In Progress | Confirm sheet first, then 2 FA | FAQ promises the fee is shown before confirming; ADR-008 step-up |
| "Partnering Bank 0123456789" | "Partner bank (demo)", `00 0000 0000`, and a "do not send real money" note | A real-looking number could receive real money |
| "Transfer NGN 1,678,978.00" vs Select Match "127,159.00" (inconsistent) | Computed from the chosen match | Figures must add up |
| Wallet icon on Transaction Completed | Green check | No-wallet rule |
| "Payment confirmation takes approximately 5:00 mins" | "usually takes a few minutes" | Timing depends on the partner bank |
| Progress labels (component) | Figma's labels plus "Partner bank released the funds" and "Paid to your account ending ####" | Shows the payout step, last 4 digits only |

## 4. Demo mode

No partner bank or counterparty exists. After "I have paid" the bank's steps advance every
3 s, and an extension is approved after 3 s; the screen says it is a demo. Trades live in
memory (reload clears them).

## 5. Open (must not be assumed)

- Funding window and extension length/policy (Figma 5 min + 5 min; Appendix D: configurable, TBD).
- How the coordination fee is charged on the foreign-currency side, and after a counterparty
  timeout (ADR-001 U-1, Appendix D: TBD Product/Legal). Sell side: see ADR-015 (fee in the sent currency, to be confirmed).
- Disputes ("Raise a dispute") and what happens if a payment arrives after expiry.
- Market lists USD/CAD/EUR/AUD while the approved corridors are NGN⇄GBP then NGN⇄USD (ADR-005).
