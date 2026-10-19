# ADR-045 — App: Connecting the Remaining Screens to the Server

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — 2026-10-19 (built in parts) |
| **Decision ID** | DEC-052 |
| **Authority** | Product owner, 2026-10-19: "built them while i upload the web admin" — after the list of app screens still on demo data. |

## Part 1 — Signed-in devices and countries (this change)

- **Security › Signed-in devices** (server builds): every device signed in to the account, "This device" marked, **Sign out** for the others; trusted devices (PIN-only log-in for 30 days) with **Stop trusting**. Uses the existing endpoints (ADR-025/026). The device's network address is never shown; names are made readable from the browser/app identity ("Chrome on Windows computer").
- **Countries (ADR-042):**
  - The identity check screen takes a country (`/profile/kyc?country=GB|US`) and asks for an ID issued there.
  - When the Market refuses with `AUTH_403_KYC_REQUIRED` and `details.country`, **Verify your identity** opens that country's check.
  - After sign-in the app asks the server once for a suggested country; if there is one, the Figma **"Trade in Your New Location"** screen opens for it. Confirm → that country's check; Skip → nothing changes and it is not asked again until the next sign-in. Nothing about location is stored on the phone.
  - **Account details › KYC approved regions** shows the server's countries (approved, or in progress as "pending"); refused, expired and untouched ones are not listed.
  - The demo build keeps the Figma's simulated USA flow and SSN screen. Server builds never collect an SSN (Didit captures the ID; ADR-016 open item on SSN stands).
- The bell count and the country prompt are cleared when the user logs out or another account signs in.

Evidence: `mobile/__tests__/devices.test.tsx` (5), `regions-server.test.tsx` (5).

## Still to connect (later parts)

History and Home (real deals), change PIN and forgot PIN (server + app; ADR-025: no reset without 2FA), profile edits (phone change re-verifies; email changes only through Support — contract), biometric unlock. Not planned without a decision: profile photo storage, referral rewards, support tickets.
