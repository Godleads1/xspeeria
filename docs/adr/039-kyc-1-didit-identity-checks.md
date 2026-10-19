# ADR-039 — Milestone KYC-1: Identity Checks with Didit

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (decisions in §2) — details marked PROPOSED in §4 still need confirming |
| **Date** | 2026-10-19 |
| **Decision ID** | DEC-046 |
| **Authority** | Product owner, 2026-10-19: "i want us to connect the kyc https://didit.me/ for verification"; then **"Figma start, Didit capture"**, **"ID document + selfie"** for Nigeria, and checks **"ID + liveness + face match"**, **"Sanctions/PEP screening (AML)"**, **"Age 18+ enforced"**. `DOCUMENT_INDEX.md` §1 rank 2. |
| **Builds on** | Contract §3.3 KYC and data dictionary KYCCases; ADR-016 (region KYC), ADR-029 (KYC gate on offers) |
| **Source** | Didit docs read 2026-10-19: create session (`POST /v3/session/`, `x-api-key`), webhook signing (`X-Signature-V2`, `X-Timestamp`, canonical JSON, ±300 s), decision fields (`id_verifications[]` with `date_of_birth`, `full_name`, `document_type`, `issuing_state`; `liveness_checks[]`, `face_matches[]`, `aml_screenings[]`). |

## 1. The flow

1. The app's own (Figma) screen introduces the check. **Verify** calls `POST /api/v1/kyc/cases`.
2. The server asks Didit for a session (`vendor_data` = the user's id) and returns Didit's
   link **once**. The link is never stored (whoever holds it can continue the check).
   Calling again returns the same unfinished session (Didit's own idempotency).
3. Didit's screens take the ID photo, selfie/liveness and face match, and run sanctions/PEP
   screening. **Xspeeria never receives or stores ID images or document numbers.**
4. Didit sends a signed result to `POST /api/v1/webhooks/didit`. The server checks the
   signature (constant time) and the 5-minute window, records the event id once, confirms the
   session is ours **and** `vendor_data` is that case's user, then moves the case forward only.
5. An **Approved** result is checked again by the server before the user is approved:
   ID, liveness, face match **and** sanctions screening all present and Approved, a readable
   date of birth, a legal name, and **age 18 or older computed by the server** from the date of
   birth (Didit's own `age` is ignored). Anything missing → held for review (logged as a
   configuration error); under 18 → rejected and **no name or date of birth kept**.
6. Offers, deals and payouts require an approved case (`AUTH_403_KYC_REQUIRED`).
   `KYC_DEV_BYPASS` still works on a developer's computer only.

## 2. Decisions

| Item | Decision |
|---|---|
| Provider | Didit, hosted capture (Didit's screens for ID + selfie). Our Figma screens before and after. |
| Nigeria | ID document + selfie through Didit. **NIN/BVN lookup is not confirmed by Didit's site**; the product owner will ask Didit. Figma's "NIN + OTP" screen waits for that answer. |
| Checks required | ID verification, liveness, face match, sanctions/PEP screening — enforced by our server, not only by the Didit workflow. |
| Age | 18+ from the ID's date of birth, on the server. Minors' data not kept. |
| What is stored | `kyc_cases`: status, Didit's status word, legal name, date of birth, ID type, issuing country, decision time and the reason shown to the user. `kyc_webhook_events`: event id, session id, status, verdict (no personal data). |
| User wording | Generic on refusal ("We could not verify your identity…"). **Never says a sanctions list was involved** (tipping-off risk). |
| Retry | A user may start a new check after a rejection or expiry; one open check at a time (DB index). |
| Approval expiry | Didit's "Kyc Expired" moves an approved case to `expired`, which removes market access. |
| Database | Migration 0010. Trigger XS003: status forward only (incl. approved → expired), identity fields set once, owner/session immutable, no deletes; events append-only. App role: `kyc_cases` SELECT/INSERT/UPDATE, `kyc_webhook_events` SELECT/INSERT. |
| Secrets | `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET` — all three or none; never logged or returned; `.env.example` placeholders refused. `httpx` becomes a runtime dependency. |

## 3. Endpoints

| Route | Who | Notes |
|---|---|---|
| `POST /api/v1/kyc/cases` | signed-in user (60/min) | Starts or continues; returns `verification_url` once. 503 if Didit is not configured or unreachable. |
| `GET /api/v1/kyc/cases/current` | signed-in user | Latest check in plain words; legal name only once verified. |
| `POST /api/v1/webhooks/didit` | Didit (signature only) | 256 KB limit, 60/min per address. |

## 4. PROPOSED / deviations from the contract (need confirming)

| Contract | Built | Why |
|---|---|---|
| `POST /v1/kyc/cases` → 409 `KYC_409_CASE_ALREADY_ACTIVE` | Returns the open case and its link again | Didit resumes the same session; a 409 would strand the user |
| `/documents` upload and `/submit` | Not built | Didit captures documents; we never hold images |
| `GET /v1/kyc/cases/{id}` | `GET /v1/kyc/cases/current` | The app needs only "my latest check" |
| Statuses pending_documents, under_review, approved, rejected | + `expired` | Abandoned/expired sessions and expired approvals |
| `legal_name`, `date_of_birth`, `id_type` NOT NULL | Nullable until approved (CHECK enforces them when approved) | Known only after Didit's decision |
| `POST /v1/admin/kyc/cases/{id}/decision` | Not built | Manual review happens in Didit's console for now; staff tools come later |

## 5. Not built / open

- The app screens (next PR): Figma intro, open Didit, return, status.
- NIN/BVN (ask Didit); US SSN flow (ADR-016) — Didit's US options to confirm.
- Matching the verified legal name to payout account names (own-name rule, ADR-022) — next step once real bank name checks exist.
- Webhook delivery to a developer's computer needs a public HTTPS address (for example a tunnel); production needs hosting.
- Didit's data processing agreement, data residency and retention under the Nigeria Data Protection Act — for counsel (brief Q8).

## 6. Evidence

`backend/tests/integration/test_kyc_api.py` (21 cases: normal, resume, approve unlocks market,
review → decline, retry, under 18 at the day boundary, missing checks, sanctions hit, forged/
old/malformed results, wrong user, unknown session, replay, no going back, expiry, provider
down, sign-in, DB triggers and grants, settings) and `backend/tests/unit/test_kyc_rules.py`
(age arithmetic incl. 29 Feb, status words, canonical JSON, signature window, documented
request shape, safe errors that never leak the key).
