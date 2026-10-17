# ADR-009 — Referral Reward

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-015 |
| **Authority** | Product owner, 2026-10-17: chose "Keep Figma's 10% bonus", then clarified **"10% off the fee"** and **"Count, not money"** for the earnings box — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Amends** | 5-Year Business Plan §5 pricing (flat coordination fee) by adding a referral discount on that fee. The fee itself stays flat; no percentage-of-amount fee and no spread is introduced. |

> **SUPERSEDED 2026-10-17 (product owner):** the coordination fee is now **1% of the money
> each side sends**, in that side's currency, not a flat fee
> (`docs/adr/021-percentage-fee-and-split-payouts.md`). The referral discount is 10% off the 1% fee.

## 1. Context

Figma (Referral Program, `1041:11976`) promises "a 10% bonus on your next currency
exchange" and shows "Total Earnings $0". The approved model charges a flat coordination fee
per side, takes no spread, holds no customer funds and never shows a balance (ADR-007 §3).
A bonus paid in money, or on the exchange amount, would break that model.

## 2. Decision

- **Reward:** when a referral qualifies, **both the referrer and the friend get 10% off the
  coordination fee on their next exchange.** It is a discount on Xspeeria's own fee — no
  money is paid out, credited or held, and the exchange rate is untouched.
- **Display:** the Figma "Total Earnings $0" box shows a **count** ("Friends joined"), never
  a money amount or balance. The no-balance guard test stays unchanged.
- **Arithmetic:** the discount is computed server-side on integer minor units, rounding half to even
  (`docs/adr/019-review-decisions-and-multi-offer-fill.md` §2) (e.g. 10% of ₦375.00 = ₦37.50 → 3,750 kobo). Never floating point.

## 3. Open items (must not be assumed in code)

- **When a referral qualifies** (friend signs up, passes KYC, or completes a first exchange).
- **Limits:** rewards per referrer, expiry of an unused discount, whether discounts stack.
- **Abuse controls:** no self-referral (same person, device or bank account), KYC-approved
  accounts only, server-issued codes. Compliance to confirm.
- **Wording review:** the promotional copy needs Legal/Compliance review before release.
- **Referral link:** no app link domain is approved yet, so the app shares the code only.
