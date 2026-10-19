# ADR-040 — App: Identity Check Screen (Didit)

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — 2026-10-19 (screen layout) |
| **Decision ID** | DEC-047 |
| **Authority** | Product owner, 2026-10-19: "ok. lets do that" (build the app screens for the Didit check), after choosing **"Figma start, Didit capture"** (ADR-039). |

## What the app does (server builds only)

- **Profile › KYC and limits** opens the identity check (the demo build keeps the Figma tier cards).
- The screen uses the Figma "Verify Your Identity" heading. It explains what is needed (a government ID with a photo, a selfie, 18+), that Didit does the check and screens sanctions lists, and that Xspeeria keeps only the result, name and date of birth.
- **Verify my identity** asks the server to start or continue the check and opens Didit's hosted page. Only `https` links are ever opened.
- Back in the app, the screen asks the server again when the app returns to the foreground, and every 5 seconds while a check is under way. It never decides the result itself.
- Each status has plain words: not verified, not finished (continue), in review, verified (with the name on the ID and **Go to Market**), not verified (server's reason, **Try again**), expired (**Verify again**).
- **Market:** when the server answers `AUTH_403_KYC_REQUIRED`, the error shows **Verify your identity**, which opens this screen.
- If Didit is not set up, the button shows "This isn't available right now".

## Deviations from Figma

| Figma | Built | Why |
|---|---|---|
| Sign-up "Let's get started": phone linked to NIN; "Verify Your Identity": date of birth, selfie or OTP | Separate identity check after sign-up, ID photo + selfie on Didit's screens | ADR-039: Didit's NIN/BVN support is unconfirmed; product owner chose Didit capture |
| KYC tiers with monthly limits | Not shown in server builds | Tier limits are placeholders pending Compliance; Didit gives one verified level |

## Evidence

`mobile/__tests__/identity-check.test.tsx` (wording for every status, https-only links, opening Didit, unsafe link refused, verified name, server reason and retry, unavailable, polling only while under way) and two Market tests in `market-server.test.tsx`. Browser run against the real server (no Didit keys): intro screen shown; Verify shows "This isn't available right now".
