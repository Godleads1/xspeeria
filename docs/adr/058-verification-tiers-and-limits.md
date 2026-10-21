# ADR-058 — Verification Tiers and Trade Limits; AI Rate Forecasting Scope

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (owner) — 2026-10-20; **not built** |
| **Decision ID** | DEC-065 |
| **Authority** | Product owner, 2026-10-20: shared OPay's tier model ("understand this and … suggest what should be for xspeeria"); then confirmed the proposed table and limits ("… is confirmed"). On forecasting: "AI Rate Forecasting based on the economy system of countries and policies". |

## Decision 1 — tiers limit trading, not balances

Xspeeria holds no money (no wallet, no balance), so tiers cap **how much a user may trade**, counted in **naira equivalent across all their deals** (a 1,000 USD deal at ₦1,330 counts ₦1,330,000).

| Tier | Requirements | Allowed | Limits |
|---|---|---|---|
| 0 — Signed up | Phone (SMS code) + email (email code) | View the market; no trading | — |
| 1 — Verified | Didit identity check: ID + selfie + face match + AML (built, ADR-039/041/042) | Create offers/requests, take deals | ₦500,000 per day · ₦2,000,000 per month |
| 2 — Verified + BVN | Tier 1 + BVN (Nigeria; database check) + home address | Higher limits | ₦5,000,000 per day · ₦20,000,000 per month |
| 3 — Full | Tier 2 + proof of address (from the last 3 months) + source-of-funds question for large amounts | Highest limits; staff review above a set amount | ₦20,000,000 per day · ₦100,000,000 per month |

Before building: the provider checks (Didit database validation for BVN/NIN, proof of address) must be confirmed against Didit's documentation and contract; the "set amount" for staff review is still to be chosen; compliance and the partner bank should confirm the limits (Decision 4). Other countries follow the same tiers with their own documents.

## Decision 2 — AI rate forecasting (scope only)

The Market ⋮ "AI Rate Forecasting" item should forecast NGN rates from **countries' economic data and policies** (e.g. central-bank rates and policy statements, inflation, reserves, oil prices, official rate history). **Not built**: it needs approved data sources (Decision 3 — reference-rate provider), a model choice, and wording that it is a forecast, not advice or a guarantee (no investment advice; Decision 4). Until then the menu item says it is coming.
