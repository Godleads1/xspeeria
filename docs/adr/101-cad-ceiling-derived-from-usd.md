# ADR-101 — The CAD Rate Ceiling Is Worked Out From the USD One

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-09 |
| **Decision ID** | DEC-113 |
| **Authority** | Owner, 2026-11-09. Asked for the CAD maximum rate, the owner first said "use their official nigeria market rate". No reliable CBN figure for CAD could be found (below). The owner then chose: **"Work it out from the US dollar. Take the official naira-per-dollar rate and multiply by the Canadian dollar's value in US dollars … do this"**. |
| **Extends** | ADR-020 (official rate ceiling) for CAD, after ADR-100 (Canada joins the MVP). |

## Why no published figure was used (9 Nov 2026)

| Source | What it showed for CAD |
|---|---|
| Monierate CBN official table (the ADR-020 source) | No CAD row (USD, GBP and EUR only) |
| NairaToday | "CBN ₦990", sourced to "CBN data and open market aggregators", with no separate attribution for CAD |
| Current Affairs Nigeria | ₦969.90 "CBN rate", dated 5 Aug 2026 |

## Decision

**CAD ceiling = USD ceiling × (USD per 1 CAD) = USD ceiling ÷ (CAD per 1 USD)**, rounded half to even to the kobo.

- **CAD per USD:** **1.4113**, the Bank of Canada daily exchange rate for **6 November 2026**, from its own published feed (`bankofcanada.ca/valet/fx_rss/FXUSDCAD`). That was the latest rate the feed showed. The Bank of Canada lookup for 17 October (the USD snapshot date) couldn't be reached from this session.
- **USD ceiling:** ₦1,333.26 (ADR-020 snapshot, 17 Oct 2026).
- **Result:** 1,333.26 ÷ 1.4113 = 944.6964… → **₦944.70 per CAD**.
- **Built in code** (`offer_rules.OFFICIAL_RATE["CAD"]`), so refreshing the USD ceiling or `CAD_PER_USD` changes CAD with it. The app mirrors the figure (`rateCeiling.ts`) and labels it as worked out, not as a CBN rate.
- **The two inputs have different dates** (17 Oct and 6 Nov). Refreshing all ceilings together, with a live feed, is still open (ADR-020 §4).

## Consequences

- CAD offers can be published up to ₦944.70 and are listed on CAD/NGN. This replaces the ADR-100 "refused until set" state.
- Like every ceiling, it is a snapshot that must be refreshed by a reviewed change before real use.

## Evidence

- `backend/tests/unit/test_offer_rules.py::test_cad_ceiling_is_derived_from_the_usd_one`: the inputs and 944.70; 944.71 refused.
- `backend/tests/integration/test_offers_api.py::test_cad_listing_works_and_respects_its_derived_ceiling`: 944.71 refused, 944.70 published and listed.
- `mobile/__tests__/rate-ceiling.test.tsx`: the app's figure matches the formula.
