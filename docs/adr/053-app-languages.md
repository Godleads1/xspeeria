# ADR-053 — App Languages: Seven Languages, Arabic Right to Left

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — 2026-10-19 (translations need native-speaker review before launch) |
| **Decision ID** | DEC-060 |
| **Authority** | Product owner, 2026-10-19: "we are using these languages for both the mobile and the web" — English (UK), English (US), French, Arabic, Spanish, Chinese (Simplified), Portuguese (replaces the earlier Yoruba/Igbo/Hausa/Swahili choice); "7 languages … do this now". |

## Decision

1. **Mechanism** — `i18next` + `react-i18next` + `expo-localization` (`mobile/src/i18n`). The English (UK) sentence is the key (`tr('Welcome Back')`); a missing translation shows English, never a blank. Sentences kept in constants are marked `k('…')` and translated where shown. Sentences with styled parts use numbered tags (`trRich('… <1>MUST</1> …')`) so translators can move them.
2. **Choice** — the phone's language on first start (Traditional Chinese and unsupported languages fall back to English (UK)); then the user's choice, kept on the device. Picker: the language chip on the sign-in screens and Profile › Language; each language is listed in its own name.
3. **Arabic** — right to left. React Native applies direction at start-up, so switching to or from Arabic asks the user to reopen the app. Back/forward arrows mirror. `supportsRTL` is set in the build config.
4. **Dates** — month and weekday names and the day/month/year order come from the language files (no locale APIs; amounts keep the existing formatting).
5. **Server messages** — the app sends `Accept-Language`; known server messages (listed in `src/i18n/serverMessages.ts`) are translated in the app; an unknown one shows in English. Push notifications (ADR-052) are still English — next step: store the user's language on the server.
6. **Not translated** — legal documents (terms, privacy) stay in English with a note, until lawyer-approved translations exist; personal and bank names; demo-only figures.

## Quality

The translations (about 1,130 sentences per language) were drafted without native speakers. **Release gate:** a native speaker reviews each language before launch, especially money, escrow and legal-adjacent wording. Arabic plural forms are simplified (singular/plural only). Portuguese is Brazilian; Spanish is neutral Latin American.

## Evidence

`mobile/__tests__/languages.test.tsx` (13): every shown sentence is translated in every language with the same placeholders and tags, no stale entries, device-language choice, fallback, US spelling and date order, Chinese date order, styled parts in Arabic, the picker, screens drawn in French and Arabic. All 592 app tests pass.

## Not verified

Real-device right-to-left layout and the brand fonts' fallback for Arabic and Chinese characters (needs the development build on a phone).

## Next

Admin web console languages (same seven) when the console is built (ADR-051); server-side language for push and email.
