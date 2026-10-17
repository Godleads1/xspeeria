# ADR-015 — Sell Flow

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-021 |
| **Authority** | Product owner, 2026-10-17: "go" on the Sell flow (Figma 436:7652 → 436:9175) — `DOCUMENT_INDEX.md` §1 rank 2 |

## 1. What the Sell side does

The seller sends the foreign currency (e.g. USD) into the partner bank's local escrow and
receives NGN into their **own** verified Naira account. It reuses the trade flow of ADR-014
(confirm sheet → 2 FA → Transaction In Progress → Completed → receipt), with:

| Figma | Implementation |
|---|---|
| Select Match "WE FOUND SOME MATCH FOR YOUR OFFER", numbered rows (436:7875) | Heading follows the side; sell rows show a green 1, 2, 3 badge |
| Green "I Have Paid" (436:8400) | `PrimaryButton tone="sell"`; also the confirm sheet's "Accept request" |
| Sell receipt: "Amount to receive" NGN, Transaction fee + "Amount to pay" in USD, settlement accounts in NGN (436:9175) | Receipt sell branch follows this layout; payouts shown in NGN |

## 2. Fee on the seller's side — not invented

Figma's sell receipt shows a fee of "1 USD", and the business plan charges each side locally
in its own currency. **No amount is approved for any foreign currency**, so
`sellerFeeMinor()` returns `null` and the app shows "To be confirmed (USD)" in the confirm
sheet and receipt. The ₦375 previously shown on the sell side (ADR-014, "for consistency")
is removed: it was the Naira side's fee. Product/Finance to set the foreign-side fee (and
the floor fee where transfers are near free, Business Plan §5).

## 3. Corrections

- Mock history `h3` (sell): its payout was recorded as 500 USD into a Nigerian bank. A
  seller receives NGN: corrected to ₦628,500.00 (500 USD × 1,257), and the receipt now labels
  payouts in the currency received. The test that encoded the old assumption was corrected.
- Figma Select Match lists buyers' amounts in NGN with a "/USD" rate; the app keeps the
  amount in the traded currency so the rows read consistently.

## 4. Open

- Seller-side fee amount per currency; whether it is added to the transfer or deducted.
- Split payouts to several NGN accounts (Figma shows two settlement accounts) — the app
  pays into one chosen account; splitting needs a product rule.
