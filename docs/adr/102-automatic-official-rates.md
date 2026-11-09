# ADR-102 — Official Rate Ceilings Update Automatically (CBN via Frankfurter)

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-09 |
| **Decision ID** | DEC-114 |
| **Authority** | Owner, 2026-11-09: "dollar, pound and euro lets do an automatic update". Asked which provider: **"Frankfurter (Recommended)"**. Asked what happens if the update fails: **"Last rate for 3 days, then stop (Recommended)"**. |
| **Resolves** | Standing Standards §7.2 / §15 row 2 (Decision 3: reference-rate provider, cadence, staleness, unavailable behaviour); ADR-020 §4 "fixed snapshot". |

## Decision

| Question | Answer |
|---|---|
| **Source** | The CBN's own published rates, read through the **Frankfurter API's CBN provider** (`https://api.frankfurter.dev/v2/providers/cbn/rate/{USD,GBP,EUR}/NGN`). It is free and needs no key. Frankfurter reads the CBN's JSON (`cbn.gov.ng/api/GetAllExchangeRates`) and serves the **central rate** unchanged, with the CBN's own date. The response shape was read from Frankfurter's source code (commit 677d7d5). |
| **Which figure** | The CBN **central rate**: the midpoint of its buying and selling rates, which is what Frankfurter serves. ADR-020's snapshot used the higher figure; the central rate is about ₦0.50 lower on USD. |
| **Currencies** | USD, GBP and EUR are fetched. CAD is still worked out from USD (ADR-101): USD ceiling ÷ 1.4113, so it moves with USD. The Bank of Canada rate itself stays fixed until changed. |
| **How often** | **Every hour** (`OFFICIAL_RATE_SECONDS=3600`), and once at start-up. The CBN publishes once a business day. Hourly was chosen while building; it can be changed. |
| **Record** | Every successful fetch adds a row to `official_rates` (migration **0046**): currency, rate, the CBN's date, source and fetch time. The table is append-only (a database trigger refuses UPDATE and DELETE). The app role may read and add only. |
| **Ceiling in force** | For each currency, the **latest stored rate, if fetched in the last 3 days**. |
| **If it fails** | The last good rate is kept. **After 3 days without a fresh one**, that currency has no ceiling: new offers in it are refused and none are listed (fail closed) until a fetch works again. One currency failing never stops the others. A failed fetch fails the "Official rates" background job, which raises the existing **"background job failing"** operations alert (ADR-074), so staff are told. |
| **Before the first fetch** | The reviewed snapshot (ADR-020, ADR-101) applies until the feed has stored its first rate. This covers a developer's computer, tests, or the feed switched off. |
| **Switch** | `OFFICIAL_RATE_FEED=frankfurter` turns it on; the default is `off` (developer computers). It runs with the background jobs (the worker, or the web server when `RUN_BACKGROUND_JOBS=true`). **Production refuses to start without it** (owner, 2026-11-09: "turn it now"; there is no production server yet). |
| **Parsing** | Exact decimals, never floats. The server refuses anything unexpected: wrong currency, a missing, zero or negative rate, more than 6 decimal places or 6 integer digits, a date in the future, or a response it can't read. |

## The app

`GET /api/v1/rates/official` (signed-in customers only, limited per customer, reads no account data) returns the ceilings in force. Server builds show "Official rate (CBN, latest): …" and check typed rates against that figure. A currency with no current ceiling accepts no rate. A decimal is never rounded up past the server's figure. The server checks every rate again; the app's check is for display.

## Risks accepted

- **Frankfurter is a free community service with no service guarantee.** If it stops, the 3-day rule stops new offers and the job alert fires. The CBN's own JSON endpoint is the fallback source. Using it would need a change to read it directly; it returns the whole history in one large response.
- **CBN terms** (as Frankfurter notes them): redistribution is permitted with attribution, and the content may not be altered. Xspeeria uses the figure as a ceiling and shows it attributed to the CBN.

## Evidence

- `backend/tests/unit/test_frankfurter.py`: the exact decimal read, 12 kinds of bad response refused, the URL called, and failed answers and network errors refused.
- `backend/tests/integration/test_official_rates.py` (8 tests):
  - the snapshot applies until the first fetch;
  - fetched rates become the ceilings, and CAD follows USD;
  - offers follow the fetched ceiling;
  - after 3 days a currency is refused and unlisted, and a working fetch restores it;
  - a failed currency keeps its last rate, fails the job, and the others are stored;
  - rows can't be changed or deleted;
  - the signed-in endpoint answers;
  - the job runs only when the feed is switched on.
- `mobile/__tests__/market-server.test.tsx`: the server's ceiling is shown and checked; a currency with no current ceiling takes no rate.
- `mobile/__tests__/rate-ceiling.test.tsx`: reading the server's figures.
