# ADR-026 — Milestone AUTH-2: Two-Factor Authentication on the Server

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-032 |
| **Authority** | Product owner, 2026-10-18: "start AUTH-2 (2FA)"; then, asked about three settings ADR-008 left open, chose **"At sign-up, always"**, **"One action, within 5 min"** and **"30 days"** — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Implements** | `docs/adr/008-two-factor-authentication.md` (DEC-014) on the server: authenticator-app TOTP, recovery codes, trusted devices, step-up, 5-wrong-codes lock, 24-hour payout hold after recovery or reset |
| **Amends** | `docs/adr/025-auth-1-server-sign-in.md` §2: `verify-phone` and `login` no longer issue a session on their own — every session now requires the second factor or a trusted device |
| **Authorizes** | **Milestone AUTH-2** (scope §4). No money table; no money endpoint. |

## 1. Decisions

| Item | Decision |
|---|---|
| When 2FA is set up | **At sign-up, always.** After the phone is confirmed the user must add an authenticator app before any session exists. An account without 2FA cannot be used. |
| Step-up | **One action, within 5 minutes.** A fresh code buys one approval, bound to the action, the session and the user, valid 5 minutes, used once. |
| Trusted device | **30 days** from the 2FA check on that device. Then the next log-in there asks for a code again. Users can list and remove trusted devices. |

## 2. Server rules

- **Factor:** TOTP per RFC 6238 (HMAC-SHA1, 6 digits, 30-second step, ±1 step), secret 160
  bits generated on the server, shown once, stored **encrypted** (AES-256-GCM, key
  `MFA_ENCRYPTION_KEY`, separate from the signing key). Each code works once: a step at or
  before the last accepted step is refused (replay, RFC 6238 §5.2).
- **Challenges:** after the PIN (or phone confirmation) the server returns
  `{mfa_required: true, mfa_challenge_id, enrolment_required}` instead of tokens. A challenge
  lasts **5 minutes** for log-in (contract §3.1) and **10 minutes** for enrolment (time to
  install an app; same as the SMS code expiry, ADR-024), allows 5 tries, and is used once.
- **Lock:** 5 wrong codes (any challenge or step-up) → 2FA attempts locked 15 minutes
  (ADR-008), as `AUTH_429_RATE_LIMITED`.
- **Recovery codes:** 10, single use, shown once, stored only as keyed hashes. A recovery code
  can replace the authenticator code at log-in. Using one, or replacing the authenticator,
  sets a **24-hour payout hold** (ADR-008) that future payout endpoints must honour.
- **Trusted device:** a 256-bit device token returned after a 2FA check, stored only as a
  hash, sent back at log-in. A client-chosen `device_id` is a label only and never grants
  trust. Removing a trusted device, replacing the authenticator or using a recovery code
  ends trust on every device.
- **Step-up actions:** `beneficiary.add`, `beneficiary.remove`, `contact.change`,
  `pin.change`, `mfa.change`, `recovery_codes.regenerate`, `trade.accept`, `payout.confirm`
  (ADR-008 §2). An endpoint requiring one reads the `X-Step-Up-Token` header.
- **2FA cannot be switched off**; the authenticator can only be replaced after passing 2FA.
- **Alerts:** ADR-008 requires an email alert on lock and new-device sign-in. No email
  provider exists, so the server records a `security_alert` audit log line (user ID only)
  where an email will be sent once a provider is approved.

## 3. Endpoints (additions to the API contract)

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/auth/mfa/enrol/start` | challenge → authenticator secret and `otpauth://` link (once) |
| `POST /api/v1/auth/mfa/enrol/confirm` | challenge + first code → session, recovery codes, device token |
| `POST /api/v1/auth/mfa/verify` | contract §3.1: challenge + code (or recovery code) → session, device token |
| `POST /api/v1/auth/step-up` | signed in + action + code → single-use step-up token |
| `POST /api/v1/users/me/recovery-codes` | step-up `recovery_codes.regenerate` → 10 new codes |
| `POST /api/v1/users/me/mfa/replace/start`, `/confirm` | step-up `mfa.change` → new authenticator |
| `GET /api/v1/users/me/trusted-devices`, `DELETE …/{id}` | list and remove trusted devices |

`login` gains an optional `device_token`. Error identifiers: contract only
(`AUTH_401_INVALID_OTP`, `AUTH_410_CHALLENGE_EXPIRED`, `AUTH_429_RATE_LIMITED`,
`AUTH_401_UNAUTHORIZED`, `AUTH_403_FORBIDDEN`, `RES_404_NOT_FOUND`). A missing or wrong
step-up token answers `AUTH_403_FORBIDDEN`.

## 4. Scope and limits

In scope: tables `mfa_factors`, `mfa_challenges`, `recovery_codes`, `trusted_devices`,
`step_up_grants` and three user columns (migration 0004); the endpoints above; tests.
Out of scope: **passkeys** (need a native module, an EAS build and a relying-party domain —
ADR-008 §3), email delivery, wiring the mobile app, payout endpoints (they will read the hold).

## 5. Implementation (2026-10-18)

| Part | Where |
|---|---|
| TOTP, sealing, recovery codes | `backend/app/core/mfa.py` (`pyotp`, `cryptography` AES-GCM) |
| Settings and constants | `backend/app/core/config.py` (`mfa_encryption_key`), `backend/app/domain/auth_rules.py` |
| Tables + migration 0004 | `backend/app/models/identity.py`, `migrations/versions/0004_two_factor_tables_auth_2.py` |
| Flows | `backend/app/services/auth.py` (`login`, `verify_phone`, `enrol_*`, `mfa_verify`, `step_up`, `consume_step_up`, `replace_*`, trusted devices) |
| Routes | `backend/app/api/v1/auth.py`; schemas `backend/app/schemas/auth.py` |
| Tests | `backend/tests/unit/test_mfa_primitives.py` (incl. RFC 6238 vector), `backend/tests/integration/test_two_factor_api.py`; AUTH-1 tests updated to the 2FA flow |

`consume_step_up` is the hook future sensitive endpoints call (with their own commit) — the
step-up approval is spent in the same transaction as the action it approves.
