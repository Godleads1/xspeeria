# ADR-111 — Any Currency for Any Other

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED (server, step 1 of 5)** — 2026-11-11. The app follows in steps 3–4. |
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
3. **App:** Market and Take offer as "I want ___", with the pay currency detected.
4. **App:** search, "Find a deal", My Offers, My Deals, receipts and History.
5. **Admin console and docs.**

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
