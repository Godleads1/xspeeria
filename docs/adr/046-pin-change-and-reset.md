# ADR-046 — Change PIN and Forgot PIN

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — 2026-10-19 |
| **Decision ID** | DEC-053 |
| **Authority** | Product owner, 2026-10-19: "built them" (the remaining app screens, ADR-045). Rules from ADR-025 §3 ("no self-service PIN reset without 2FA") and ADR-008 (step-up, recovery codes). |

## Change PIN (signed in)

`POST /api/v1/users/me/pin {current_pin, new_pin}` with an `X-Step-Up-Token` for `pin.change`.
- The new PIN passes the same rules as at sign-up and must differ from the current one.
- A wrong current PIN counts towards the PIN lock (5 tries → 15 minutes), like a wrong log-in, and spends the approval.
- Success: every **other** session ends (`revoke_reason = pin_change`); this device stays signed in. Security alert logged.
- App: Profile › Security › Change Password → the form → "Confirm it's you" (authenticator code).

## Forgot PIN (signed out)

1. `POST /api/v1/auth/pin-reset/start {phone}` → always `202 {"status": "code_sent_if_account_exists"}`. An SMS code is sent only to an active account; otherwise an unusable code is recorded so the SMS limits count the same (no account discovery).
2. `POST /api/v1/auth/pin-reset/confirm {phone, code, new_pin, otp_code | recovery_code}` → the SMS code **and** the second factor (authenticator code, or one recovery code if the phone is lost).
   - Wrong SMS codes count per code (5); wrong second-factor codes count towards the 2FA lock (5 → 15 minutes).
   - Success: every session ends (`pin_reset`), trusted devices are forgotten, alert logged. The user logs in again.
- Codes now carry a **purpose** (`signup` / `pin_reset`): a sign-up code never resets a PIN and a reset code never activates an account.
- App: "Forgot PIN" (server builds) — phone → SMS code + authenticator code (or recovery code) + new PIN twice → "Log in with your new PIN". Phone only; email reset is not offered (no email provider yet, and email cannot prove possession of the account on its own).

## Data

Migration 0014: `phone_verifications.purpose` (existing rows `signup`), `auth_sessions.revoke_reason` adds `pin_change`, `pin_reset`.

Evidence: `backend/tests/integration/test_pin_api.py` (8), `mobile/__tests__/forgot-pin-server.test.tsx` (4).
