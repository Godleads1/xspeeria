# ADR-018 — Independent Review Remediation (Demo Hardening)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-024 |
| **Authority** | Product owner, 2026-10-17: "start with this [independent security review …] use the enterprise standard security measure to vet this codes" — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Evidence** | `docs/07-security/reviews/2026-10-17-independent-review.md` |

## 1. Context

Three independent, read-only reviewers (security, QA, financial integrity) examined `main`
at `91a7152` against OWASP MASVS v2, OWASP Mobile Top 10 (2024), OWASP ASVS L2, CWE, the
Security Master Audit and the Standing Standards. Findings were re-verified against the code
before any change. No Critical findings. Four High, the rest Medium/Low/Info.

## 2. Decisions

1. **DEMO_MODE comes from the build, not a hand-set constant.** `DEMO_MODE = __DEV__`.
   A release build shows "Not available yet" instead of the app; log-in, biometric log-in
   and sign-up refuse; trades never advance on their own. (Supersedes ADR-013's "set
   DEMO_MODE to false before release" manual rule.)
2. **One user's data never reaches the next.** Every user-scoped store registers a reset
   with `session.onUserChange`; it runs on log-out and when a new account is created.
   Biometric log-in is bound to the account it was turned on for.
3. **A verified phone/email change is the log-in identity** (`session.updateContact`).
4. **Each TOTP code is accepted once** (RFC 6238 §5.2): the last accepted time step is kept
   and a code from that step or earlier is a wrong attempt. Enrolment cannot overwrite an
   existing secret or clear a lock.
5. **Codes are never reissued silently.** An expired or used-up sign-up code needs an
   explicit resend, after the 60-second wait.
6. **Secrets on the clipboard clear after 60 s** (only if unchanged); recovery codes block
   screenshots wherever shown.
7. **Money input is strict:** commas only as correct thousands groups; route parameters
   digits-only; a quote that cannot be computed safely is refused before navigation.
   `quoteMinor` refuses negative input.
8. **Listing capacity is consumed by live trades** (Standing Standards §7.1); a request for
   an extension made before the deadline holds expiry until answered; a trade cannot be
   cancelled after its deadline; one rating per completed trade.
9. **Receipts show recorded amounts and status-true wording**; an unknown seller fee is
   shown as "+ fee", never folded into a bare total.
10. **Other hardening:** support-chat secret filter normalises input and covers recovery
    codes, spaced 2FA codes, PINs and authenticator keys without blocking amounts; ABA
    prefix + all-zero checks; SSN field excluded from autofill; ID-document photos
    re-encoded (metadata dropped); Android `allowBackup: false`; admin security headers;
    npm-audit gate refuses future-dated approvals, unknown severities and count mismatches.

## 3. Open — needs a human decision (not changed)

| Item | Conflict / gap |
|---|---|
| **Rounding rule** (FIN-01) | ADR-002 §4.4 `ROUND_HALF_EVEN` vs ADR-014 / ADR-009 "half-up". Mobile currently rounds half-up. |
| **Partial fill** (FIN-13) | Standing Standards §7.3 "never clamp / take whatever remains / partially fill without explicit request" vs ADR-014 §33 confirm sheet offering the smaller amount the listing has. |
| Rate precision & currency scale (FIN-10) | Mobile holds rates as hundredths and assumes scale 2; ADR-002 specifies `NUMERIC(12,6)` rates and versioned scales. Resolve when the trades API is built (server computes, app displays). |
| Unwinding after partial funding (FIN-09) | ADR-001 T5 `UNWINDING` not modelled in the demo; "Nothing was taken from you" must come from bank evidence. Trades API slice. |
| OTP per-day caps, session length, rate limits | Open Decision 2. |
| Biometric login with a device-bound key (SEC-02) | Needs `expo-secure-store` with user authentication and the server device registry (ADR-008); backend auth slice. |

## 4. Consequences

- Expo Go and development builds behave as before; a release build is inert until real
  services replace the demo paths.
- On log-out the demo user's in-memory changes (added beneficiaries, trades, 2FA) are
  cleared, as a real app clears its cache; the server will be the source of truth.
- Tests: `mobile/__tests__/security-review.test.tsx` (80 tests) and 7 more gate tests in
  `backend/tests/unit/test_npm_audit_gate.py`.
