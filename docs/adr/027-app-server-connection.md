# ADR-027 — Connecting the App to the Server Sign-In and 2FA (Milestone APP-1)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-033 |
| **Authority** | Product owner, 2026-10-18: "Start" (step 1: connect the app to the real sign-in); then chose **"Reorder the app"** and **"Yes, local only"** (developer SMS) — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Amends** | `docs/adr/013-onboarding-and-login.md` sign-up order (server mode only); `docs/adr/025-auth-1-server-sign-in.md` §1.8 logging rule (one local-only exception, §2 below) |

## 1. Sign-up order (server mode)

The server sends the SMS code only once it has the phone, email and PIN (`register`), so the
app asks for them first:

**phone → email → create PIN → confirm PIN → SMS code → add authenticator → save recovery
codes → done.**

The demo order (selfie/NIN step, email code, Face ID step) is unchanged when the app is not
connected to a server. In server mode there is no email code yet (email verification is
pending) and no Face ID step (needs passkeys, ADR-008 §3).

## 2. Developer SMS (local only)

`DEV_SMS=true` makes the server print each SMS code to its own terminal window, so sign-up can
be tried before an SMS provider exists. The server **refuses to start** with it unless
`APP_ENV=local` (tested for development, staging and production). It writes to the terminal
directly, never through the logging pipeline, and shows only the last 4 digits of the phone.
This is the only exception to the "codes are never logged" rule, and it exists only on a
developer's own computer.

## 3. How the app connects

- **Address:** `EXPO_PUBLIC_API_URL` at build time; `https://` required, plain `http://` only for
  this computer or a private network address (`src/api/config.ts`).
- **Server mode is for development builds only for now.** The marketplace, trades and profile
  data are still demo data, and release builds never run demo data (ADR-018).
- **Tokens:** access token in memory only; refresh token and trusted-device token in the
  phone's secure storage (`expo-secure-store`, this device only, while unlocked). The PIN is
  sent once to the server and never stored.
- **Session:** while the user is active the app refreshes every 4 minutes (inside the server's
  5-minute idle limit). The app's idle lock, the 7-day limit, a refused refresh and log-out
  all drop the tokens (the trusted-device token is kept). Log-out also tells the server.
- **2FA:** a new phone gets the "Confirm it's you" screen (authenticator code or recovery code);
  an account whose sign-up stopped before 2FA is sent to authenticator set-up.
- The 2FA challenge and the tokens of a sign-up still showing recovery codes are held in memory,
  never in route parameters.

## 4. Not yet connected (still demo in server mode)

Face ID log-in (needs passkeys); the Security screen's 2FA management (replace authenticator,
new recovery codes) — the server endpoints exist; profile name and details from KYC; every
marketplace, trade, payout and history screen.

## 5. Implementation

Server: `backend/app/providers/sms.py` (`DevConsoleSmsSender`), `backend/app/core/config.py`
(`dev_sms`), `backend/app/main.py` (guard; CORS only for listed origins).
App: `mobile/src/api/` (config, client, secure tokens, auth calls),
`mobile/src/features/auth/serverAuth.ts`, `ServerScreens.tsx` (SMS code, 2FA), log-in screen
server mode, `AuthenticatorSetupScreen` server engine, routes under `mobile/app/(auth)/`.
Tests: `mobile/__tests__/server-auth.test.tsx`; `backend/tests/unit/test_mfa_primitives.py`
(dev SMS). End-to-end run on 2026-10-18: real server + browser build — sign-up, SMS code,
authenticator, recovery codes, Home; new session → 2FA → Home; server log held no PIN, full
phone or email.

## 6. Dependency note (same PR)

New public advisories (GHSA-5xrq-8626-4rwp vitest, GHSA-85c8-ppgw-ccpr tinypool,
GHSA-fx2h-pf6j-xcff vite) made the npm audit gate fail for every branch. They affect only
test tooling of `admin` and `packages/tokens`, not the app or server. Fixed by upgrading, not
by an exception: vitest 2.1 → 4.1.12, vite 5.4 → 6.4.4, @vitejs/plugin-react 4.7 → 5.2 (admin).
Admin (22) and tokens (42) tests pass; `npm ci` verified. `expo-secure-store` ~57.0.1 added to
the app (Expo SDK 57 bundled version).
