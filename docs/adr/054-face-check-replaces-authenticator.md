# ADR-054 — Face Check Replaces the Authenticator App; Paying From Someone Else's Account (Pending)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (owner) — 2026-10-20; design **PROPOSED**; not built |
| **Decision ID** | DEC-061 |
| **Supersedes** | ADR-008's choice of an authenticator app (TOTP) as the user's second factor. ADR-008's *rule* stays: a second check besides the PIN on a new phone and before sensitive changes (SEC-002). |
| **Authority** | Product owner, 2026-10-20: "remove the authenticate stuff … they will have to verify their kyc … sent email that the user tried to login … use face verification to confirm if the user is actually the [one who] transfer[s] money to the escrow account"; then chose **"Face check (Recommended)"**. On paying in: "the money can come from another person depending on the relationship." |

## Decision 1 — second check = face check (built next)

| Moment | Before identity check (KYC) approved | After KYC approved |
|---|---|---|
| Sign-up | SMS code (phone) + email code | — |
| Log-in on a new phone | SMS code + email code | **Face check**: live selfie matched to the KYC photo (Didit biometric authentication) |
| Add/remove payout account, choose where a deal is paid, change phone, change PIN, "I have paid" | — (not possible before KYC) | **Face check** |
| Forgot PIN | SMS code + email code | SMS code + **face check** |

- **Email alert** to the registered address on every new-phone log-in and every sensitive change ("was this you?"). Dev builds print it to the server console until Resend has a domain (ADR-044).
- Trusted phones (30 days) and Face ID/fingerprint unlock after the idle lock (ADR-048) stay.
- Still two factors: PIN (something you know) + face (something you are) — meets SEC-002 and the API contract's "MFA mandatory post-KYC". SMS alone is never a log-in factor after KYC (SIM-swap risk, ADR-008).
- Authenticator app, recovery codes and their screens are removed. If a face check keeps failing, the user contacts Support (Disputes, ADR-050).
- **Cost:** Didit lists biometric authentication at about **$0.10 per check** (pricing page, 2026-10-20; to confirm in the Didit contract). Trusted phones keep the count low.

## Decision 2 — paying in from someone else's account (NOT built; needs legal sign-off)

The owner wants a person to be able to pay into escrow from another person's account "depending on the relationship". Today: own-name accounts only (banking spec §3.3; ADR-022; DEC-007 still open). Third-party funding is a known money-laundering and fraud route, so before building: lawyer and compliance sign-off, partner-bank acceptance, which relationships qualify (e.g. spouse, parent), what proof, limits, and how the bank reports the payer's name. Until then the app keeps "pay from an account in your name".

A face check proves **who** pressed "I have paid"; only the partner bank confirms the money **arrived**. Funds are released only on the bank's confirmation (ADR-001, unchanged).
