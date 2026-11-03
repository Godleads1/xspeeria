# ADR-097 — Totals of Completed Deals, in History Only

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-109 |
| **Authority** | Owner, 2026-11-03, asked to show real figures on Home and Cards. That conflicts with the approved rule that Home shows **no aggregate currency figure** (`UI_UX_SCREEN_SPEC.md`, Account Readiness; `CORRECTIONS_v3.md` §9.7; `no-balance.test.ts`). The conflict was reported, and the owner chose **"Totals in History"**: Home stays as approved, and Cards stays a card preview. |

## Decision

- **Where:** History, at the top, in server builds. It shows the number of completed deals, then **received** and **sent** per currency (for example "USD 150.25"), with the note *"Deal history, not money held by Xspeeria. Fees are not included."*
- **What counts:** deals whose escrow is **completed** only. Deals in progress, cancelled or refunded are left out. A malformed row is skipped, never guessed.
- **What I send** is the other side of the pair from what I receive (`you_receive_currency`); the server supplies both amounts.
- **No floats:** amounts are turned from decimal text into integer minor units (`toMinor`) and added with an overflow check.
- **When it shows:** nothing appears before the first completed deal, and nothing in the demo.
- **Unchanged:**
  - Home: rates, recent deals and readiness; no total anywhere.
  - Cards: card designs, "not available".
  - Real balances need a ledger, which waits for the partner bank (P-1/P-2).

## Evidence

- `mobile/__tests__/deal-totals.test.tsx` (5 tests):
  - completed deals only, per currency;
  - selling and buying sides;
  - malformed rows skipped;
  - none before a first deal;
  - History shows the card and its note, and hides it otherwise.
- `no-balance.test.ts` still passes.
- Translations in all app languages.
- Full app suite: 721 passed.
