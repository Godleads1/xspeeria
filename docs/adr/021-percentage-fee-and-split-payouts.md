# ADR-021 — 1% Coordination Fee, Per-Trade Funding Windows, Split Payouts

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-027 |
| **Authority** | Product owner, 2026-10-17: "1. each will pay 1% of the money 2. yes its own 5 minutes window 3. each user can provide more than one payout account and the amount that should be paid to those account. the partnering bank having collected the money using an escrow account will be the one to pay into the payout accounts and confirmation is sent to all parties when the money have been paid"; then, asked about the conflict with the Business Plan, chose **"1% replaces flat fee"** — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Supersedes** | The flat coordination fee of `docs/00-source-of-truth/00_5-Year_Business_Plan_SOURCE_OF_TRUTH.md` §5, `docs/01-business/01_Business_Requirements_Specification.md` ASSUMPTION-BRS-04 / §11.2, `docs/13-governance/CORRECTIONS_v3.md` §2, and the fee parts of `docs/adr/006-history-screens.md`, `docs/adr/009-referral-reward.md`, `docs/adr/014-confirm-trade-flow.md`, `docs/adr/015-sell-flow.md` |

## 1. Coordination fee: 1% of what each side sends

- Each side pays **1% of the money it sends**, in the currency it sends, on top of that
  amount, into the partner bank's escrow. Buyer: 1% of the NGN amount, in NGN. Seller: 1% of
  the foreign amount, in that currency (this settles the seller fee left open by ADR-015).
- Per **trade**: a multi-offer order of four trades pays 1% on each trade, which is the same
  1% of the order total.
- Integer basis points (`COORDINATION_FEE_BPS = 100`), BigInt, rounded **half to even**
  (`docs/adr/019-review-decisions-and-multi-offer-fill.md` §2). Example: ₦265,000.00 → fee
  ₦2,650.00; total to transfer ₦267,650.00.
- Shown before confirming, on the trade screen, and on the receipt as recorded at the time.
- The referral discount (ADR-009) stays: 10% off this fee.
- No minimum or maximum fee is set (none was given). The server computes the
  authoritative fee.
  **Confirmed by the owner, 2026-11-08:** the fee stays a flat 1%, with no minimum, no
  maximum, no lower rate on large amounts and no discount for the side that posted the offer.
  A banded "Fair Fee" was proposed and built (PR #121) and then turned down: "for the
  transaction fee, it is 1%" → "Flat 1%, nothing else".

**Business consequence (recorded, not decided here):** the Business Plan's §5.3 claim that a
flat fee is "structurally cheaper" than percentage-margin competitors such as LemFi no longer
holds; at 1% per side, each side's fee equals the top of a 0.5–2.0% competitor margin range
on that side. Investor and board materials that repeat the flat-fee position need updating.

## 2. Funding windows

Each trade keeps **its own 5-minute window** (unchanged behaviour), including each trade of a
multi-offer order. The window length remains configurable policy (Appendix D).

## 3. Split payouts

- A user may name **more than one of their own payout accounts** and the **amount** each
  gets. Amounts must be positive and add up **exactly** to what the user receives; Accept is
  disabled otherwise ("Left to assign: …").
- Default: the first account receives everything (one tap, as before).
- For a multi-offer order the split is given once for the whole order and spread over the
  trades in order, so each trade's payouts add up to that trade and each account receives
  exactly its share in total.
- **The partner bank pays each account from escrow** after both sides have funded; Xspeeria
  never holds or moves the money. When paid, **a confirmation is sent to both sides**
  (demo: an event "Confirmation sent to you and the Seller/Buyer"; real notifications are
  server-side).
- Accounts are the user's **own verified** accounts only (Banking spec §3.3). Payouts to
  other people remain pending DEC-007.

> **Update 2026-10-18:** choosing accounts and amounts moved from the confirm sheet to the
> Payout Destination screen, which can also add a new own-name account (24-hour hold) —
> `docs/adr/022-payout-destination-welcome-location.md`.

## 4. Implementation

`mobile/src/features/history/data.ts` (`coordinationFeeMinor`), `trade/tradeStore.ts`
(`transferFor`, `receiveFor`, `payouts`), `trade/payoutSplit.ts` (`splitProblem`,
`allocatePayouts`), `trade/ConfirmTradeSheet.tsx`, FAQ and welcome copy. Tests:
`mobile/__tests__/fee-and-payouts.test.tsx` and updated trade, history, multi-fill tests.
Demo data: second own accounts b5 (USD), b6 (NGN), b7 (GBP).

## 5. Open

- Whether a fee floor or cap is wanted (none set).
- Partner-bank confirmation that one escrow can pay several accounts per side, and how the
  confirmation is delivered (push, email, SMS) — UNKNOWN — NOT VERIFIED.
- Update investor/board materials and the Business Plan narrative (§5.2–5.4) to the 1% model.
