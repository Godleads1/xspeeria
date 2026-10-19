# ADR-048 — Face ID / Fingerprint Unlock After the Idle Lock (Server Builds)

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — 2026-10-19 |
| **Decision ID** | DEC-055 |
| **Authority** | Product owner, 2026-10-19: "Fingerprint / Face ID in the real app. Should it unlock the app after the 5-minute idle lock instead of the PIN?" → "yes". Follows ADR-024 §2 ("refresh refused after 5 minutes … unless re-verified with PIN or a device-bound biometric key"), ADR-008 ("Biometric unlock is allowed only on a device already trusted"), ADR-018 / review SEC-02 (key-backed, not a stored flag). |

## Decision

1. **Turn on** (Profile › Security › "Unlock with Face ID / fingerprint"): the phone first asks for Face ID/fingerprint, then `POST /api/v1/auth/biometric {device_token}` (signed in). The server issues a random **unlock key** for *this session* only if the device token is a live trusted device of this user (`403 AUTH_403_DEVICE_NOT_TRUSTED` otherwise). It keeps only its SHA-256 hash and the trusted device's id on the session row. The phone keeps the key in the keychain/keystore with `requireAuthentication` (`expo-secure-store`), so it is released only after Face ID/fingerprint. No key on phones/browsers without that protection.
2. **Idle lock** (5 minutes, ADR-024): with it on, the app drops the access token but keeps the refresh token. With it off, the session ends as before.
3. **Unlock**: Face ID/fingerprint releases the key; `POST /api/v1/auth/biometric/unlock {refresh_token, unlock_key}` resumes the same session (new token pair, refresh token rotated). Refused (`401`) when: the session is revoked or past its **7-day** limit (never extended); the refresh token is unknown or spent (spent → session ended, token reuse); no key; the device is no longer trusted; the account is inactive. `429` while the PIN is locked. **A wrong key for a real session ends it** (`revoke_reason = unlock_failed`): it means someone holds a copied refresh token.
4. **Off / log-out**: `DELETE /api/v1/auth/biometric` clears the key; log-out ends the session and the app deletes the key. A new PIN log-in issues a new key automatically if the account had it on.

## Data

Migration `0015`: `auth_sessions.unlock_key_hash CHAR(64)`, `auth_sessions.unlock_device_id → trusted_devices.id` (both or neither), `revoke_reason` adds `unlock_failed`. Downgrade refuses without `-x records_downgrade=authorized`.

## Evidence

- `backend/tests/integration/test_biometric_unlock_api.py` (7): unlock after idle and 7-day cap; trusted device only; wrong key ends the session; current refresh token only; stops after log-out / turning off / un-trusting; refused while PIN locked; key bound to its own session.
- `mobile/__tests__/biometric-unlock-server.test.tsx` (9).

## Not verified

Real-device behaviour of `requireAuthentication` on iOS and Android (needs a development build on a phone). On Android, saving the key may itself show the fingerprint prompt.
