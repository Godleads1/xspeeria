# ADR-019 — Review Decisions: High-Severity Release Rule, Rounding, Multi-Offer Fill

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-025 |
| **Authority** | Product owner, 2026-10-17, answering the open items of `docs/adr/018-security-review-remediation.md` §3 and `docs/07-security/XSPEERIA_ENTERPRISE_SECURITY_STANDARD.md` §6 C1: "1. yes 2. round to nearest even 3. User A may need $1000 and 4 users have $250. that also should be possible 4. I will upgrade later" — `DOCUMENT_INDEX.md` §1 rank 2 |

## 1. High-severity release rule (C1) — relaxation approved

A **High** finding blocks release when it exposes sensitive data, permits unauthorised
access, or threatens transaction integrity. Any other High may ship **only** with a written
risk acceptance naming the approver, the compensating controls and an expiry date (pattern:
`docs/adr/017-npm-audit-time-limited-exceptions.md`). This explicitly approves the
relaxation of Security Master Audit §6 for release purposes (Standing Standards §4.3).
**Critical findings always block.** Nothing else in the Master Audit changes.

## 2. Rounding — round half to even (FIN-01)

Every money conversion rounds **half to even** at exactly one point, matching
`docs/adr/002-financial-event-ledger-architecture.md` §4.4 and the backend `to_minor`.
This supersedes "half-up" in `docs/adr/014-confirm-trade-flow.md` §1 and
`docs/adr/009-referral-reward.md`. Example: 1 cent × 1,892.50 = 1,892.5 kobo → **1,892**.
Mobile: `divRoundHalfEven` in `mobile/src/features/market/money.ts`.

## 3. One request filled from several listings (FIN-13)

A buyer who needs 1,000 USD can take four 250 USD offers; a seller can fill several
requests the same way.

- **Explicit, never clamped.** On Select Match the user taps each listing; the app shows
  "Taking 250.00 USD" for each and "Selected 750.00 of 1,000.00 USD". Each part has an
  explicit amount — what is still needed or what the listing has left, whichever is
  smaller — so Standing Standards §7.3 holds (no clamp, no silent resize, no partial fill
  without explicit request). Tapping a selected listing removes it.
- **When the selection covers the amount**, the confirm sheet opens; "Review" opens it
  earlier for a smaller total, which the sheet states plainly.
- **One confirm, one 2FA check** for the whole order; then **one trade per listing**: its own
  match, escrow transfer, reference and coordination fee. Trades of one order share an
  `orderId`, and each trade screen lists the others.
- **No silent shrink.** If a listing was taken between picking and confirming, the sheet
  says so and cannot be accepted; the user picks again. On the server each acceptance
  serialises on its own Offer (Standing Standards §7.1), so if one part fails at creation
  the others still stand, and the user is told.
- The single-listing flow is the same mechanism with one part (one tap when one listing
  covers the amount, as in Figma).

## 4. Branch protection (SEC-031)

Deferred by the product owner ("I will upgrade later"). It remains **BLOCKED** in
`docs/07-security/SECURITY_EVIDENCE_REGISTER.md` and must be enabled before production.

## 5. Open — needs a product decision

| Item | Current demo behaviour |
|---|---|
| **Fee for multi-offer orders** | One flat coordination fee **per trade** (4 offers = 4 × ₦375), shown before confirming. The business plan says the fee is per matched exchange; whether an order of several matches should pay once is a pricing decision. |
| **Funding window for several trades** | Each trade has its own 5-minute window (Appendix D marks the window as configurable, TBD), so a 4-trade order means 4 transfers in 5 minutes. A longer window per order, or one combined transfer, needs product and partner-bank confirmation. |
| Partner-bank support | Whether one person can have several simultaneous escrow legs is UNKNOWN — NOT VERIFIED with any partner. |
