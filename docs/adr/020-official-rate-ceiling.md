# ADR-020 — The Official Rate Is the Maximum Rate

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-026 |
| **Authority** | Product owner, 2026-10-17: "use official rate as the maximum. either the chosen rate should be the official rate or below the official rate" — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Builds on** | Standing Standards §7.2 and API contract §3.3 (human-approved: `0 < rate ≤ applicable approved reference ceiling`, hard block above, no floor) |

## 1. Decision

The **applicable approved reference ceiling** of Standing Standards §7.2 is the **official
rate** for the currency. A rate is valid only when:

```text
0 < rate ≤ official rate        (NGN per 1 unit of the foreign currency)
```

- Equal to the official rate: allowed. Below it: allowed, with **no floor**.
- Above it, even by one kobo: **hard block** (`VAL_422_RATE_ABOVE_CEILING`, identifier still
  PROPOSED, unchanged by this ADR).
- Applies to buyers' and sellers' rates alike, and to every listing.

## 2. Where it is enforced (mobile demo; the server repeats each)

| Point | Behaviour |
|---|---|
| Market form | Shows "Official rate (demo): NGN 1,899.99 per USD. Your rate must be this or lower."; a higher rate shows an error, hides "match potential" and disables Create. |
| Deep link to Select Match | A rate above the official rate returns to Market. |
| Listings | A listing above the official rate is not shown as a match (not eligible for acceptance, API contract `RES_409_OFFER_UNAVAILABLE` cause b). |
| Accepting a trade | Re-checked at creation; refused above the official rate. The agreed rate is then locked and never re-priced. |

Code: `mobile/src/features/market/rateCeiling.ts`; tests `mobile/__tests__/rate-ceiling.test.tsx`.

## 3. Official rates in use (snapshot, 2026-10-17)

Product owner, 2026-10-17: "check the official rate for ngn to dollar, ngn to pounds and ngn
to euros. and use that as the max."

| Currency | Maximum rate (NGN per 1 unit) | Source |
|---|---|---|
| USD | **1,333.26** | CBN official rate as reported by Monierate, `monierate.com/fx/official`, 17 Oct 2026 (CBN figures shown: 1,333.26 / 1,332.26; the higher is used) |
| GBP | **1,765.11** | Same (1,765.11 / 1,763.78) |
| EUR | **1,491.20** | Same (1,491.20 / 1,490.08) |

Cross-check: CBN figures for 15 Oct 2026 reported by Arbiterz — USD NFEM close 1,332.75,
GBP selling 1,764.26, EUR selling 1,490.48. The CBN's own rates page did not return data
when fetched, so the CBN figures are **as reported by a third party**: VERIFIED against two
independent reports, not against the CBN page itself.

Consequences:

- **CAD and AUD have no official rate** in the snapshot, so no CAD/AUD rate is accepted and
  no CAD/AUD listing is shown (fail closed) until a rate is added.
- **GBP added to the Market currencies** (it is the documented launch corridor).
- **Mock market repriced** below the ceiling (USD offers 1,325.00–1,332.00, GBP 1,760.00–
  1,763.00, EUR 1,488.00; market bands top out at the official rate; Home best rate
  1,325.00). The Figma rates (≈1,893/USD) were above the real official rate. Past trades in
  History keep their recorded rates: an agreed rate is never re-priced.

## 4. Still open

- **This is a fixed snapshot.** Official rates move every business day. The production
  source (CBN feed or approved provider), update cadence, staleness rule and behaviour when
  unavailable remain OPEN (Standing Standards §7.2, §15). Until a live feed exists, the
  snapshot must be refreshed by a reviewed change before any real use.
- Which CBN figure is the ceiling (buying, central or selling) needs confirmation; the
  higher of the two published figures is used for now.
