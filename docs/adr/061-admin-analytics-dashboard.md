# ADR-061 — Admin Analytics Dashboard: Real Figures Only

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-26 (server + console) |
| **Decision ID** | DEC-068 |
| **Authority** | Product owner, 2026-10-26, on the Figma "Analytics Dashboard" frames (Overview, Customers, Transactions, Revenue, Corridors, Cards, Operations, Adverts): "Real numbers only"; Cards tab "Keep hidden"; Adverts "With advert upload, later". Builds on ADR-051 (decisions 3 and 5, design corrections) and ADR-056 Decision 2. |
| **Constraints** | SEC-008 (server-side permission `dashboard.read`); no floats for money; Xspeeria never holds money (ADR-001). |

## Decisions

1. **Real numbers only.** Every figure comes from the platform's own records. A Figma tile with
   no source in the platform is left out, never filled with sample numbers. Left out today:
   Net Promoter Score, system uptime, cost per acquisition, average revenue per user, customer
   lifetime value, user segmentation donut, agent performance, "completed in first / second
   match", reconciliation auto-match rate, fraud alerts, fraud detection accuracy, dispute SLA
   compliance (no SLA is defined yet). They can be added when the platform records them.
2. **Cards tab hidden** (ADR-051 decision 5). **Adverts tab** comes with advert upload, size
   check and schedule (ADR-056 Decision 2) as one piece.
3. **Escrow is a record, not revenue** (ADR-051 decision 3): "Waiting in escrow now" sums the
   legs customers have paid in (`FUNDED`) that partner banks still hold, per currency. No return
   percentage. Figma's "Escrow Float" bar series on Revenue is not shown.
4. **"Fee", not "spread"; corridors are real pairs** (ADR-051 design corrections, ADR-043):
   corridors are the currency pairs of real trades (NGN⇄GBP, NGN⇄USD), with trade count, change
   against the period before, and average agreed rate. No fee/spread column.
5. **Periods** are calendar periods in Lagos time: Today, This Month, Year To Date, or a chosen
   month (Figma "TO Date / Year To Date / This Month / Custom search"). Each count is compared
   with the same length of time from the start of the period before, never running into the
   current period (31 March compares with all of February).
6. **Liquidity** shows two plain counts (open offers paying naira / paying foreign currency).
   Figma's "Liquidity Coverage 85%" has no defined formula, so no percentage is invented.
7. **Export**: CSV of the period's figures (aggregates only, no personal data; cells that a
   spreadsheet could run as a formula are neutralised) and PDF through the browser's print.

## What is built

- `GET /api/v1/admin/dashboard?period=today|month|year|custom&month=YYYY-MM` — needs a staff
  session, the admin header and `dashboard.read` (checked in `DashboardService`). Read-only SQL
  aggregates; money as integer minor units in text with the scale (`backend/app/services/dashboard.py`).
- Console home page shows the dashboard to staff with `dashboard.read`; others keep the "what you
  can open" page. Charts: hover tooltip, legend for two series, "Show as table"; palette
  #4A5BD0 / #D98A1F passes the dataviz validator (amber below 3:1 on white, so the table view
  is always there).
- Definitions: active users = customers with app activity in the period; new users = accounts
  created; trades started = transactions created; trades completed / value / fees = settlements
  `COMPLETED` whose last payout falls in the period; settlement time = from settlement start to
  last payout; failed = settlements that ended `CLOSED_UNWOUND`, `CLOSED_RECOVERED`,
  `CLOSED_WITH_LOSS` or `CANCELLED`; churn = active customers with no app activity for 30 days;
  open disputes = unresolved disputes now; mean time to resolve = disputes resolved in the period.

## Evidence

`backend/tests/integration/test_admin_dashboard.py` (a real simulated trade through the pretend
bank shows up with exact money; escrow record; empty platform shows zeros and no sample tiles;
permission; route validation), `admin/__tests__/dashboard.test.tsx`.
