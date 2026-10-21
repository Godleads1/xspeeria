# ADR-054 — Face Check Replaces the Authenticator App; Paying From Someone Else's Account (Pending)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (owner) — 2026-10-20; Decision 1 **IMPLEMENTED** 2026-10-20 (server + app); Decision 2: paying from someone else's account **not allowed** |
| **Decision ID** | DEC-061 |
| **Supersedes** | ADR-008's choice of an authenticator app (TOTP) as the user's second factor. ADR-008's *rule* stays: a second check besides the PIN on a new phone and before sensitive changes (SEC-002). |
| **Authority** | Product owner, 2026-10-20: "we can use finger print for that" → chose fingerprint on a trusted phone, face check only on a new phone or for recovery ("Yes, that mix"). Earlier the same day: "remove the authenticate stuff … they will have to verify their kyc … sent email that the user tried to login … use face verification to confirm if the user is actually the [one who] transfer[s] money to the escrow account"; then chose **"Face check (Recommended)"**. On paying in: "the money can come from another person depending on the relationship." |

## Decision 1 — second check = face check (built 2026-10-20)

| Moment | Before identity check (KYC) approved | After KYC approved |
|---|---|---|
| Sign-up | SMS code (phone) + email code | — |
| Log-in on a new phone | SMS code + email code | **Face check**: live selfie matched to the KYC photo (Didit biometric authentication) |
| Add/remove payout account, choose where a deal is paid, change phone, change PIN, "I have paid" — **on a trusted phone** | — (not possible before KYC) | **Fingerprint / Face ID on the phone** (device-bound key, ADR-048 mechanism; free) |
| The same actions where the phone has no fingerprint/Face ID set up, or the device key fails | — | **Face check** |
| Forgot PIN | SMS code + email code | SMS code + **face check** |

- **Email alert** to the registered address on every new-phone log-in and every sensitive change ("was this you?"). Dev builds print it to the server console until Resend has a domain (ADR-044).
- Trusted phones (30 days) and Face ID/fingerprint unlock after the idle lock (ADR-048) stay.
- Still two factors: PIN (something you know) + face (something you are) — meets SEC-002 and the API contract's "MFA mandatory post-KYC". SMS alone is never a log-in factor after KYC (SIM-swap risk, ADR-008).
- Authenticator app, recovery codes and their screens are removed. If a face check keeps failing, the user contacts Support (Disputes, ADR-050).
- Why not fingerprint everywhere: the phone's fingerprint proves only that a finger saved on *that* phone was used. On a new phone a thief would use their own finger, so a new phone always needs the face check against the KYC photo.
- **Cost:** Didit lists biometric authentication at about **$0.10 per check** (pricing page, 2026-10-20; to confirm in the Didit contract). Trusted phones keep the count low.

## Decision 2 — paying in from someone else's account: **NOT ALLOWED** (owner, 2026-10-20)

> **Update 2026-10-20 (product owner):** "you can not pay from someone else's account". Paying into escrow from another person's account is **not allowed**; only an account in the user's own name may be used (banking spec §3.3, ADR-022, unchanged). The earlier wish below is withdrawn and nothing will be built for it.

### Earlier note (withdrawn)

The owner wants a person to be able to pay into escrow from another person's account "depending on the relationship". Today: own-name accounts only (banking spec §3.3; ADR-022; DEC-007 still open). Third-party funding is a known money-laundering and fraud route, so before building: lawyer and compliance sign-off, partner-bank acceptance, which relationships qualify (e.g. spouse, parent), what proof, limits, and how the bank reports the payer's name. Until then the app keeps "pay from an account in your name".

A face check proves **who** pressed "I have paid"; only the partner bank confirms the money **arrived**. Funds are released only on the bank's confirmation (ADR-001, unchanged).


## Implementation (Decision 1) — 2026-10-20

**Server.** Migration `0017` adds `verification_checks` (one row per check: purpose `signup`/`login`/`step_up`/`pin_reset`, method `email`/`sms_email`/`face`, keyed code digests, the provider's face session id and `approved`/`declined`, tries, expiry). The authenticator tables stay, unused (no history dropped). Routes:

| Route | Use |
|---|---|
| `POST /auth/verify-phone` | SMS code right → an `email` check (code sent to the account email) |
| `POST /auth/login` | Trusted phone → tokens; otherwise a check: `sms_email` before KYC, `face` after |
| `POST /auth/checks/{id}/codes` | Finish sign-up/log-in with the email code (+ SMS code) → tokens and a trusted-phone token |
| `POST /auth/checks/{id}/face`, `/face/result` | Open the face check (link shown once, never stored); the result (409 while running) |
| `POST /auth/step-up` | Fingerprint/Face ID: the session's unlock key (ADR-048) → a one-use approval |
| `POST /auth/step-up/checks`, `/{id}/code`, `/{id}/face`, `/{id}/face/result` | No fingerprint: face check after KYC, email code before |
| `POST /auth/pin-reset/start`, `/verify`, `/confirm` | Forgot PIN: SMS code → face check or email code → new PIN |

Removed: `/auth/mfa/enrol/*`, `/auth/mfa/verify`, `/users/me/recovery-codes`, `/users/me/mfa/replace/*`, and the `mfa.change` / `recovery_codes.regenerate` actions.

**Rules chosen while building** (conservative; the owner may change them): codes last 10 minutes and a face check 15; 5 failures across checks lock checks for 15 minutes (ADR-008) and email an alert; at most 5 checks an hour and 10 a day per account (each may send an SMS, an email or cost a face check); a step-up before KYC (e.g. changing the PIN) uses an email code; a declined face check ends that check (start again). The face result is **fetched from Didit** (`GET /v3/session/{id}/decision/`) rather than taken from a webhook, so the existing Didit webhook is unchanged. It passes only if the session status is `Approved`, the decision is for the same user (`vendor_data`), and every liveness check and face match is `Approved`; anything else is a failure (fail closed).

**Settings.** `DIDIT_AUTH_WORKFLOW_ID` (a Didit workflow of type `BIOMETRIC_AUTHENTICATION`, created by the owner; uses `DIDIT_API_KEY`). Local only: `DEV_EMAIL=true` prints email codes/alerts in the server window; `FACE_CHECK_DEV=true` passes face checks without a camera. Both refused outside `APP_ENV=local`. Without an email sender, sign-up answers 503; without a face provider, a KYC-approved user's new-phone log-in answers 503.

**App.** One check screen for sign-up and log-in (codes or face check); "Confirm it's you" tries Fingerprint/Face ID first and otherwise shows the face check or email code; Forgot PIN is SMS code + new PIN, then the check; authenticator screens removed from server builds (the offline demo keeps its on-device mock). Security → "How we check it's you" explains the checks.

**Not verified:** a live Didit biometric-authentication session; a real email provider; the fingerprint prompt on a real phone (Expo Go / development build).
