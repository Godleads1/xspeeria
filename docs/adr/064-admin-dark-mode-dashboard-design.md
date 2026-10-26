# ADR-064 — Admin Console Dark Mode and Dashboard Redesign

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-26 (console; two read-only dashboard figures added on the server) |
| **Decision ID** | DEC-071 |
| **Authority** | Product owner, 2026-10-26: "add beautiful touches to xspeeria web admin dashboard … and add dark mode too"; preview approved, then "New design + dark mode". The owner excluded the reference image's non-Xspeeria content: facility-access labels and tagline, a single-₦ revenue figure, Fraud Alerts and System Uptime tiles, and the top-bar search. Builds on ADR-061 (real numbers only), DEC-016 (approved dark colour scheme), ADR-053 (languages). |
| **Constraints** | ADR-061: no sample figures. Money stays integer minor units per currency, never added across currencies. SEC-008: display only; the server checks `dashboard.read`. |

## Decisions

1. **Dark mode.** Every console colour is a CSS variable. Light values come from `color`; dark
   values come from `colorDark` in `@xspeeria/tokens` (DEC-016). Each person chooses Light, Dark
   or System with a switch in the header and on the sign-in page. The choice is kept in the
   browser only (`xspeeria.admin.theme`), and reading it is wrapped so a blocked store falls back
   to System. A small inline script sets `data-theme` before first paint so the page doesn't
   flash. **Note for a future Content-Security-Policy:** `script-src` must allow that script by
   its hash. The logo has a dark-mode file with white lettering (checked: no scripts, no links).
2. **New shell look.** The sidebar is navy and the active item uses the logo green; text
   contrast is 11.1:1 and white on green is 5.4:1. Filled buttons use `brand.fill`, so they
   stay dark blue with white text in dark mode.
3. **Dashboard Overview redesign:**
   - A greeting banner (first name, Lagos hour) with the period choice and a green Export
     Report menu (CSV or print to PDF, unchanged).
   - "Today at a glance" text.
   - Eight tiles with a coloured edge, icon, counting-up number and trend line.
   - "Customers by status" and "Trades by corridor" donuts. Corridors beyond the first two are
     folded into "Other".
   - A ranked "Top corridors" table.
   - Footer.
   - The other tabs are unchanged.
4. **Only real figures.** The trend lines use two new read-only server figures in the same
   `dashboard.read` response:
   - `overview.series`: counts per bucket in Lagos time;
   - `overview.value_by_time`: money per bucket per currency, as integer minor units.
   - `customers.by_status` adds counts for active, waiting verification, suspended and closed.
   Gaps are drawn as 0. A money trend line is drawn for the first currency only. Drawing uses
   `Number()` for the shape only; the amounts shown stay exact BigInt text.
5. **"Today at a glance" is a template, not AI.** It is written from the same figures, and the
   page says so ("Written from these figures by a template — not AI."). Any real AI summary
   needs owner approval and a vendor review first.
6. **Streaming text** (`admin/lib/stream.ts`): the glance appears word by word.
   - It never blocks the page: each step runs in `requestAnimationFrame` and writes one text
     node.
   - It takes several words per step, with a pause after punctuation.
   - It waits a set time before the first word and measures that wait (time-to-first-token).
   - It stops at a word limit or time limit and then shows the rest at once.
   - It stops cleanly on abort.
   - It shows the whole text immediately when "reduce motion" is on.
   - Screen readers hear the sentence once (`aria-busy`).
7. **Chart colours** were checked with the dataviz validator: light #4A5BD0 / #D98A1F, dark
   #6F82F2 / #C2802A on #151B2C. Donut slices also carry text labels and counts, so colour is
   never the only cue.

## Evidence

- Server: `backend/tests/integration/test_admin_dashboard.py` (series sums, `value_by_time`
  currencies, `by_status`).
- Console tests:
  - `admin/__tests__/stream.test.ts`: first-token wait, chunking, gap, both limits, abort,
    stop, reduce motion.
  - `admin/__tests__/dashboard.test.tsx`: greeting, donuts, "Other" folding, trend-line gaps,
    glance text and its "not AI" label.
  - `admin/__tests__/i18n.test.tsx`: every new string in five languages.
- Browser check: light, dark and Arabic (right to left) with Playwright.
