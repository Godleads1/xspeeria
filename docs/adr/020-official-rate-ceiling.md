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

## 3. Still open (unchanged)

The official-rate **source** (e.g. which authority's published rate), **update cadence**,
**staleness** rule and **behaviour when unavailable** remain OPEN (Standing Standards §7.2,
§15). Until decided:

- The demo uses labelled **demo values** (the top of each Figma market band): USD 1,899.99,
  CAD 1,215.00, EUR 1,810.00, AUD 1,099.00. They are not real official rates.
- With no official rate for a currency, **no rate is accepted** (fail closed).
- Figma offers o2 (1,907.00) and o3 (1,902.00) keep their values and are therefore hidden as
  ineligible; a demo offer o8 (400 USD at 1,898.00) keeps a 1,000 USD multi-offer fill
  possible.
