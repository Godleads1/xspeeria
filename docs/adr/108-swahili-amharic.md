# ADR-108 — Swahili and Amharic in the Mobile App

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED (mobile app)** — 2026-11-10. Drafts; native-speaker review needed before launch. |
| **Decision ID** | DEC-120 |
| **Authority** | Owner, 2026-11-10: "also add the languages of all these countries" (the African corridors, ADR-107). Answer: **"Swahili (Recommended), Amharic (Recommended)"**. |
| **Builds on** | ADR-053 (app languages), ADR-107. |

## Decision

1. **Two new app languages:**
   - **Swahili (`sw`, "Kiswahili")** for Kenya, Tanzania and Uganda;
   - **Amharic (`am`, "አማርኛ")** for Ethiopia.
2. **Already covered:** Egypt and Morocco use Arabic and French; Senegal uses French; English covers the rest. These languages were already in the app (ADR-053).
3. **Same rules as ADR-053:**
   - every sentence is translated, keeping `{{placeholders}}` and `<n>` tags;
   - anything missing falls back to English;
   - the choice is kept on the phone;
   - a phone set to Swahili or Amharic opens in that language.
   - Both are written left to right.
4. **Kept as written:** Xspeeria, PIN, BVN, NIN, SMS, OTP, escrow, IBAN, Face ID and currency codes.
5. **Months in Amharic** use the Gregorian names (ጃንዋሪ, ፌብሩዋሪ, …), because the app's dates are Gregorian. The Ethiopian calendar is not shown.
6. **Scope.** Only the mobile app. The admin console keeps its seven languages; staff tools are a separate decision.

## Not verified

- **Native-speaker review.** The translations were drafted without a native speaker. As with the other languages, a Swahili speaker and an Amharic speaker must review them before launch (M-6).
- **Legal texts** (terms, privacy policy) stay in English until lawyer-approved translations exist (ADR-053).
- **Amharic display.** Amharic (Ge'ez script) display on every target phone is `UNKNOWN — NOT VERIFIED`. The system fonts on current Android and iOS include it, but older phones were not tested.

## Evidence

- `mobile/src/i18n/locales/sw.json` and `am.json`: 1,514 sentences each.
- `mobile/__tests__/languages.test.tsx`:
  - checks that every sentence is translated, keeps its placeholders and tags, and has no unused keys;
  - checks the nine-language list;
  - checks the `sw-KE` and `am-ET` phone settings.
- `tsc`, `eslint` and `jest` were run locally on 2026-11-10: 73 suites and 761 tests passed.
