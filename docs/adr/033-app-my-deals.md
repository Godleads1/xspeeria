# ADR-033 — My Deals in the App

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — built for development builds; awaiting product-owner review |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-039 |
| **Authority** | Product owner, 2026-10-18: chose **"My Deals screen"** as the next step |
| **Builds on** | ADR-031 (`GET /v1/matches/mine`), ADR-032 (Take offer) |

A deal (a Match) is a record of who agreed to exchange how much at what rate. It is
information, not money.

## What the app does (server builds only)

**Where to find it**
- **Market › ⋮ › My Deals**. The item only appears in server builds; the demo menu is
  unchanged.
- **See my deals** on the "Deal recorded" screen.

**What each deal shows**
- What you get or give, with the exact naira total. For example: "You get 200.00 USD for NGN
  264,100.00", or "You give …" when someone took your offer. The total is in integer kobo,
  rounded half to even. It is left out when the deal is in naira, because then no exact total
  can be worked out.
- The fixed rate.
- Whether you took an offer or someone took yours.
- The date and time.
- "Next: payout account and escrow payment — coming soon".

Deals are listed newest first, with loading, empty and error-with-retry states.

No Figma frame exists for this screen; it reuses the My Offers styles.

## Evidence

- `mobile/__tests__/my-deals.test.tsx`: the headline from both sides; no inexact total; the
  list, empty and error states; the menu item in server builds only.
- End-to-end run on 2026-10-18 against a real local server, with two accounts:
  - The buyer saw "You get 200.00 USD for NGN 264,100.00 · You took an offer".
  - The seller saw "You give 200.00 USD for NGN 264,100.00 · Someone took your offer".
