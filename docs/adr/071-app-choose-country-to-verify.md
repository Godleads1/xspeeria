# ADR-071 — App: Choose the Country to Verify

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-27 (app, server builds) |
| **Decision ID** | DEC-078 |
| **Authority** | Product owner, 2026-10-27: chose **"Mobile country-choice screens (Recommended)"** as the next build. Rules from ADR-042 (owner, 2026-10-19): verification per country; **"The country they pay from"**; **"ID issued by that country"**; MVP corridors Nigeria ⇄ UK and Nigeria ⇄ US (ADR-043). Closes PENDING_ACTIONS "App: country choice and region screens". |
| **Constraints** | Display only: the server decides every status and still refuses a deal without the right check (`AUTH_403_KYC_REQUIRED`). No Figma frame exists for this screen; it uses the app's existing list style. Nothing about location is stored. |

## Context

The server checks identity per country (ADR-042), and the app already opened the right country's check in two cases:
- after the Market refused an offer for that country;
- from the "Trade in Your New Location" prompt (ADR-045).

But the main **Verify your identity** button (Profile › KYC and limits) always started the Nigerian check. So a customer in the UK or US had no direct way to verify for the currency they pay with.

## Decisions

1. **New screen: Verify your identity › "Which country will you pay from?"** (`/profile/verify-country`, server builds; the demo keeps its old screen).
   - It lists Nigeria (NGN), the United Kingdom (GBP) and the United States (USD), each with its status from `GET /api/v1/kyc/regions`: Verified, In review, Not finished, Not approved, Expired or Not verified.
   - A country with no check on the server shows "Not verified". The screen never assumes one.
   - It explains: one check per country whose currency you pay with, using an ID issued there; receiving into your own account abroad needs no extra check (ADR-042 rule 2).
   - Tapping a country opens that country's check (`/profile/kyc?country=…`). The check screen shows the result, or the next step.
2. **Profile › KYC and limits › Verify your identity** opens this screen instead of the Nigerian check.
3. **Account details** shows **Verify another country** under "KYC approved regions", or **Verify your identity** when none is verified yet. It opens the same screen (server builds only).
4. Seven languages (ADR-053): the new phrases are added to French, Arabic, Spanish, Chinese and Portuguese.

## Evidence

- `mobile/__tests__/choose-country.test.tsx`: the screen
  - lists all three countries with the server's statuses, and an unlisted country as Not verified;
  - opens the chosen country;
  - shows an error with retry and no made-up status.

  Account details' link appears in server builds, reads "Verify your identity" when nothing is verified, and is hidden in the demo.
- Full app suite (696), `tsc`, `eslint`.
- Not yet checked on a device or in the web build.

## Not decided (unchanged from ADR-042)

- US identity rules (SSN), Didit's UK/US document coverage, how long an unused country verification stays valid.
