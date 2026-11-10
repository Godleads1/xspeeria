# ADR-105 — Germany, France and China Join the Corridors (China Switched Off)

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-10 (China built, **switched off**) |
| **Decision ID** | DEC-117 |
| **Authority** | Owner, 2026-11-10: "add germany, france, china". Asked when: **"Launch corridors now"**. Asked which escrow bank a euro side uses: **"User's verified country (Recommended)"**. Asked how to treat China: **"Build it anyway"** (stays off until legal clearance). Asked the yuan payout form: **"Add CNAPS branch code"**. Asked the yuan rate limit: **"Work out from USD (Recommended)"**. |
| **Amends** | ADR-043 / ADR-100 (MVP corridors), ADR-042 (verification per country), ADR-099 (EUR by IBAN). |

## Decision

1. **Corridors.** Nigeria ⇄ Germany and Nigeria ⇄ France (euro), and Nigeria ⇄ China (yuan), join UK, US and Canada.
2. **Identity checks** may be for Germany (`DE`, ID issued by `DEU`), France (`FR`, `FRA`) and China (`CN`, `CHN`), with an ID issued by that country (ADR-042). Migration **0049** widens `ck_kyc_cases_country_allowed`.
3. **The euro is shared,** so a euro side's country is **the euro country its payer is verified in** (`services.pay_country`). Paying in euros needs an approved check for Germany or France; verified in both, the first approval wins. The euro leg's escrow opens at that country's partner bank; with none, no escrow opens (fail closed).
4. **Euro payout accounts** stay IBAN-only (ADR-099).
5. **Yuan (CNY):**
   - **Payout form:** bank name, the 16–19 digit bank card or account number, and the branch's 12-digit **CNAPS** code (stored as the bank code). As for every currency, the holder's name is not typed: it comes from the bank's own account check.
   - **Rate limit:** the USD limit ÷ the People's Bank of China USD/CNY central parity, rounded half to even. **6.7167** is the 10 Nov 2026 fixing as reported by FXStreet; it must be checked against PBOC/CFETS before China is switched on. Like CAD, it follows the automatic USD limit (ADR-102).
   - **Minimum:** 10 yuan, like the other foreign currencies.
6. **China switch:** `CHINA_ENABLED`, default **false**. While off, the server refuses (403 `BUS_403_NOT_AVAILABLE`):
   - yuan offers and buy requests;
   - yuan payout accounts;
   - identity checks for China.
   It also hides the yuan rate limit and China from the identity-check list. The app shows the yuan and China only when the server lists them, so turning China on needs no app release.
7. **Phones:** sign-up and log-in accept +49 (Germany), +33 (France: 9 digits) and +86 (China: mobile, 11 digits starting with 1).
8. **Pretend banks** (local testing): Germany, France and China join Nigeria, UK, US and Canada.

## Not verified / owner actions

- **China's legality** — UNKNOWN — NOT VERIFIED. China tightly controls moving yuan in and out of the country, and person-to-person foreign exchange there may not be allowed. The lawyer must confirm before `CHINA_ENABLED=true`.
- **Didit's support** for German, French and Chinese ID documents in our workflow — NOT VERIFIED.
- **Paying a euro IBAN in another euro country** (for example a French IBAN paid from the German escrow): this assumes the partner bank pays any euro IBAN by SEPA. Not confirmed with a partner bank; partner banks for Germany, France and China don't exist yet.
- **The PBOC fixing** above comes from a news report, not the PBOC itself.

## Evidence

- `backend/tests/integration/test_new_corridors.py`:
  - a euro leg goes to the German or French pretend bank by the payer's verified country;
  - with neither, no escrow opens;
  - paying euros needs a German or French check;
  - China is refused everywhere while off and hidden from the rate limits and identity-check list;
  - with China on, the yuan limit is the USD one ÷ 6.7167.
- `backend/tests/unit/test_payout_rules.py` `TestCny`: the yuan payout form.
- `mobile/__tests__/choose-country.test.tsx`, `payouts.test.tsx`, `new-corridor-phones.test.ts`, `select-country.test.tsx`: Germany and France listed; China and the yuan only when the server lists them; the CNAPS form; +49/+33/+86 numbers.
