# ADR-042 — Identity Checks per Country (NG, GB, US)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** — 2026-10-19 (rules); built on the server (details below PROPOSED) |
| **Decision ID** | DEC-049 |
| **Authority** | Product owner, 2026-10-19: "if I do my kyc in nigeria and used the [app] for a while, when i travel to USA, it should demand for another kyc based on the country location". Answers: **"Location seen + user confirms"**, **"Keep Nigerian trading"**; then, after "we are launching us and uk at the mvp stage" (DEC-050, ADR-043): **"Yes, build it now"**, **"The country they pay from"**, **"ID issued by that country"**. |
| **Extends** | ADR-016 (Figma "Trade in Your New Location") — settles its open item "location signal source"; ADR-039 (Didit), ADR-041 (one person, one account) |

## Rules

1. **Verification is per country.** Countries: Nigeria (`NG`), United Kingdom (`GB`), United States (`US`) — the MVP corridors (ADR-043). *Canada (`CA`) joins the MVP corridors (ADR-100, 2026-11-09); not built yet.*
2. **A deal needs verification in the country you pay from.** The country is the currency's jurisdiction (`settlement_rules.JURISDICTION`: NGN→NG, GBP→GB, USD→US).
   - Posting an offer: the offer's *source* currency (what the maker pays).
   - Taking an offer: the offer's *target* currency (what the taker pays).
   - Receiving into your own account abroad needs no extra verification (payout accounts stay own-name and bank-confirmed, ADR-035).
   - Example: Ada, verified in Nigeria, pays naira and receives pounds into her own UK account — allowed. To pay in pounds she needs UK verification.
3. **Proof: an ID issued by that country**, plus the same live selfie, face match and sanctions screening as ADR-039. A UK check needs a UK-issued ID (passport, driving licence or residence card); a US check needs a US-issued ID. Applied to Nigeria too: a Nigerian check needs a Nigerian-issued ID — **confirmed by the product owner, 2026-10-19** ("No" to "should a foreign passport still count for Nigeria?"). Before this ADR any ID was accepted for the first check. A result with an ID from another country is refused with plain words ("Please use an ID issued by …"); the user can try again.
4. **What starts it: location seen + user confirms.** The server can see the country a request comes from (a trusted proxy header, see Settings). `GET /api/v1/kyc/regions` suggests a supported country the user is not verified for; the app shows the Figma "Trade in Your New Location" prompt; the user confirms (starts that country's check) or skips (nothing changes, nothing stored). Location alone never verifies, refuses or blocks anyone. No location is stored.
5. **Meanwhile, the other countries keep working.** Only paying in the new country's currency waits for its check.
6. **Same person, same account.** A second country's check is added to the same account. Its date of birth must equal, and its name must match, the identity already verified on the account; otherwise it is **held for review** (`review_reason = IDENTITY_MISMATCH`). ADR-041 still applies across accounts.
7. **One open check at a time.** Didit resumes the same unfinished session for a user, so a user with an unfinished check in one country gets `409 KYC_409_CASE_ALREADY_ACTIVE` ("Finish your other identity check first") when starting another country.

## API (server)

- `POST /api/v1/kyc/cases` — optional body `{"country": "NG" | "GB" | "US"}`; no body = `NG` (the app's current flow).
- `GET /api/v1/kyc/cases/current?country=NG|GB|US` — default `NG`. Responses now include `country`.
- `GET /api/v1/kyc/regions` — each country's status and `suggested_country`.
- Offers/takes: `403 AUTH_403_KYC_REQUIRED` with `details.country` when the pay-from country is not verified. All other market routes still need one verified country.

## Settings

`CLIENT_COUNTRY_HEADER` (e.g. `CF-IPCountry` behind Cloudflare). Unset = no suggestion. Set it only when every request reaches the server through that proxy; a forged header can at most cause a prompt (it grants nothing).

## Data

Migration 0012: `kyc_cases.country CHAR(2)` (existing rows `NG`; immutable), one open case per user **per country**, `review_reason` gains `IDENTITY_MISMATCH`.

## Not decided

- US identity rules (SSN — ADR-016 says never stored; whether a US partner requires it), Didit's US/UK document coverage for the partner banks, data residency.
- How long an unused country verification stays valid.
- Whether a new country also needs 2FA (ADR-016 open item).
- Who clears held cases (staff tools wait for the Figma file).
- ~~App screens: the Figma region prompt and "KYC approved regions" are not yet connected to the server.~~ Connected (ADR-045); choosing a country from "Verify your identity" added 2026-10-27 (ADR-071).
