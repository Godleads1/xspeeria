# ADR-104 — Redo Identity Check for Customers Who Can't Pass the Face Check

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-09 (Didit's face reference afterwards: **NOT VERIFIED**) |
| **Decision ID** | DEC-116 |
| **Authority** | Owner, 2026-11-09. Asked whether to build a "redo your identity check" button: **"Yes."** Asked how to make sure the new check is the account holder: **"Same ID, else staff (Recommended)"**. Asked whether to test Didit's behaviour in the sandbox: **"Yes, test in sandbox (Recommended)"**. |
| **Builds on** | ADR-054 (face check at a new-phone log-in), ADR-041 (one person, one account; keyed document hash), ADR-042 (same person across countries), ADR-069 (two-person approval of held checks), ADR-103 (support procedure, "Need help?"). |

## Problem

A customer whose face check keeps failing on a new phone (for example, they look different from their identity-check photo) can't log in. The approved support procedure sends them through the checks; it needs a check that doesn't depend on the old photo.

## Decision

1. **Compliance asks** (`kyc.update`): admin console → Users → *Ask for a new identity check*, with a reason (5–300 characters). `POST /api/v1/admin/users/{id}/identity-redo`. Only for a customer with an approved identity check. *Cancel* goes back to the face check (`…/identity-redo/cancel`). Both are in the staff audit log (`identity_redo_requested`, `identity_redo_cancelled`). Signed-in phones are not affected.
2. **The next log-in on a new phone** asks for method `kyc` instead of `face`: the app opens a full Didit identity check (ID document + selfie) through `POST /api/v1/auth/checks/{id}/kyc`, then asks for the result at `…/kyc/result`. Codes and the face check can't finish it. The result is refused while the check runs (409) or is reviewed (409 `AUTH_409_KYC_IN_REVIEW`); a declined check counts as a failed try (the usual 5-failure lock) and a new one can be started.
3. **Same person, decided on the server** (owner: "Same ID, else staff"):
   - the **same ID document** as the approved check (same keyed document hash, current or previous key) → it counts at once;
   - a **different document** (a renewed passport, another ID type) → held with `REDO_NEW_DOCUMENT`; two staff (one recommends, a different one confirms, ADR-069) compare it before it counts;
   - the existing rules still apply first: a document verified on another account (ADR-041) or a different name or birth date (ADR-042) is held.
   So a thief who passes an identity check with their own ID is never let in automatically.
4. **When the new check is approved**, the old approved check in that country ends ("expired", "Replaced by a new identity check.") in the same transaction, before the new one is written (one ID document may have only one approved check). Compliance's request is cleared when the log-in that used it finishes, so a log-in started after the approval still uses the new check.
5. **While the redo runs**, the account keeps its approved check: the customer's status, the console's identity status and offers are unchanged.

**Data.** Migration **0048**: `users.identity_redo_requested_at` and `identity_redo_reason`; `kyc_cases.purpose` (`standard` / `redo`, protected by the existing guard trigger, which now refuses a change of purpose); review reason `REDO_NEW_DOCUMENT`; verification method `kyc` with `verification_checks.kyc_case_id`. The downgrade refuses while any redo check exists.

## Amendment: Forgot PIN (2026-11-10)

**Owner:** "Redo check, same ID". This is for a customer whose selfie no longer matches during a forgotten-PIN reset.

- **When it applies:** once Compliance has asked for a new identity check (the same button, usually after a "Need help?" request), the next **Forgot PIN** asks for it in place of the face check:
  1. SMS code;
  2. the identity check (ID document and selfie);
  3. the new PIN.
- **Same ID document:** the new PIN is saved, the old check ends, and the request is cleared.
- **A different document:** it waits for two staff, as at log-in. The PIN stays unchanged until then.
- **Without a request from Compliance,** Forgot PIN stays on the face check. Customers can't ask for the identity check themselves. A thief with the SIM card would otherwise only need an ID of their own.
- **Evidence:**
  - `test_identity_redo.py`: `test_forgot_pin_uses_the_redo_check_and_the_same_id_resets_the_pin`, `test_forgot_pin_with_another_id_waits_for_two_staff`, `test_without_a_redo_request_forgot_pin_stays_on_the_face_check`.
  - Mobile: `forgot-pin-server.test.tsx`.

## Not verified

**Which face Didit uses for later face checks.** Didit's documents say a face check reuses a stored face, "approved liveness face first", but not which one when a person has two approved checks. In the sandbox, simulated sessions store no face (a face check after a simulated approval is refused with 400), so the sandbox can't answer it (tested 2026-11-09, sandbox application only, no real person). Until Didit answers or one real check is run in the live account, a customer may still fail later face checks after a redo; the fallback is another redo.

## Risks accepted

- A redo approved on the same document lets the person in without staff; it relies on Didit's document and liveness checks, as the first identity check did.
- The log-in check waits up to **1 hour** (`KYC_REDO_CHECK_TTL`, chosen while building); the identity check itself stays on the account, so a later log-in can still use it.
- The log-in and **Forgot PIN** use the redo (Forgot PIN since 2026-11-10, below). "Confirm it's you" still uses the face check.

## Evidence

- `backend/tests/integration/test_identity_redo.py` (6 tests): same document lets the customer in and ends the old check; a different document waits for two staff; a different birth date is held; a declined check is a failure and can be taken again; only `kyc.update` asks, with a reason, for a verified customer, audited, and cancel goes back to the face check; `purpose` can't be changed.
- `backend/tests/unit/test_route_access.py`: the two log-in routes are listed as public (the check id is the credential, as for the face check).
- `mobile/__tests__/server-auth.test.tsx`: the `kyc` method uses the new routes; the check screen asks for the ID with no code fields.
- `admin/__tests__/users.test.tsx`: Compliance asks and cancels with a reason; staff without `kyc.update` aren't offered it.
