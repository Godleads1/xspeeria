# ADR-111 — Any Currency for Any Other

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED (all 5 steps)** — 2026-11-11. Not verified: licences (below). |
| **Decision ID** | DEC-123 |
| **Authority** | Owner, 2026-11-11: "i want us citizen can decide to buy ghana currency or any other currencies, but can not buy us dollars. same for other countrie." … "if i am in nigeria, i will not see order from fellow nigerians trying to sell naira to buy other currencies." Answers: **"Verified country"**, **"Pay with either"**, **"Work out via official rates"**, **"Build and switch on"**. Then: the pay currency "should be detected already" from verification, so there is no "I pay" choice. |
| **Changes** | ADR-020 and ADR-029: a pair no longer needs naira. Everything else (escrow, fees, identity, limits) is unchanged. |

## Decision

1. **Pairs:** any two different currencies Xspeeria supports can be exchanged: naira, US dollars, pounds, euros, Canadian dollars, the yuan (still behind `CHINA_ENABLED`), and the ten African currencies. That is 120 pairs, 105 of them without naira.
2. **What a person pays with:** the currency of a country where they passed the identity check. This is the existing rule (ADR-042), already enforced by the server for every pair.
   - Verified in two countries: either currency ("Pay with either").
   - A person never buys the currency they pay with in a deal. Pairs are always two different currencies.
   - The app picks the pay currency itself, so there is no "I pay" question. It uses the verified country the person is in now, or their first verified country when travelling (steps 3–4).
3. **What the Market shows:** never offers selling the viewer's own country's currency (ADR-059 rule A, now for every pair). In Nigeria you don't see Nigerians selling naira; in Ghana, nobody selling cedis.
4. **How a pair is quoted:** the price of 1 unit of the **base** in the **quote**.
   - **With naira:** naira per unit, exactly as before (₦1,333.26 per USD).
   - **Without naira:** the base is the earlier currency in a fixed order (`offer_rules.STRENGTH`, roughly by value), so most rates are 1 or more, such as **11.604 GHS per USD** or **1.118 USD per EUR**.
   - Selling either side of a pair uses the same quote. Cedis for dollars is still cedis per dollar.
5. **Limits ("Work out via official rates"):** base's naira value ÷ quote's naira value. The values are the **unrounded** official naira rates and the same reference rates as ADR-101/105/107. The result is cut **down** to 3 decimals, so the limit never exceeds the official cross rate. A switched-off currency takes all its pairs with it (ADR-106).
6. **Deal limits by tier:** these stay in naira (ADR-058). A deal without naira counts at the reviewed naira value of the currency taken; 100 USD counts as ₦133,326.00.
7. **Escrow:** each side pays into its own country's escrow and is paid out there. This was already per currency and per verified country. A dollar-for-cedi deal uses the US and Ghana escrows, each with its 1% fee.
8. **Not changed:** requests in several currencies at once (ADR-059 Decision 5) still pay naira only.
9. **Switched on** as soon as it's built ("Build and switch on"). Nothing is hosted yet.

## Not verified / owner actions

- **Licences.** A deal with no Nigerian side (for example US⇄Ghana) may need licences in both countries and partner banks there. That's a question for the lawyer before real money moves. `UNKNOWN — NOT VERIFIED`.
- **Reference rates.** The KRA and other reference rates in ADR-107 now also set the limits between those currencies, so check them against each central bank before going live.

## Steps

1. **Server rules** (this record): pairs, quoting, limits, deal sizes, the other side of a deal, rates API `pairs`.
2. **Escrow on both sides:** already covered here by the end-to-end test. Anything more found later gets its own PR.
3. **App:** Market and Take offer, with the pay currency detected (implemented):
   - **Detection:** the currencies of the approved checks (`GET /kyc/regions`), in the server's order. The app picks the one for the country the phone is in, else the first. "Change" appears only when there are two or more. The server still checks the country on every offer and take; the app's choice is display only.
   - **Buy:** "Currency to buy" lists every other currency. Switched-off ones (and every pair of a switched-off pay currency) appear only while the server has a limit for the pair. The amount is typed in the currency bought, and the request pays its value in the pay currency, half to even.
   - **Sell:** sells the pay currency for a chosen one.
   - **Rates:** limits and rates read quote per base ("GHS 11.604 per USD"). Naira wording is unchanged.
   - **Before verification and in demo builds:** behaviour is as before (Buy pays naira; Sell sells dollars for naira). The server asks for the check when it is needed.
   - **Evidence:** `mobile/__tests__/cross-market.test.tsx`.
4. **App:** the other screens (implemented):
   - **Search:** paying with another currency, Search lists offers selling the chosen currency for yours. It has no Sell side, since paying your currency for another is the same deal from either side. Your own currency is never offered; naira is. Rate filters read quote per base.
   - **"Find a deal" on Home:** leaves out the chip for the currency you pay with.
   - **My Offers:** a deal that pays naira is a request, under My Requests (as before). Any other offer, including a buy request paying dollars, is under My Offers, and the Market's notice says which. The rate and the rate field read quote per base.
   - **My Deals:** shows both sides ("You get 100.00 USD for 1,150.00 GHS") and the pair's rate.
   - **History and receipts:** a deal with no naira side is a "bought" row from your side. The receipt shows what you paid (the server's recorded counter amount) in its own currency, with the 1% fee in that currency.
   - **Naira deals:** read exactly as before.
   - **Evidence:** `mobile/__tests__/cross-screens.test.tsx`.
5. **Admin console and docs** (implemented):
   - **Transaction timeline:** the rate reads the pair's way ("GHS 11.500000 per USD", "NGN 1320.500000 per USD").
   - **Currencies page:** no longer says every deal has a naira side. It now says naira can't be switched off.
   - **Penetration test brief:** asks the tester to try the ADR-111 rules (§3.3). Evidence: `admin/__tests__/activity.test.tsx`.

## Evidence (step 1)

- `backend/tests/unit/test_cross_currency_rules.py`:
  - every currency has a quote order;
  - each pair is always quoted the same way;
  - unknown or identical currencies are refused;
  - limits come from unrounded values, cut down (GBP/UGX 5751.347);
  - the limit message names the pair;
  - counter amounts work both ways, including whole-unit currencies;
  - naira value for tier limits.
- `backend/tests/integration/test_cross_currency.py`:
  - 11.605 refused and 11.604 accepted for USD/GHS;
  - shown in Ghana, hidden in the US;
  - the rates API lists the pairs;
  - **a dollar-for-cedi deal settles through the US and Ghana escrows** (legs `GHS 115000+1150 @GH`, `USD 10000+100 @US`), pays out exactly, and reconciles;
  - cedis-for-dollars is quoted the same way;
  - paying cedis needs a Ghana check.
