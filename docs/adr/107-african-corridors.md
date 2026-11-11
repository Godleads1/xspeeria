# ADR-107 — Eleven African Countries Join the Corridors (Server)

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED (server, app part 2)** — 2026-11-10. Part 3 (3-decimal rates and whole-unit amounts in the app's Market and search) follows. **Amended 2026-11-10:** rates have at most 3 decimals, not 6 (see below). |
| **Decision ID** | DEC-119 |
| **Authority** | Owner, 2026-11-10: add Egypt, South Africa, Morocco, Ethiopia, Kenya, Senegal, Ghana, Zimbabwe, Uganda, Zambia and Tanzania. Answers: **"build all now and switch it on"**; payouts **"Bank and mobile money"**; Zimbabwe **"US dollars"**; small rates **"Allow up to 6 decimals"**, then amended the same day to **"3 decimal not 6"** — **"Server and app"**, limits **"Round down"**; at launch **"On for testing, off when live"**. |
| **Builds on** | ADR-042, ADR-101, ADR-105, ADR-106. |

## Decision

1. **Countries.** Identity checks for EG, ZA, MA, ET, KE, SN, GH, ZW, UG, ZM and TZ need an ID issued by that country (ADR-042). Migration **0051** widens the country check.
2. **Currencies and decimals.**
   - EGP, ZAR, MAD, ETB, KES, XOF, GHS, UGX, ZMW and TZS, using ISO 4217 decimals.
   - The **CFA franc (XOF)** and the **Ugandan shilling** have no cents, so their amounts are whole numbers.
   - **Zimbabwe pays in US dollars.** The dollar is now paid from two countries, like the euro: a dollar side's escrow follows the payer's verified country (the US or Zimbabwe; first approved wins). Paying dollars needs a US or Zimbabwe check. A dollar payer verified in neither keeps the US escrow (the home country), while the euro still fails closed.
3. **Rate limits.**
   - **Most currencies:** the USD limit ÷ the currency's units per dollar, **cut to 3 decimals and rounded down** (so a limit never exceeds the official rate), because a shilling is worth well under a naira. For example, UGX ₦0.306 and XOF ₦2.273. The units per dollar come from the **Kenya Revenue Authority's official rates for 2–8 Nov 2026** (KES 129.95 per USD), crossed through the dollar.
   - **Zambia:** ZMW 20.332 comes from Frankfurter's blended central-bank rate, because it isn't on the KRA list.
   - **Senegal:** the CFA franc's limit is the **EUR limit ÷ 655.957**, its fixed euro rate.
   - **Check before live:** every figure must be checked against the issuing central bank before the live server switches the currency on.
4. **Payout accounts** (owner: "Bank and mobile money"):
   - **Bank** (`account_type="bank"`): bank name, an account number or IBAN of 5–34 letters and digits, and an optional bank or branch code of 2–11 letters and digits.
   - **Mobile money** (`account_type="mobile_money"`): the provider's name and the wallet's phone number in that country. Available in Kenya (+254), Ghana (+233), Uganda (+256), Tanzania (+255), Zambia (+260), Senegal (+221) and Zimbabwe's US dollars (+263).
   - The holder's name comes from the bank's own check, as for every currency.
5. **On for testing, off when live.** On local and test servers the ten currencies are on. On the live server (`APP_ENV=production`) each starts **off** until a Super Admin switches it on (ADR-106).
6. **Minimum:** 10 units, as for every foreign currency (ADR-029). That is small for the shillings; a higher minimum is a product decision.
7. **Pretend banks** (local testing) for all eleven countries, including Zimbabwe for US dollars.

## Amendment — 3 decimals (2026-11-10)

- **Owner:** "3 decimal not 6", answers **"Server and app"** and **"Round down"**.
- **Every rate** a customer types (offers, requests, edits, search) has at most **3 decimals**, for every currency. A 4th decimal is refused, never rounded. Before this, the server accepted 6 and the app's Market took 2.
- **Derived limits** (the African currencies and XOF) are cut to 3 decimals, rounding down. CAD and CNY keep 2 decimals, as before.
- **Storage** stays NUMERIC(12,6), so no migration. Rates stored before the change keep their exact figure. Confirming a take still reads a shown rate to 6 decimals, so an older offer can still be taken.
- **The app** (`units.ts`) takes 3 decimals and keeps working in millionths, so a stored figure displays exactly.
- **Effect:** at most ₦0.001 per unit; on 1,000,000 CFA francs that is up to ₦1,000.

## App (part 2)

- **Countries and phones:** the eleven countries appear in "Which country will you pay from?", the regions list and the phone picker (+20, +27, +212, +251, +254, +221, +233, +263, +256, +260, +255), each with a simplified round flag.
- **Payout accounts:** the ten currencies join the payout-account tabs (still hidden when the server switches a currency off). Each African currency has a *Bank account* form (bank name, account number or IBAN, optional bank or branch code). Where mobile money is common it also has a *Mobile money* form (provider, wallet phone number). US dollars add *Bank account in Zimbabwe* and *Mobile money in Zimbabwe* beside the US form.
- **In the app since part 3 (step 4):** the Market's currency list and "Find a deal" (see below).

## App (part 3, step 2) — rates and amounts in the app

- **Rates:** the app holds them in thousandths. Every place a rate is typed takes up to 3 decimals and refuses a 4th:
  - Market, Take offer, My Offers edits, the multi-currency request and search filters.
  - Rates show 2 decimals, plus a 3rd when it isn't 0 (1,320.50; 2.273).
- **Older rates:** a rate stored before the rule keeps its exact text. In History it is cut to 3 decimals for display, so the deal still shows.
- **Whole-unit currencies:** UGX and XOF amounts are typed without decimals, and shown and sent without ".00". A request's foreign amount is rounded half to even to whole units, as on the server.
- **Still hidden:** the African currencies stay out of the Market's currency list until step 4.
- **Evidence:** `mobile/__tests__/money-currency.test.ts` and `market-units.test.tsx`. The earlier `units.ts` helpers (unused) were folded into `money.ts`.

## App (part 3, step 3): deals, payouts and receipts

- **Whole-unit amounts:** UGX and XOF amounts show without ".00" on these screens:
  - My Deals, the trade screen, choosing payout accounts, the payout destination, the confirm sheet, receipts, deal totals and search.
- **Sending to the server:** whole units, such as `"500000"`. A split with cents is refused.
- **1% fee:** in these currencies it is worked out in whole units, half to even, the same rule as the server's `coordination_fee_minor` (`coordinationFeeIn`).
- **No silent cutting:** a whole-unit amount that somehow has a fraction is shown with the fraction, never silently cut.
- **Evidence:** `mobile/__tests__/deal-units.test.tsx` and the shilling cases in `payouts.test.tsx`.

## App (part 3, step 4): African currencies in the Market and "Find a deal"

- **Where they appear:** the ten currencies are in the Market's "Currencies you can buy" list and the "Find a deal" chips.
- **When they appear:** only while the server offers them, meaning its rate limits include them. That is on for testing, and off on the live server until a Super Admin switches each one on (ADR-106). A demo build never shows them.
- **Same rule as the yuan:** each currency is listed only when the server has a limit for it. USD, GBP, EUR and CAD stay listed without a limit, so a stale feed is visible (ADR-102).
- **Limit line:** the derived limits read "worked out from a CBN rate and a published exchange rate". CAD keeps its Bank of Canada wording, and the yuan now uses the general wording too.
- **Flags:** each currency shows its country's flag; the CFA franc shows Senegal's, the corridor's country.
- **"Find a deal":** the chips scroll sideways, and the search hint lists the first four currencies.
- **Translations:** the currency names and the new sentence are in all seven translated languages. They are drafts, like the rest (M-6).
- **Evidence:** `mobile/__tests__/africa-market.test.tsx`, plus the African cases in `market-search.test.tsx`.

## Fix (2026-11-11): the other side of a whole-unit deal

- **The bug:** the server worked out a deal's other side as if both currencies had cents. With UGX or XOF (no cents) that was **100 times wrong**. 1,000 UGX at ₦0.306 gave ₦3.06 instead of ₦306.00, and a naira request paid out 100 times too many shillings. It also showed and recorded the counter amount, "you receive" and payout choices in the wrong unit.
- **Impact:** found before anything was hosted. No real money moved.
- **The fix:** `counter_amount_minor` now uses each currency's own minor units. The amounts shown, the payout choices and the escrow legs use the receiving currency's scale.
- **Evidence:**
  - `test_payout_rules.py::test_currencies_without_cents_use_whole_units`;
  - `test_africa_corridors.py`: a full shilling deal through the pretend bank, with legs `NGN 30600+306 @2` and `UGX 1000+10 @0` and payouts matching, plus a naira request for CFA francs.

## Not verified / owner actions

- **Legality and partner banks:** UNKNOWN — NOT VERIFIED for every one of the eleven. Egypt, Ethiopia, Morocco and Zimbabwe tightly control foreign exchange.
- **Rate figures:** come from the KRA list and Frankfurter, not each country's central bank.
- **Didit:** support for these countries' IDs is not checked.
- **Mobile-money payouts:** a partner bank must be able to pay wallets; not confirmed.
- **Cross-country payouts:** a dollar account in another country than the escrow (for example a US account from the Zimbabwe escrow) assumes the partner bank can pay it. Not confirmed.

## Evidence

- `mobile/__tests__/africa-app.test.tsx`: countries (Zimbabwe in US dollars), phone numbers, the bank and mobile-money forms and requests, and the add-account screen's tabs.

- `backend/tests/unit/test_africa_rules.py`: countries; currencies by country; the dollar shared; the rate-limit formulas (3 decimals rounded down; XOF from the euro); whole units for UGX and XOF; on for testing, off on the live server.
- `backend/tests/unit/test_payout_rules.py` `TestAfrica`: bank and mobile-money forms, including Zimbabwe's dollar wallet; the refused forms.
- `backend/tests/integration/test_africa_corridors.py`:
  - a Zimbabwean's dollars go through the Zimbabwe escrow;
  - Ugandan shillings take whole amounts and 3-decimal rates up to the limit (a 4th decimal is refused);
  - Kenyan bank and Ugandan wallet accounts are accepted;
  - paying dollars needs a US or Zimbabwe check.
