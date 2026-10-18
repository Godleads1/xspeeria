# ADR-024 — Session Lifetime, 6-Digit PIN, SMS Code Limits (Decision 2, part)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-030 |
| **Authority** | Product owner, 2026-10-18, answering three proposed options: session **"5 min idle, 7 days max"**, PIN **"6 digits (Recommended)"**, SMS **"5 per hour, 10 per day (Recommended)"** — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Resolves** | Three parts of **Decision 2** (Standing Standards §15 row 1): session lifetime, PIN length, SMS code (OTP send) caps. The MFA part was resolved by ADR-008. |
| **Amends** | `docs/adr/013-onboarding-and-login.md` (4-digit PIN from Figma → 6 digits) |
| **Still OPEN under Decision 2** | PIN hashing algorithm and parameters; per-IP and per-endpoint API rate limits; account recovery procedure; S-2 (authorization enforcement approach) and S-3 (tenant/organization model); auth provider choice (custom vs Clerk, Standing Standards §14) |

## 1. Decision

| Parameter | Value | Notes |
|---|---|---|
| Idle lock | **5 minutes** without use | The app asks for the PIN or biometrics again. The user's data is kept (same person). |
| Maximum session | **7 days** after a full log-in | Then a full log-in is required (PIN, plus 2FA on a new device per ADR-008). Biometric unlock does **not** extend it. SMS codes are **not** a log-in factor (ADR-008); they only prove phone ownership. |
| PIN | **6 digits** | Replaces Figma's 4 (1,000,000 combinations instead of 10,000). Weak PINs still refused: all one digit, straight runs (123456, 654321, wrapping 890123). |
| SMS codes | **5 per hour, 10 per day** per phone number | Covers every SMS code sent to a number (phone verification at sign-up and on a phone change). **Server-enforced only**: a limit in the app is not a control, so the demo app does not imitate it. |

Unchanged: 5 wrong PINs → 15-minute lock (ADR-008/013); 60-second resend wait; codes
expire after 10 minutes.

## 2. What the server must do (backend auth slice)

- Session: short-lived access token plus a rotating refresh token whose absolute lifetime is
  7 days from the PIN log-in; refresh refused after 5 minutes without an authenticated call
  from that device unless re-verified with PIN or a device-bound biometric key; revocation
  on log-out. Exact token lengths are implementation detail within these limits.
- PIN: verified only on the server, stored only as a slow salted hash (algorithm and
  parameters still OPEN, see header).
- SMS: count per phone number in rolling 1-hour and 24-hour windows (Redis, per the backend
  spec); the 6th request in an hour or 11th in a day is refused with a neutral message.

## 3. Implementation (mobile demo)

- `mobile/src/features/auth/pin.ts` — `PIN_LENGTH = 6`; log-in field and PIN pad follow it.
  Demo PIN is now `482613`.
- `mobile/src/features/auth/session.ts` — `IDLE_LOCK_MS`, `SESSION_MAX_MS`, `touch`,
  `enforceTimeouts`; the PIN log-in time is kept on the device (a timestamp, not a secret) so
  the 7-day limit survives an app restart, and is cleared on log-out.
- `mobile/src/features/auth/useIdleLock.ts` and `app/(app)/_layout.tsx` — any touch is
  activity; checked every 15 seconds and when the app returns to the foreground.
- Log-in screen says why the session ended (idle or 7 days).
- Tests: `mobile/__tests__/session-timeouts.test.tsx`; updated onboarding and
  security-review tests.

## 4. Consequences

- Figma's 4-box PIN screens become 6 dots; the design file should be updated to match.
- Users unlock more often than with a longer idle time; this was chosen for safety.
