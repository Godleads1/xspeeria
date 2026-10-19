# ADR-047 — Changing the Phone Number; Email and Date of Birth

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — 2026-10-19 |
| **Decision ID** | DEC-054 |
| **Authority** | Product owner, 2026-10-19 ("built them", ADR-045). API contract `PATCH /v1/users/me`: "Phone change re-triggers phone verification"; "Email is immutable post-registration for audit-trail integrity; requires a separate support-mediated flow to change". |

## Phone

1. `POST /api/v1/users/me/phone/start {new_phone}` with a `contact.change` approval → a code is texted to the **new** number (normal SMS limits). The code is bound to the user who asked (keyed with their id), so nobody else can use it.
2. `POST /api/v1/users/me/phone/confirm {new_phone, code}` → the number changes and is marked verified. If another account already has the number, `409 AUTH_409_PHONE_TAKEN` — shown only after the code proved the user holds that number.
- Security alert logged; the old number is masked in logs. Log-in uses the new number from then on.
- App (server builds): Profile › Edit › Phone → new number → authenticator code → SMS code → done.
- **Deviation from the contract shape:** two endpoints instead of `PATCH /users/me`, because a phone change needs a verification step before anything is saved.

## Email and date of birth (server builds)

- **Email** is not changed in the app: a screen explains that Support changes it (contract). No support flow exists yet.
- **Date of birth** comes from the verified ID (ADR-039) and is not editable; the screen says to contact Support if it is wrong. The same applies to the legal name.

Evidence: `backend/tests/integration/test_phone_change_api.py` (4), `mobile/__tests__/change-phone-server.test.tsx` (3).
