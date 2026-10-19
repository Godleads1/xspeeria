# ADR-036 — Payout Accounts in the App

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — built for development builds; awaiting product-owner review |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-042 |
| **Authority** | Product owner, 2026-10-18: "Yes, start now" for payout accounts (ADR-035), planned as server then app |
| **Builds on** | ADR-022 (bank-details form), ADR-033 (My Deals), ADR-035 (server rules) |

Payout accounts are where the partner bank pays each user from escrow. Xspeeria never holds
money.

## What the app does (server builds only; demo unchanged)

**Profile › Manage Beneficiaries** becomes **Payout accounts**
- Your accounts, each shown as "Zenith Bank •••• 6789". The server never sends more than the
  last 4 digits.
- Each has the bank's status: Confirmed / Bank check pending / Bank could not confirm.
- A note explains the 24-hour hold on new accounts.
- **Remove** asks for your authenticator code (`beneficiary.remove`).

**Add payout account**
- Choose NGN / USD / GBP. EUR has no approved form yet.
- The approved bank-details fields and format checks from ADR-022 are reused.
- Enter the authenticator code (`beneficiary.add`). The account number is sent once and
  cleared from the screen.
- The holder's name is never typed: it comes from the bank's check.

**My Deals: each deal shows its step**
- "Choose your payout account — 25 min left".
- "You chose your payout account. Waiting for the other side — …".
- "Payout accounts chosen by both sides. Next: paying into escrow — coming soon".
- "Cancelled: payout accounts were not chosen within 30 minutes. Nothing was paid".

While a deal is waiting, the row has **Choose (or Change) payout account**.

**Choose payout accounts for a deal**
- Shows "You receive 264,100.00 NGN", the time left (updated every 15 seconds), and whether the
  other side has chosen.
- Only confirmed accounts in the currency you receive are offered. If there is none: "Add a NGN
  payout account".
- The first account gets everything by default; you can split across accounts. A line shows
  "Left to assign: …" or "… more than you receive" (exact integer arithmetic).
- **Confirm** needs the amounts to add up exactly and your authenticator code
  (`payout.confirm`).

**Navigation**
- Every screen re-reads from the server when it comes back into view.
- Route ids and currency parameters are untrusted: they are checked and then re-read.

No Figma frames exist for these server screens; they reuse the Market and My Offers styles.
The Figma "Payout Destination" demo flow (ADR-022) is unchanged.

## Evidence

- `mobile/__tests__/payouts.test.tsx`:
  - the deal-step wording and time left;
  - the list shows the last 4 digits and status; removing needs a code;
  - the form maps to the server request, format errors block sending, and the server's
    refusal is shown;
  - choosing: the first account by default; the wrong currency is not offered; splitting must
    add up exactly; no fitting account leads to "Add"; ready and expired states.
- End-to-end run on 2026-10-18 with two accounts on a real local server:
  1. The seller publishes 500 USD at ₦1,320.50, and the buyer takes 200.
  2. The buyer has no USD account, adds Chase •••• 9012 from the choose screen and confirms
     200.00 USD: "Waiting for the other side".
  3. The seller adds Zenith •••• 6789 and GTBank •••• 3210, then splits NGN 264,100.00 as
     200,000 + 64,100: "Both sides have chosen … ready for the partner bank's escrow".
