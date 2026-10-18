# ADR-008 — Two-Factor Authentication (MFA)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-014 |
| **Authority** | Product owner, 2026-10-17: "design a very strong 2 FA authentication", then selected **"Strongest (Recommended)"** from the proposal below — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Resolves** | The **MFA** part of Open Decision 2 (Standing Standards §15). **Password policy, session lifetime and rate-limit specifics remain OPEN.** |

---


> **Update 2026-10-18:** the open settings were decided and the server side is built in
> Milestone AUTH-2 — 2FA at sign-up, single-use 5-minute step-up, 30-day trusted devices —
> `docs/adr/026-auth-2-two-factor.md`.

## 1. Context

Standing Standards §7.7 makes *qualifying MFA* part of `TRANSACTION_ELIGIBLE`, and the
Security Master Audit B6 requires that MFA cannot be bypassed through alternate login paths.
What counts as qualifying MFA was open. Nigeria has a high incidence of SIM-swap fraud,
which makes SMS one-time codes a weak factor for a money product.

## 2. Decision

**Qualifying factors** — a user must enrol at least one and may enrol both:
1. **Passkey** bound to the device (WebAuthn/FIDO2; Face ID / fingerprint). Phishing-resistant.
2. **Authenticator app** TOTP (RFC 6238: HMAC-SHA1, 6 digits, 30-second step, ±1 step
   tolerance at verification; secret ≥ 160 bits, generated and stored **server-side**,
   encrypted at rest).

**SMS and email codes are never a second factor.** Email is used only for security alerts.

**Trusted devices** — sign-in on a new device requires 2FA and triggers an email alert.
Biometric unlock is allowed only on a device already trusted.

**Step-up re-check** — 2FA is verified again, server-side, immediately before:
adding or removing a beneficiary; changing password, email, phone or 2FA settings;
accepting a trade; confirming a payout.

**Recovery** — 10 single-use recovery codes, generated server-side, shown once, stored
only as hashes. Losing every factor and every code → identity re-verification by Support
(KYC-level check), never a self-service bypass.

**Safety rules**
- 2FA **cannot be switched off**; a user can replace a factor only after passing 2FA.
- **5 wrong codes → 15-minute lock** on 2FA attempts, plus an email alert.
- **24-hour payout hold** after a 2FA reset/recovery or a newly added beneficiary.
- Every rule is **enforced on the server**. The app's checks are for user experience only.

## 3. Mobile implementation status (2026-10-17)

| Item | State |
|---|---|
| 2FA overview (Security → 2 FA authentication) | IMPLEMENTED (mock) |
| Authenticator setup: QR + key, code confirmation, recovery codes shown once | IMPLEMENTED (mock) |
| Step-up sheet before adding/removing a beneficiary, with 5-try / 15-min lock | IMPLEMENTED (mock) |
| Each TOTP code accepted once (last used step kept; RFC 6238 §5.2) — ADR-018 | IMPLEMENTED (mock) |
| Passkeys | DOCUMENTED — needs a native passkey module (not in Expo Go), an EAS build and a server relying party with associated domains |
| Trusted devices, new-device alerts, payout hold, Support recovery | DOCUMENTED — server-side |
| Step-up before password/email/phone change, trade acceptance, payout confirmation | DOCUMENTED — wire in as those flows are built |

**Mock-only verifier.** With no backend, the app generates the TOTP secret on the device
(`expo-crypto` CSPRNG) and verifies codes locally (`src/features/security/totp.ts`, tested
against RFC 6238 vectors) so the flow can be tried with a real authenticator app. This is a
stand-in: in production the secret never exists on the device after enrolment and every
verification happens on the server. Secrets and recovery codes are held in memory only and
are lost on reload.

## 4. Consequences

- The backend needs: TOTP enrolment/verify endpoints, attempt counting and lock, recovery
  code hashing, WebAuthn registration/assertion, device registry, and a step-up token that
  sensitive endpoints require (short-lived, single-use, bound to the action).
- Support needs a documented identity-recovery procedure (Compliance).
- Open Decision 2 continues for password policy, session lifetime and rate limits.
