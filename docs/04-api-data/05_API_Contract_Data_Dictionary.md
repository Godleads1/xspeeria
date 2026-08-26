<!-- SOURCE DOCUMENT: 05_API_Contract_Data_Dictionary.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

**XSPEERIA**

Wallet-less Peer-to-Peer Fiat Currency Exchange

**DOCUMENT 05 OF 05 — API-DD**

**API Contract & Data Dictionary**

*REST Endpoint Catalogue, Error Codes, Data Schema & Domain Events*

|                  |                                                              |
|------------------|--------------------------------------------------------------|
| **Attribute**    | **Value**                                                    |
| Document Version | v1.0 — Draft                                                 |
| Document Owner   | Staff API Architect / Backend Engineering Lead               |
| Review Cycle     | Every sprint during active development; quarterly thereafter |
| Classification   | Internal — Confidential — Pre-Development Blueprint          |
| Status           | Draft — Pre-Development Blueprint                            |
| Date             | August 2026                                                  |

Version History

|             |          |               |                                                                                             |
|-------------|----------|---------------|---------------------------------------------------------------------------------------------|
| **Version** | **Date** | **Author**    | **Summary of Changes**                                                                      |
| v0.1        | 2026-07  | API Architect | Initial draft from API_DATA_DICTIONARY.md entity list and ARCHITECTURE.md module boundaries |
| v1.0        | 2026-08  | API Architect | Full endpoint catalogue, error codes, data dictionary, and event catalogue                  |

Table of Contents

Executive Summary

This document is the binding contract between Xspeeria’s FastAPI backend and all consuming clients — the React Native mobile app, the Next.js Admin console, and any future banking-partner integrations. It specifies REST conventions, authentication mechanics, every MVP endpoint across the eleven core modules identified in ARCHITECTURE.md, a standardized error catalogue, the full data dictionary for every persisted entity, and the domain event catalogue that underlies the platform’s asynchronous (Celery/Redis) processing model.

> **ASSUMPTION:** *API_DATA_DICTIONARY.md names eight entities and one absolute rule (Decimal for money). ARCHITECTURE.md names the module list and technology stack. Every endpoint path, request/response schema, field-level validation rule, error code, and event payload below is a derived specification consistent with those two documents and with the security controls assumed at the time of writing (Argon2, JWT + rotating refresh, MFA, RBAC, AES-256, audit logging, webhook verification) — whose normative source is unresolved, see the note below. None of this has been confirmed against an actual implementation and must be ratified by backend engineering before being treated as frozen.*

<!-- -->

> **`UNKNOWN — NOT VERIFIED` — missing normative security baseline.** Statements below previously cited a repository document named `SECURITY.md` as their normative source. **No such document exists.** No normative Security Baseline Specification currently exists in this repository, and the security-baseline decision (Decision 2, `AUDIT_PHASE0_2026-08-18.md` §14) remains **OPEN**. Those citations now read "the applicable approved security policy", which is **not yet determined** — the controls described therefore lack their expected normative grounding. Documented requirements are not evidence of implementation or verification.

<!-- -->

> **CANONICAL DOMAIN RECONCILIATION — 2026-08-22.** The schemas and endpoints below have been
> reconciled to **HUMAN-APPROVED PRODUCT SEMANTICS**. Two things must be read separately:
>
> - **HUMAN-APPROVED SEMANTICS** — the meaning: Offer-centred publish-and-accept, partial
>   acceptance, one Offer to many allocations, ceiling-only rate validation, the two-window
>   allocation lifecycle, per-allocation beneficiary selection. These are decided.
> - **PROPOSED API SHAPE** — every path, field name, enum literal and error identifier below.
>   **This document remains DERIVED and NOT RATIFIED** (see the ASSUMPTION above). Reconciling it
>   to approved semantics does **not** make its naming backend-ratified. No endpoint or error-code
>   identifier here is frozen.
>
> Canonical conceptual terminology maps to persisted/API terminology per the glossary in
> `DOCUMENT_INDEX.md`: **`MatchAllocation` = `Match`**, **`KycCase` = `KYCCases`**,
> **`BeneficiaryAccount` = `BENEFICIARIES`**. No table, route or entity is renamed.

1\. API Standards

1.1 REST Conventions

|                 |                                                                                                                                 |
|-----------------|---------------------------------------------------------------------------------------------------------------------------------|
| **Standard**    | **Rule**                                                                                                                        |
| Base URL        | https://api.xspeeria.com/v{n}/ — all endpoints are versioned in the path                                                        |
| Versioning      | Breaking changes increment the major version (v1 → v2); additive/non-breaking changes ship within the current version           |
| Resource naming | Plural nouns, kebab-case for multi-word resources (e.g., /fx-requests, /kyc-documents)                                          |
| HTTP methods    | GET (read), POST (create/action), PATCH (partial update), DELETE (soft-delete/cancel where applicable) — PUT is not used        |
| Content type    | application/json for all request and response bodies; multipart/form-data only for KYC document upload                          |
| Timestamps      | ISO 8601 UTC (e.g., 2026-08-15T10:30:00Z) for every date/time field                                                             |
| Monetary values | Serialized as strings, never JSON numbers, to preserve Decimal precision end-to-end per AGENTS.md ("Never use float for money") |

1.2 Pagination

All list endpoints use cursor-based pagination to remain stable under concurrent writes (critical for the Marketplace and Transaction Timeline, which mutate frequently).

|               |                                        |                                                                      |
|---------------|----------------------------------------|----------------------------------------------------------------------|
| **Parameter** | **Type**                               | **Description**                                                      |
| cursor        | string, optional                       | Opaque cursor returned by the previous page; omit for the first page |
| limit         | integer, optional, default 20, max 100 | Number of items per page                                             |

Response envelope for all list endpoints:

|             |                                            |
|-------------|--------------------------------------------|
| **Field**   | **Description**                            |
| data        | Array of resource objects                  |
| next_cursor | Opaque string, or null if no further pages |
| has_more    | Boolean                                    |

1.3 Filtering & Sorting

List endpoints accept a filter\[field\]=value query convention (e.g., filter\[status\]=pending) and a sort=field,-field2 convention where a leading hyphen denotes descending order. Supported filter/sort fields are enumerated per-endpoint in Section 3.

1.4 Idempotency

**Corrected 2026-08-24. Retention corrected 2026-08-26 by DECISION 4.1A-F2 (HUMAN-APPROVED).** State-mutating POST endpoints that initiate money movement or matching require an `Idempotency-Key` header (client-generated UUIDv4). The server persists the key-to-response mapping; a repeated request with the same key returns the original response **without reprocessing**. **Replay behaviour is required and unchanged.**

> **RETENTION DURATION IS NOT DECIDED — DECISION 4.1A-F2, HUMAN-APPROVED 2026-08-26.** The former wording *"persists the key-to-response mapping for **24 hours**"* is **withdrawn**. It stated an approved expiry duration where none exists, and contradicted the human decision recorded in `PROGRESS.md` (*Idempotency retention/TTL — NOT DECIDED*). A retention window is not a formatting detail on a money path: once a key expires, a retry that would have replayed a stored response instead reprocesses a financial action. **No `expires_at` is approved. No automatic expiry semantics are approved.** Milestone 4.1 persists `created_at` only. A retention duration requires a separate human decision and, once persistence exists, an explicit migration if one is needed.

What changed is the list of operations. The previous wording named *"match confirmation"* and *"settlement initiation"* as its examples, and **both are stale**. Bilateral match confirmation is **withdrawn** (`CORRECTIONS_v3.md` §11.11; `POST /v1/matches/{match_id}/confirm` is SUPERSEDED, §3.5), so the policy cited an operation that no longer exists. Client-triggered settlement initiation is likewise **not** an operation in the active model: no client-facing settlement-initiation endpoint exists, the *"initiation once `both_confirmed = true`"* rule is superseded (§3.6), and partner provisioning becomes actionable only when the allocation reaches `ALLOCATION_FUNDING_READY` (ADR-001 §14.3) — a server-derived gate, not a client POST.

**The endpoint contracts in §3 (§3.1-§3.9) are authoritative for which endpoints carry the header:** an endpoint requires an `Idempotency-Key` when its **Required Headers** row names one. The money-sensitive operations under the active model are **`POST /v1/offers/{offer_id}/accept`** — the canonical acceptance operation that establishes a `Match` — and **`POST /v1/settlements/{settlement_id}/confirm-funds`**, the advisory customer funding claim, **which this policy explicitly covers**, alongside offer creation. **This correction adds the header requirement to no endpoint that did not already declare it**, and removes it from none.

**The routes named above are illustrative canonical examples, NOT an exhaustive enumeration — clarified 2026-08-25.** This section states the *policy*; it is not a route registry, and it must not be read as one. An endpoint requires an `Idempotency-Key` **if and only if** its own §3 **Required Headers** row names one, and that declaration is authoritative on its own. Two consequences, both binding: an endpoint is **never exempt** from the header merely because this section does not name it — the FXRequest creation endpoint (§3.3) declares the header in its own contract and requires it — and naming an endpoint here **grants it nothing** its §3 contract does not already state. Where this section and an endpoint contract disagree, **the endpoint contract wins** and this section is the defect. *Scope note: this is an enumeration/authority clarification only. Whether FXRequest creation is an active MVP user flow or a compatibility-only surface is a **separate OPEN human product decision** and is neither settled nor implied here.*

**"The same key" means the same *bound* request.** A key is bound to the logical request it was first used for; the binding for each endpoint is stated in that endpoint's contract (see the idempotency-scope note for `confirm-funds` in §3.6, and §9.4 of `02_Technical_Design_Specification.md` for acceptance). Presenting a bound key with a materially different request is a **bound-key conflict** and is rejected deterministically with `SYS_409_IDEMPOTENCY_KEY_REUSED` (§4.5) — never served the first request's response.

2\. Authentication

2.1 JWT Structure

|               |                   |                                                     |                                                                                                               |
|---------------|-------------------|-----------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| **Token**     | **Lifetime**      | **Storage**                                         | **Notes**                                                                                                     |
| Access Token  | 15 minutes        | In-memory (mobile), httpOnly cookie (Admin web)     | Bears user_id, role, session_id, kyc_status claims                                                            |
| Refresh Token | 30 days, rotating | Secure storage (Expo SecureStore) / httpOnly cookie | Single-use; each refresh issues a new refresh token and invalidates the prior one (rotation), per the applicable approved security policy |

2.2 MFA

MFA is enforced at login for all users post-KYC-approval and is mandatory (non-optional) for any Admin-role account, consistent with the RBAC posture of the applicable approved security policy. Supported factors: SMS OTP, Email OTP, and TOTP authenticator app.

2.3 Device Sessions

Each successful login registers a device session (device fingerprint, IP, user agent, last-active timestamp). Users can view and revoke active sessions from Settings \> Security. Revoking a session immediately invalidates its refresh token server-side.

3\. Endpoint Catalogue

Endpoints are grouped by module per ARCHITECTURE.md’s core module list: Auth, Users, KYC, Marketplace, Offers, Requests, Matching, Transactions, Settlement, Notifications, Disputes, Admin.

3.1 Auth

**POST /v1/auth/register**

|                  |                                                                                                                                         |
|------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                                       |
| Purpose          | Create a new user account and trigger email/phone verification.                                                                         |
| Permissions      | Public (unauthenticated)                                                                                                                |
| Required Headers | Content-Type: application/json                                                                                                          |
| Request JSON     | full_name (string), email (string), phone (string, E.164), password (string)                                                            |
| Success Response | 201 Created — { user_id, status: "pending_verification" }                                                                               |
| Error Responses  | AUTH_400_EMAIL_TAKEN, AUTH_400_WEAK_PASSWORD, VAL_422_INVALID_PHONE                                                                     |
| Validation Rules | Password minimum 12 characters, must include upper, lower, digit; email must be unique and RFC-5322 valid                               |
| Business Rules   | Account created in unverified state; cannot access Marketplace or Transactions until KYC is approved separately from email verification |

**POST /v1/auth/login**

|                  |                                                                                                            |
|------------------|------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                          |
| Purpose          | Authenticate with email/password and issue tokens or trigger MFA challenge.                                |
| Permissions      | Public (unauthenticated)                                                                                   |
| Required Headers | Content-Type: application/json                                                                             |
| Request JSON     | email (string), password (string), device_fingerprint (string)                                             |
| Success Response | 200 OK — { access_token, refresh_token, mfa_required: false } or { mfa_challenge_id, mfa_required: true }  |
| Error Responses  | AUTH_401_INVALID_CREDENTIALS, AUTH_429_RATE_LIMITED                                                        |
| Validation Rules | Rate-limited to 5 attempts per 15 minutes per account and per IP                                           |
| Business Rules   | Failed attempts increment a rolling counter; account locks for 15 minutes after threshold, per the applicable approved security policy |

**POST /v1/auth/mfa/verify**

|                  |                                                                              |
|------------------|------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                            |
| Purpose          | Complete an MFA challenge and issue tokens.                                  |
| Permissions      | Public (holder of a valid mfa_challenge_id)                                  |
| Required Headers | Content-Type: application/json                                               |
| Request JSON     | mfa_challenge_id (string), otp_code (string, 6 digits)                       |
| Success Response | 200 OK — { access_token, refresh_token }                                     |
| Error Responses  | AUTH_401_INVALID_OTP, AUTH_410_CHALLENGE_EXPIRED, AUTH_429_RATE_LIMITED      |
| Validation Rules | Challenge expires after 5 minutes; max 5 verification attempts per challenge |
| Business Rules   | Successful verification registers a new device session                       |

**POST /v1/auth/refresh**

|                  |                                                                                                             |
|------------------|-------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                           |
| Purpose          | Exchange a valid refresh token for a new access/refresh token pair.                                         |
| Permissions      | Authenticated (refresh token)                                                                               |
| Required Headers | Authorization: Bearer {refresh_token}                                                                       |
| Request JSON     | none                                                                                                        |
| Success Response | 200 OK — { access_token, refresh_token }                                                                    |
| Error Responses  | AUTH_401_INVALID_REFRESH_TOKEN, AUTH_401_TOKEN_REUSE_DETECTED                                               |
| Validation Rules | N/A                                                                                                         |
| Business Rules   | Rotation: reuse of an already-rotated refresh token revokes the entire session chain as a compromise signal |

**POST /v1/auth/logout**

|                  |                                                      |
|------------------|------------------------------------------------------|
| **Field**        | **Specification**                                    |
| Purpose          | Revoke the current session’s tokens.                 |
| Permissions      | Authenticated                                        |
| Required Headers | Authorization: Bearer {access_token}                 |
| Request JSON     | none                                                 |
| Success Response | 204 No Content                                       |
| Error Responses  | AUTH_401_UNAUTHORIZED                                |
| Validation Rules | N/A                                                  |
| Business Rules   | Refresh token is immediately invalidated server-side |

3.2 Users

**GET /v1/users/me**

|                  |                                                    |
|------------------|----------------------------------------------------|
| **Field**        | **Specification**                                  |
| Purpose          | Retrieve the authenticated user’s profile.         |
| Permissions      | Authenticated (self)                               |
| Required Headers | Authorization: Bearer {access_token}               |
| Request JSON     | none                                               |
| Success Response | 200 OK — full Profile object (see Data Dictionary) |
| Error Responses  | AUTH_401_UNAUTHORIZED                              |
| Validation Rules | N/A                                                |
| Business Rules   | N/A                                                |

**PATCH /v1/users/me**

|                  |                                                                                                                     |
|------------------|---------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                   |
| Purpose          | Update mutable profile fields.                                                                                      |
| Permissions      | Authenticated (self)                                                                                                |
| Required Headers | Authorization: Bearer {access_token}                                                                                |
| Request JSON     | full_name (string, optional), phone (string, optional), notification_preferences (object, optional)                 |
| Success Response | 200 OK — updated Profile object                                                                                     |
| Error Responses  | VAL_422_INVALID_PHONE, AUTH_401_UNAUTHORIZED                                                                        |
| Validation Rules | Phone change re-triggers phone verification                                                                         |
| Business Rules   | Email is immutable post-registration for audit-trail integrity; requires a separate support-mediated flow to change |

**GET /v1/users/me/sessions**

|                  |                                      |
|------------------|--------------------------------------|
| **Field**        | **Specification**                    |
| Purpose          | List active device sessions.         |
| Permissions      | Authenticated (self)                 |
| Required Headers | Authorization: Bearer {access_token} |
| Request JSON     | none                                 |
| Success Response | 200 OK — array of Session objects    |
| Error Responses  | AUTH_401_UNAUTHORIZED                |
| Validation Rules | N/A                                  |
| Business Rules   | N/A                                  |

**DELETE /v1/users/me/sessions/{session_id}**

|                  |                                                                                |
|------------------|--------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                              |
| Purpose          | Revoke a specific device session.                                              |
| Permissions      | Authenticated (self)                                                           |
| Required Headers | Authorization: Bearer {access_token}                                           |
| Request JSON     | none                                                                           |
| Success Response | 204 No Content                                                                 |
| Error Responses  | AUTH_401_UNAUTHORIZED, RES_404_SESSION_NOT_FOUND                               |
| Validation Rules | N/A                                                                            |
| Business Rules   | Cannot revoke the session making the current request; use /auth/logout instead |

3.3 KYC

**POST /v1/kyc/cases**

|                  |                                                                                                                     |
|------------------|---------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                   |
| Purpose          | Initiate a KYC case for the authenticated user.                                                                     |
| Permissions      | Authenticated (self, one active case at a time)                                                                     |
| Required Headers | Authorization: Bearer {access_token}                                                                                |
| Request JSON     | legal_name (string), date_of_birth (date), address (object), id_type (enum: passport, national_id, drivers_license) |
| Success Response | 201 Created — { kyc_case_id, status: "pending_documents" }                                                          |
| Error Responses  | KYC_409_CASE_ALREADY_ACTIVE, VAL_422_UNDERAGE                                                                       |
| Validation Rules | date_of_birth implies age ≥ 18                                                                                      |
| Business Rules   | A user may hold only one non-terminal (non-approved/non-rejected) KYC case at a time                                |

**POST /v1/kyc/cases/{kyc_case_id}/documents**

|                  |                                                                                                     |
|------------------|-----------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                   |
| Purpose          | Upload a KYC document (ID, proof of address, liveness selfie).                                      |
| Permissions      | Authenticated (self, case owner)                                                                    |
| Required Headers | Authorization: Bearer {access_token}, Content-Type: multipart/form-data                             |
| Request JSON     | document_type (enum), file (binary, jpg/png/pdf, max 10MB)                                          |
| Success Response | 201 Created — { document_id, status: "uploaded" }                                                   |
| Error Responses  | VAL_422_FILE_TOO_LARGE, VAL_422_UNSUPPORTED_FORMAT, KYC_409_CASE_NOT_EDITABLE                       |
| Validation Rules | Max 10MB per file; only jpg/png/pdf accepted                                                        |
| Business Rules   | Documents are AES-256 encrypted at rest per the applicable approved security policy; upload does not itself advance case status |

**POST /v1/kyc/cases/{kyc_case_id}/submit**

|                  |                                                                                         |
|------------------|-----------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                       |
| Purpose          | Submit a fully-documented case for review.                                              |
| Permissions      | Authenticated (self, case owner)                                                        |
| Required Headers | Authorization: Bearer {access_token}                                                    |
| Request JSON     | none                                                                                    |
| Success Response | 200 OK — { status: "under_review" }                                                     |
| Error Responses  | KYC_400_INCOMPLETE_DOCUMENTS                                                            |
| Validation Rules | All required document_types for the declared id_type must be present                    |
| Business Rules   | Triggers async review workflow (manual and/or automated provider-agnostic verification) |

**GET /v1/kyc/cases/{kyc_case_id}**

|                  |                                                                   |
|------------------|-------------------------------------------------------------------|
| **Field**        | **Specification**                                                 |
| Purpose          | Retrieve KYC case status and history.                             |
| Permissions      | Authenticated (self, case owner) or Admin (kyc.review permission) |
| Required Headers | Authorization: Bearer {access_token}                              |
| Request JSON     | none                                                              |
| Success Response | 200 OK — KycCase object with status timeline                      |
| Error Responses  | AUTH_403_FORBIDDEN, RES_404_CASE_NOT_FOUND                        |
| Validation Rules | N/A                                                               |
| Business Rules   | N/A                                                               |

**POST /v1/admin/kyc/cases/{kyc_case_id}/decision**

|                  |                                                                                                  |
|------------------|--------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                |
| Purpose          | Approve or reject a KYC case.                                                                    |
| Permissions      | Admin only (kyc.review permission)                                                               |
| Required Headers | Authorization: Bearer {access_token}                                                             |
| Request JSON     | decision (enum: approved, rejected), reason (string, required if rejected)                       |
| Success Response | 200 OK — updated KycCase                                                                         |
| Error Responses  | AUTH_403_FORBIDDEN, VAL_422_REASON_REQUIRED                                                      |
| Validation Rules | Reason is mandatory on rejection and is surfaced to the user verbatim                            |
| Business Rules   | Approval unlocks Marketplace/Transaction access for the user; fully audit-logged per the applicable approved security policy |

3.4 Marketplace, Offers & Requests

**GET /v1/marketplace/listings**

|                  |                                                                                                                   |
|------------------|-------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                 |
| Purpose          | List active offers and requests matching filters.                                                                 |
| Permissions      | Authenticated, KYC-approved                                                                                       |
| Required Headers | Authorization: Bearer {access_token}                                                                              |
| Request JSON     | Query: filter\[currency_pair\], filter\[type\] (offer\|request), filter\[min_amount\], filter\[max_amount\], sort |
| Success Response | 200 OK — paginated list of Listing summaries                                                                      |
| Error Responses  | AUTH_403_KYC_REQUIRED                                                                                             |
| Validation Rules | N/A                                                                                                               |
| Business Rules   | **Corrected 2026-08-25 — `marketplace-active` is a FILTER SEMANTIC, not a status literal.** Only **marketplace-active** listings are returned; a user’s own listings are included and flagged is_own: true. See the definition below |

> **`marketplace-active` — filter semantic, defined 2026-08-25.** This rule previously returned
> only listings with `status="active"`. For **`FXRequest`** that literal is valid — `active` is a
> member of its approved enum (`active, matched, cancelled, expired`). For **`Offer`** it is
> **not**: the canonical Offer lifecycle is **`open, partially_matched, fully_matched, withdrawn,
> cancelled, expired`**, and `active` is not a member of it. The listing endpoint spans **both** entity types
> (`filter[type]` = `offer|request`), so a single literal cannot express the rule for both.
>
> **`marketplace-active` therefore means: the listing remains eligible for further acceptance.**
> It is a **query projection over canonical statuses**, evaluated per entity type. **No new
> persisted status literal is introduced, and no existing enum is altered.**
>
> **`marketplace-active` requires BOTH conditions — corrected 2026-08-25:**
>
> 1. **Lifecycle status is eligible** (the table below), **AND**
> 2. **Current policy/rate eligibility is satisfied** (the eligibility note that follows).
>
> Condition 1 alone is **not** sufficient. An Offer can hold an eligible lifecycle status and still
> be excluded because it currently fails condition 2.
>
> | Entity | Lifecycle-eligible (condition 1) | Lifecycle-excluded |
> |---|---|---|
> | **`Offer`** | `open`, `partially_matched` | `fully_matched`, `withdrawn`, `cancelled`, `expired` |
> | **`FXRequest`** | `active` | `matched`, `cancelled`, `expired` |
>
> `partially_matched` is **included** because a partially matched Offer **remains available for
> its remaining amount** (Offer entity, `status`) — excluding it would hide live capacity. A
> `remaining_amount` shown in any listing is **advisory and may be stale**; only the value read
> inside the acceptance serialization boundary is authoritative, and discovery/ranking is **never**
> allocation priority.
>
> **Condition 2 — acceptance eligibility is a separate, reversible, derived condition. Added
> 2026-08-25.** Lifecycle status answers *where the Offer sits in its own life*; eligibility answers
> *may it be accepted right now under current policy*. They are **different questions** and must not
> be collapsed. The motivating case: a change to the applicable approved reference ceiling can leave
> an existing unmatched Offer's locked seller rate **above** the new ceiling. That Offer is not
> cancelled, not expired, not withdrawn and not fully matched — it is simply **not acceptable right
> now**.
>
> Such an Offer **keeps its lifecycle status** (`open` or `partially_matched`) and becomes
> **temporarily INELIGIBLE**, so it is **excluded from `marketplace-active`** and **must not be
> accepted** while ineligible. The rate re-check already required at acceptance (§3.5) is the
> authoritative evaluation; a listing is advisory.
>
> **`paused` is NOT a persisted Offer status and is not introduced.** The canonical enum is
> unchanged. **The seller-selected rate is never silently modified**, existing Matches are **never
> re-priced**, and **no automatic repricing exists**. Ineligibility is **reversible**: when the
> applicable policy permits the Offer again, eligibility is re-evaluated per the documented policy.
> That is exactly why it must not be mapped onto a terminal lifecycle status.
>
> **Persistence mechanism NOT chosen.** A future implementation must be able to evaluate and expose
> acceptance eligibility as a first-class condition distinct from lifecycle status; whether that is
> a derived projection, a cached evaluation or an explicit persisted eligibility field belongs to
> the domain-model milestone. The reference-rate **source, cadence, staleness and
> provider-unavailable policy** that determine when a ceiling changes remain **OPEN** (Decision 3),
> so the *trigger* for re-evaluation is not fixed here — only the **representation rule** is. See
> `CORRECTIONS_v3.md` §11.10b.
>
> **RESOLVED — HUMAN-APPROVED 2026-08-25: `withdrawn` is a canonical Offer status.** A prior
> revision of this note recorded an OPEN status-model gap here, because the enum had no literal
> expressing *"remainder withdrawn, existing allocations intact"* and withdrawal is explicitly
> **not** `cancelled`, **not** `expired` and **not** `fully_matched`. That gap is **CLOSED** by
> human decision: `withdrawn` is now a member of the canonical Offer enum (§ Offer entity,
> `status`), meaning the owner **intentionally withdrew the still-unmatched remainder**.
>
> **`withdrawn` is EXCLUDED from `marketplace-active`.** The operative rule is unchanged — *no new
> acceptance may consume the withdrawn remainder* — but the exclusion now rests on a **named
> canonical status** rather than on an unrepresentable state. Existing `Match`, `Transaction` and
> `Settlement` records under a withdrawn Offer **remain valid and are unaffected by this filter**;
> withdrawal never cascades into allocations, and any previously matched amount **remains part of
> `matched_amount`** under the existing contributing/completed allocation rules.

**POST /v1/offers**

|                  |                                                                                                                                    |
|------------------|------------------------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                                  |
| Purpose          | Create a new FX offer.                                                                                                             |
| Permissions      | Authenticated, KYC-approved                                                                                                        |
| Required Headers | Authorization: Bearer {access_token}, Idempotency-Key: {uuid}                                                                      |
| Request JSON     | source_currency, target_currency, source_amount (Decimal string), desired_rate (Decimal string). **`settlement_window_hours` is withdrawn** — window durations are configurable policy, not user input (ADR-001 §14.4) |
| Success Response | 201 Created — Offer object. **Conceptual status is `open` — annotated 2026-08-25** (the canonical Offer lifecycle is `open, partially_matched, fully_matched, withdrawn, cancelled, expired`; `active` is **not** a member). The literal `"active"` shown in earlier revisions is permitted **only** as a retained persisted/wire name that **maps to `open`**, per the compatibility allowance on `Offer.status`; it asserts no separate state. **No enum is changed here** |
| Error Responses  | **VAL_422_RATE_NOT_POSITIVE** *(rate ≤ 0; HUMAN-APPROVED 2026-08-25)*, VAL_422_RATE_ABOVE_CEILING *(proposed; supersedes `VAL_422_RATE_OUT_OF_BAND`)*, VAL_422_AMOUNT_BELOW_MINIMUM, AUTH_403_KYC_REQUIRED |
| Validation Rules | **HUMAN-APPROVED:** `desired_rate` must be **`> 0` AND ≤ the applicable approved reference ceiling** — `rate ≤ 0` returns **`VAL_422_RATE_NOT_POSITIVE`**; above the ceiling is a **hard block** returning `VAL_422_RATE_ABOVE_CEILING`. **Positivity added 2026-08-25** — see the rate-validity note below. **There is no approved reference-rate floor**; the superseded ±15% symmetric band is withdrawn and is **not** restored. Reference-rate source, update cadence, staleness and provider-unavailable policy remain **OPEN / configurable**. `source_amount` ≥ corridor minimum                          |
| Business Rules   | **Ceiling check** protects counterparties from mispriced or manipulative offers. `0 < seller_rate ≤ applicable approved reference ceiling`; above the ceiling is a hard block; **no reference-rate floor applies**. Re-checked at acceptance; locked on the resulting Match |

> **Rate validity — positivity is an invariant, not a floor. Corrected 2026-08-25.** The approved
> rule was written as *"≤ the applicable approved reference ceiling"* with *"no approved floor"*.
> Read literally that bounds the rate only from above, so `0` and **negative** values satisfied it.
> An exchange rate of zero or below is not a cheap rate — it is **not a rate at all**, and it would
> corrupt every downstream monetary computation that consumes it.
>
> **Two independent constraints, and they must not be confused:**
>
> | Constraint | Kind | Status |
> |---|---|---|
> | `rate > 0` | **Domain validity invariant** — what makes the value a rate | **REQUIRED, always** |
> | `rate ≤ applicable approved reference ceiling` | **Pricing policy** — protects counterparties | **REQUIRED, human-approved** |
>
> **`0` is invalid. Negative is invalid.** Both fail validation as malformed input, not as pricing
> decisions. Positivity is a **domain validity invariant**, **not** a pricing floor: it says nothing
> about how far below the reference rate a seller may price, and it grants no minimum spread.
>
> **What is NOT reintroduced by this correction:** there is still **no approved reference-rate
> floor**; the **±15% symmetric band remains withdrawn** and is not restored; and **no** minimum
> commercial spread, minimum percentage below reference, or numeric lower reference bound is
> introduced, proposed or implied. A seller may still price arbitrarily far below the ceiling.
>
> **Scope and error mapping.** Applies to every canonical rate definition — `Offer.desired_rate`,
> `FXRequest.desired_rate`, the rate supplied on offer edit, and the `Match.agreed_rate` locked at
> acceptance. **Evaluation is ordered: positivity first, then the ceiling.** `rate ≤ 0` returns
> **`VAL_422_RATE_NOT_POSITIVE`** (HUMAN-APPROVED 2026-08-25, §4.2); a positive rate above the
> ceiling returns `VAL_422_RATE_ABOVE_CEILING`. The two are **disjoint** and must never be
> conflated. *A persisted historical `Match` is never revalidated or re-priced by this rule:
> `agreed_rate` is validated at the moment of acceptance and is **immutable once established**.* Reference-rate **source, cadence, staleness and provider-unavailable policy** remain
> **OPEN** (Decision 3) and are unaffected. Existing Match rates are **locked** and are never
> re-priced by this or any other rule.

**POST /v1/fx-requests**

> **Canonical route reconciled 2026-08-25 — naming/compatibility only.** This endpoint was
> published here as `POST /v1/requests` while three other authorities named `/fx-requests`. The
> canonical identifier is **`/v1/fx-requests`**, established by existing repository evidence and
> **not** by any new product decision: §1.1 REST Conventions names `/fx-requests` as its own
> resource-naming example; the **HUMAN-APPROVED disposition of 2026-08-22** in the `FXRequest`
> entity section below states that *"the `/fx-requests` route and all historical references
> stand"*; `02_Technical_Design_Specification.md` §API table publishes `POST /v1/fx-requests`; and
> `Xspeeria_Master_Prompt_Python_Backend.md` publishes `POST|GET /api/v1/fx-requests`. The bare
> `/v1/requests` form was the sole outlier and contradicted a human-approved statement in this
> same document.
>
> **`POST /v1/requests` is retained as a HISTORICAL / COMPATIBILITY ALIAS.** Nothing is deleted
> and nothing is renamed, per that same approved disposition. Where the two forms appear, the
> canonical `/v1/fx-requests` governs and `/v1/requests` is the alias.
>
> *Scope note — this reconciles **route naming only**. Whether FXRequest creation is an **active
> MVP user flow** or a **compatibility-only surface** is a **separate OPEN human product
> decision**, and it is **not** decided, narrowed or implied here. This endpoint's active-MVP
> status is unchanged by this correction. `FXRequest` also remains barred from being an
> alternative Offer-capacity serialization authority (§ Offer acceptance).*

|                  |                                                               |
|------------------|---------------------------------------------------------------|
| **Field**        | **Specification**                                             |
| Purpose          | Create a new FX request (mirror of Offer, inverse direction). |
| Permissions      | Authenticated, KYC-approved                                   |
| Required Headers | Authorization: Bearer {access_token}, Idempotency-Key: {uuid} |
| Request JSON     | Identical shape to POST /v1/offers                            |
| Success Response | 201 Created — Request object, status: "active"                |
| Error Responses  | Identical to POST /v1/offers — including **`VAL_422_RATE_NOT_POSITIVE`** and `VAL_422_RATE_ABOVE_CEILING` |
| Validation Rules | Identical to POST /v1/offers — `desired_rate` must be **`> 0` AND ≤ the applicable approved reference ceiling** (§3.3 rate-validity note) |
| Business Rules   | Identical to POST /v1/offers                                  |

**PATCH /v1/offers/{offer_id}**

|                  |                                                                                                          |
|------------------|----------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                        |
| Purpose          | Edit an active, unmatched offer.                                                                         |
| Permissions      | Authenticated (owner)                                                                                    |
| Required Headers | Authorization: Bearer {access_token}                                                                     |
| Request JSON     | desired_rate (optional) — when supplied it must satisfy the same rate-validity rule as publication: **`> 0` AND ≤ the applicable approved reference ceiling** (§3.3 rate-validity note), rejected with **`VAL_422_RATE_NOT_POSITIVE`** or `VAL_422_RATE_ABOVE_CEILING` respectively. **`settlement_window_hours` is withdrawn**; window durations are configurable policy, not user input (ADR-001 §14.4) |
| Success Response | 200 OK — updated Offer                                                                                   |
| Error Responses  | RES_409_OFFER_ALREADY_MATCHED, AUTH_403_NOT_OWNER, **VAL_422_RATE_NOT_POSITIVE** *(edited rate ≤ 0)*, **VAL_422_RATE_ABOVE_CEILING** *(edited rate > 0 but above the applicable approved reference ceiling; proposed identifier)* — **added 2026-08-25** so this row agrees with the Validation Rules below |
| Validation Rules | **Same rate validity as creation — restated 2026-08-25.** A supplied `desired_rate` must be **`> 0`** (`VAL_422_RATE_NOT_POSITIVE` otherwise) **AND ≤ the applicable approved reference ceiling** (`VAL_422_RATE_ABOVE_CEILING` otherwise). *The former wording "same rate-band validation" is withdrawn: there is **no band** — no reference-rate floor and no ±15% symmetric band. Positivity is a domain validity invariant, not a pricing floor (§3.3 rate-validity note).* Ownership and already-matched constraints are unchanged |
| Business Rules   | Editing an offer that has pending match interest invalidates that interest and notifies the counterparty |

**DELETE /v1/offers/{offer_id}**

|                  |                                                                                                                  |
|------------------|------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                |
| Purpose          | **Withdraw an Offer's remaining availability** — close the Offer to further matching. |
| Permissions      | Authenticated (owner)                                                                                            |
| Required Headers | Authorization: Bearer {access_token}                                                                             |
| Request JSON     | none                                                                                                             |
| Success Response | 200 OK — Offer closed to further matching, **`status: "withdrawn"`**. **RATIFIED 2026-08-25** — `withdrawn` is a canonical member of the Offer status enum by human decision; the earlier *"PROPOSED, not ratified"* qualifier is **superseded** |
| Error Responses  | ~~RES_409_OFFER_ALREADY_MATCHED~~ — **superseded**: an Offer carrying valid allocations may still withdraw its remaining availability |
| Validation Rules | N/A                                                                                                              |
| Business Rules   | **HUMAN-APPROVED, clarified 2026-08-22.** The seller **withdraws the remaining availability**, **closing the Offer to further matching**. This is **not** a cancellation that cascades from Offer to Match. It **must not** cancel, invalidate or alter the `allocated_amount` of any existing Match; **must not** unwind a Transaction or terminate a Settlement; **must not** return capacity already committed to a valid allocation; and **must not** affect any other Match under the same Offer. Every existing valid allocation continues as an **independent failure domain**, and all Match/Transaction/Settlement history remains intact. Only the **uncommitted remainder** becomes unavailable: no new acceptance may consume it. Committed allocations are unwound only through the per-allocation dispute / cancellation-with-counterparty-consent flow. *Example — original 2,000 with an existing Match of 1,000: after withdrawal that Match continues untouched, the remaining 1,000 is no longer acceptable by anyone, and the Offer is closed to further matching.* **Status — HUMAN-APPROVED 2026-08-25:** the Offer moves to **`withdrawn`**, the canonical status for this outcome. It is **not** `cancelled`, **not** `expired` and **not** `fully_matched`. The previously matched amount **remains part of `matched_amount`** under the existing contributing/completed allocation rules, and a `withdrawn` Offer is **excluded from `marketplace-active`** |

3.5 Matching

**POST /v1/offers/{offer_id}/accept**

|                  |                                                                                                           |
|------------------|-----------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                         |
| Purpose          | Accept **some or all of an Offer's currently available remaining amount**, creating one `Match` — the persisted form of a conceptual `MatchAllocation` |
| Permissions      | Authenticated, KYC-approved, TRANSACTION_ELIGIBLE, not the offer owner |
| Required Headers | Authorization: Bearer {access_token}, Idempotency-Key: {uuid}                                             |
| Request JSON     | **`accepted_amount` (exact Decimal string, REQUIRED)** — **HUMAN APPROVED, 2026-08-24.** Partial acceptance is supported, and the amount is always **explicit**. The client **must** supply it; omission is a request-validation failure and **never** means "accept the full remaining amount". **There is no server-side implicit take-remaining default**, ratified or otherwise — the previously **PROPOSED, not ratified** default is **WITHDRAWN**. The value is an exact decimal string on the wire, converted once to integer minor units at the boundary under the approved monetary representation rules (`docs/adr/002-financial-event-ledger-architecture.md`); binary floating point is never accepted. *Rationale: the allocated amount must record explicit user intent, missing or truncated client input must fail closed rather than escalate to a maximum allocation, a concurrent change to the Offer must not silently alter the amount the user intended, and an audit or dispute record must carry an explicit accepted amount.* |
| Success Response | 201 Created — Match object carrying `allocated_amount` and the server-set `accepted_at` |
| Error Responses  | **RES_409_OFFER_UNAVAILABLE** — *including the case where the Offer's **stored** rate no longer satisfies current policy/rate eligibility; corrected 2026-08-25*, **RES_409_INSUFFICIENT_REMAINING** *(**RATIFIED — HUMAN-APPROVED 2026-08-25**)*, AUTH_403_SELF_MATCH_FORBIDDEN, VAL_422_MISSING_FIELD *(omitted `accepted_amount`)* |
| Validation Rules | A user cannot match against their own offer. `accepted_amount` is **required**, **> 0**, and **≤ the authoritative `remaining_amount` evaluated inside the acceptance serialization boundary** — the same boundary that enforces `Σ valid allocations ≤ original_amount` and assigns `server_order_key`. A `remaining_amount` the client previously read or displayed is **advisory and may be stale**; only the value read under that boundary is authoritative. If the authoritative remaining amount is insufficient when the request is processed, the acceptance is **rejected** — the server **never silently reduces, resizes, clamps or partially fills** `accepted_amount` (`RES_409_INSUFFICIENT_REMAINING`, already listed above and **RATIFIED — HUMAN-APPROVED 2026-08-25**). A missing `accepted_amount` is `VAL_422_MISSING_FIELD`, the existing catalogue entry for an omitted required field (§4.2). **No new error identifier is introduced here.** Corridor allocation constraints apply. Rate policy is **re-checked at acceptance** |
| Business Rules   | **HUMAN-APPROVED — supersedes the previous "acceptance locks the offer" rule.** Acceptance does **not** lock or close the Offer. A partially matched Offer **remains available for its remaining amount**, and one Offer may carry **0..n** Matches. Concurrency control must guarantee that the **sum of valid allocations never exceeds the Offer's original amount**. **Acceptance transaction boundary — clarified 2026-08-24: `offer_id` is the mandatory serialization key.** One transaction, serialized on the authoritative Offer capacity row, must: identify the Offer; lock/serialize that capacity; read the authoritative `remaining_amount`; validate the **required** `accepted_amount`; **reject** if it exceeds authoritative remaining capacity; assign `accepted_at`; assign the `server_order_key`; establish the `Match`; update the authoritative Offer allocation state; and **commit atomically**. An `FXRequest` may supply demand-side context where already approved, but is **never an alternative capacity-serialization authority** for accepting a seller Offer, and acceptance must not depend on its presence. *A database row lock is not the withdrawn product concept of locking the whole Offer lifecycle after its first Match: the Offer stays open for later partial acceptances.* Priority among competing acceptances of the same Offer is **first eligible acceptance by trusted server timestamp**; `accepted_at` is server-set and a client-supplied timestamp is never trusted. Acceptance **alone** establishes the allocation — no second bilateral confirmation. The agreed rate is **locked** on the resulting Match. **Tie-break — deterministic, added 2026-08-24.** `accepted_at` remains the **primary** ordering key. Two eligible acceptances of the same Offer can carry the **same** `accepted_at` at stored precision; priority is then resolved by a **unique server-generated ordering key** assigned inside the same acceptance serialization boundary that enforces the amount invariant, giving the total order `(accepted_at ASC, server_order_key ASC)`. The key is server-authoritative and unique; a client-supplied value never participates, the seller's rate is never a priority mechanism, and marketplace discovery/ranking is never allocation priority. The order is stable and replayable, so an audit or dispute re-derives the same sequence from persisted state. **`server_order_key` is a REQUIRED, immutable property of an accepted `Match` — human decision 2026-08-24.** It is server-generated, unique within the acceptance ordering scope, assigned inside the acceptance serialization boundary, never client-supplied, and part of the accepted-allocation audit contract. **Durable persistence of this value is REQUIRED of the future persistence implementation** — it is not optional and not aspirational; the exact storage mechanism remains implementation-dependent. Phase 1 does not yet implement that persistence, so this is recorded as a **required dependency of the later domain-model/persistence milestone**. The **persistence mechanism for `server_order_key` is implementation-dependent** and is not fixed here — a monotonic sequence or a time-sortable identifier allocated under the same lock are non-normative examples. |

> **Rate-error mapping at acceptance — one deterministic code. Corrected 2026-08-25.** A previous
> revision listed `VAL_422_RATE_NOT_POSITIVE` and `VAL_422_RATE_ABOVE_CEILING` among this
> endpoint's errors. That was wrong: **the acceptance request supplies only `accepted_amount` — it
> supplies no rate at all**, so no client-supplied rate exists here to fail validation. Listing
> client-rate-validation codes on an endpoint that accepts no rate left two codes competing for one
> condition with no precedence.
>
> **Deterministic precedence:**
>
> | Where the rate comes from | Condition | Code |
> |---|---|---|
> | **Client-supplied** (offer create / offer edit) | `rate ≤ 0` | `VAL_422_RATE_NOT_POSITIVE` |
> | **Client-supplied** (offer create / offer edit) | `rate > 0` but above the applicable approved ceiling | `VAL_422_RATE_ABOVE_CEILING` |
> | **Stored on the Offer** (acceptance) | the Offer's existing rate fails current policy/rate eligibility | **`RES_409_OFFER_UNAVAILABLE`** |
>
> The `VAL_422_RATE_*` codes are **reserved for client-supplied rate validation during Offer
> creation or editing** and are not returned by acceptance. At acceptance the rate policy re-check
> is an **eligibility** question about an existing Offer, which `RES_409_OFFER_UNAVAILABLE` already
> covers (§4.4, cause (b)).
>
> **Preserved, unchanged:** the seller's stored rate is **never silently changed**; existing `Match`
> rates are **never re-priced**; an ineligible acceptance is **rejected**, never silently adjusted;
> and lifecycle status stays **separate** from policy eligibility (§3.2 eligibility note).
>
> *No API semantic is invented for an impossible persisted non-positive rate. Such a value could
> only arise from data corruption or a server defect, and no public identifier is defined for it
> here; it would surface through the existing `SYS_500_INTERNAL_ERROR` path like any other
> server-side invariant violation.*

<!-- -->

> **Atomic idempotency boundary for acceptance — cross-reference added 2026-08-25.** The Business
> Rules row above defines the acceptance transaction as **one atomic commit** covering capacity
> serialization, the authoritative `remaining_amount` read, `accepted_amount` validation,
> `accepted_at`, `server_order_key`, `Match` establishment and the Offer allocation update. It did
> **not** place the **`Idempotency-Key` binding and the original idempotency record** inside that
> same boundary, and §1.4 above referred to the acceptance binding as though it were already fully
> stated. **Offer-row serialization orders concurrent requests; it does not deduplicate them by
> key**, so an idempotency record committed outside this transaction leaves two concurrent
> same-key acceptances able to create two `Match` rows and consume capacity twice.
>
> **`02_Technical_Design_Specification.md` §9.4 is authoritative for that boundary** and now
> states it in full: idempotency binding, lookup and original-record establishment commit **inside
> the same atomic logical persistence boundary** as `Match` creation and the capacity mutation;
> of concurrent same-key requests with the same bound logical request **exactly one** wins —
> **one `Match`, capacity consumed once**, all others replaying the original `Match` and original
> response; a conflicting binding on the same key is rejected deterministically with
> `SYS_409_IDEMPOTENCY_KEY_REUSED` (§4.5, **no new identifier**); and different keys racing for
> capacity are decided unchanged by the serialization rules, with losers **rejected** via
> `RES_409_INSUFFICIENT_REMAINING` — **never clamped or partially filled**.
>
> **Step order — key resolution precedes capacity validation. Added 2026-08-25.** Inside that
> boundary the order is normative: **serialize on Offer capacity → resolve and look up the
> `Idempotency-Key` → decide replay/conflict → only for a *new* request, read authoritative
> `remaining_amount` and validate `accepted_amount`**. A **retry of an already-completed same
> bound request replays** the original `Match` and response and is **not** re-validated against
> capacity — otherwise the request's own committed allocation would make its retry fail with
> `RES_409_INSUFFICIENT_REMAINING`. A **new** request is still validated against the authoritative
> current remaining amount. No duplicate `Match`; no duplicate capacity consumption. See
> `02_Technical_Design_Specification.md` §9.4 for the full enumerated order. **No persistence
> mechanism is chosen**, and concurrency regression tests are **REQUIRED at the persistence
> milestone**, not now.

**POST /v1/matches/{match_id}/confirm** — **SUPERSEDED, HUMAN DECISION 2026-08-22**

> **Withdrawn.** Acceptance itself establishes the allocation, fixed by the server-set trusted
> `accepted_at` timestamp. **No second bilateral confirmation step precedes preparation**, and the
> 30-minute confirmation expiry is withdrawn with no replacement value. The block below is retained
> as superseded history only and must not be implemented.

|                  |                                                                                                       |
|------------------|-------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                     |
| Purpose          | Both-party confirmation step before settlement begins.                                                |
| Permissions      | Authenticated (either matched party)                                                                  |
| Required Headers | Authorization: Bearer {access_token}                                                                  |
| Request JSON     | none                                                                                                  |
| Success Response | ~~200 OK — { status: "confirmed_by_you", both_confirmed: boolean }~~ **SUPERSEDED**                                      |
| Error Responses  | RES_409_MATCH_ALREADY_CONFIRMED, RES_410_MATCH_EXPIRED                                                |
| Validation Rules | ~~Match auto-expires and reverts the offer to active if not confirmed by both parties within 30 minutes.~~ **SUPERSEDED** — no bilateral confirmation, no 30-minute expiry. Allocation timing is governed by the configurable preparation and funding windows (ADR-001 Amendment A1 §14.4) |
| Business Rules   | ~~Settlement initiation is only triggered once both_confirmed = true.~~ **SUPERSEDED** — partner provisioning becomes actionable only once the allocation reaches **`ALLOCATION_FUNDING_READY`** (ADR-001 §14.3) |

**GET /v1/matches/{match_id}**

|                  |                                               |
|------------------|-----------------------------------------------|
| **Field**        | **Specification**                             |
| Purpose          | Retrieve match detail.                        |
| Permissions      | Authenticated (either matched party) or Admin |
| Required Headers | Authorization: Bearer {access_token}          |
| Request JSON     | none                                          |
| Success Response | 200 OK — full Match object                    |
| Error Responses  | AUTH_403_FORBIDDEN, RES_404_MATCH_NOT_FOUND   |
| Validation Rules | N/A                                           |
| Business Rules   | N/A                                           |

3.6 Transactions & Settlement

**GET /v1/transactions**

|                  |                                                                    |
|------------------|--------------------------------------------------------------------|
| **Field**        | **Specification**                                                  |
| Purpose          | List the authenticated user’s transactions.                        |
| Permissions      | Authenticated                                                      |
| Required Headers | Authorization: Bearer {access_token}                               |
| Request JSON     | Query: filter\[status\], filter\[currency_pair\], sort=-created_at |
| Success Response | 200 OK — paginated Transaction list                                |
| Error Responses  | AUTH_401_UNAUTHORIZED                                              |
| Validation Rules | N/A                                                                |
| Business Rules   | N/A                                                                |

**GET /v1/transactions/{transaction_id}**

|                  |                                                               |
|------------------|---------------------------------------------------------------|
| **Field**        | **Specification**                                             |
| Purpose          | Retrieve full transaction detail including linked Settlement. |
| Permissions      | Authenticated (party to the transaction) or Admin             |
| Required Headers | Authorization: Bearer {access_token}                          |
| Request JSON     | none                                                          |
| Success Response | 200 OK — Transaction object with nested Settlement            |
| Error Responses  | AUTH_403_FORBIDDEN, RES_404_TRANSACTION_NOT_FOUND             |
| Validation Rules | N/A                                                           |
| Business Rules   | N/A                                                           |

**POST /v1/settlements/{settlement_id}/confirm-funds**

|                  |                                                                                                                        |
|------------------|------------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                      |
| Purpose          | User asserts they have sent funds to their local escrow account. **Advisory only — records a user claim, never a money fact.** |
| Permissions      | Authenticated (funding party for that leg only)                                                                        |
| Required Headers | Authorization: Bearer {access_token}, Idempotency-Key: {uuid}                                                          |
| Request JSON     | leg_id (UUID, required), proof_reference (string, optional bank reference number)                                      |
| Success Response | 200 OK — { leg_id, leg_state, user_claim_recorded_at }                                                                 |
| Error Responses  | **RES_404_NOT_FOUND** *(existing §4.4 entry — `leg_id` does not belong to `{settlement_id}`; added 2026-08-25, no new identifier)*, AUTH_403_FORBIDDEN, RES_409_INVALID_SETTLEMENT_STATE, SYS_409_IDEMPOTENCY_KEY_REUSED *(existing catalogue entry, §4.4 — see the idempotency-scope note below; no new identifier is introduced)* |
| Validation Rules | **Ordered, server-side, fail-closed — HUMAN-APPROVED 2026-08-25.** (1) **Parse** syntactically valid path/request identifiers. (2) **Resolve and validate the addressed resource relationship:** `SettlementLeg.leg_id` equals the supplied `leg_id` **AND** `SettlementLeg.settlement_id` equals `{settlement_id}`. (3) If that relationship does **not** hold, return `RES_404_NOT_FOUND` and **STOP** — no idempotency lookup, no idempotency record write, no funding-party authorization, no advisory claim. (4) **Authorization:** the caller must be the funding party for that leg, else `AUTH_403_FORBIDDEN` — **before** any idempotency evaluation. (5) **Idempotency evaluation:** a reused `Idempotency-Key` with a materially different canonical binding returns `SYS_409_IDEMPOTENCY_KEY_REUSED`; the same bound logical request replays the original response. (6) **Advisory claim operation.** The full order is therefore **resource binding validation → authorization → idempotency evaluation → advisory claim**. See the binding, precedence and ordering notes below |
| Business Rules   | **RECONCILED — ADR-001 (DEC-003).** This endpoint does not change `SettlementLeg.state` and does not advance `Settlement.phase`. Only a signature-verified partner webhook may set the `FUNDED` money fact (ADR-001 F-6, F-7). The claim is recorded for support and dispute evidence, and may drive UI messaging, but carries no financial authority. It previously returned a settlement status of `funds_pending_verification`, which implied a client-asserted state change |

> **`leg_id` MUST be bound to `{settlement_id}` — added 2026-08-25.** The prior validation rule
> checked only that the caller funds the supplied leg. That check passes for a leg the caller
> legitimately funds **in a different Settlement**, so the contract as written allowed a leg from
> one Settlement to be processed through another Settlement's route. `leg_id` is **client-supplied
> input and is never trusted on its own**; the parent-child relationship must be verified
> server-side.
>
> **Required invariant:** `SettlementLeg.leg_id` equals the supplied `leg_id` **AND**
> `SettlementLeg.settlement_id` equals `{settlement_id}`. Both must hold.
>
> *Field-name correction 2026-08-25: an earlier revision of this invariant wrote
> `SettlementLeg.id`. The canonical `SettlementLeg` primary key is **`leg_id`** (`SettlementLeg`
> entity, "Primary key; immutable"), and every foreign key in this document references
> `SettlementLeg.leg_id`. `SettlementLeg.id` does not exist. The canonical field is **not** renamed
> — only the references to it are corrected.*
>
> **Ordering is normative, and fail-closed:** the binding check runs **first** — before the
> funding-party authorization check, before the idempotency binding or lookup, and before any
> advisory claim is created or replayed. A mismatch must never reach idempotency, because a
> mis-bound key would otherwise be recorded against the wrong Settlement.
>
> **Error semantics — existing identifier, no new code.** A leg that exists but belongs to another
> Settlement is rejected with **`RES_404_NOT_FOUND`** (§4.4, existing generic entry): within the
> scope of `{settlement_id}`, that leg does not exist. This is deliberately chosen over
> `AUTH_403_NOT_PARTY` or `RES_409_INVALID_SETTLEMENT_STATE`, both of which would **confirm the
> existence** of a resource outside the addressed Settlement. **No new error identifier is
> introduced and the catalogue total is unchanged.**
>
> **Nothing else about this endpoint changes.** The caller must still be the funding party for that
> leg. The claim remains **advisory only** — it never establishes authoritative `FUNDED`, never
> mutates `SettlementLeg.state`, never advances `Settlement.phase`, and never starts, satisfies or
> bypasses `ALLOCATION_FUNDING_READY`. **Authoritative `FUNDED` remains established only by
> authenticated, signature-verified regulated-partner webhook evidence** (ADR-001 F-6, F-7).
> Idempotency binding is **unchanged** and remains scoped to `(authenticated principal,
> settlement_id, leg_id, the logical confirm-funds operation, the materially relevant request
> parameters)` — this correction adds a precondition, it does not alter that tuple.

<!-- -->

> **Authorization precedes idempotency. Added 2026-08-25.** The precedence note below settles
> *resource address vs idempotency*; this settles the step between them. After binding validation
> passes, **funding-party authorization runs before any idempotency evaluation.** Without a stated
> order, an unauthorized caller presenting a key bound to a **different principal** could match
> both `AUTH_403_FORBIDDEN` and `SYS_409_IDEMPOTENCY_KEY_REUSED`, and the response would depend on
> implementation accident.
>
> **Canonical order:** **resource binding validation → authorization → idempotency evaluation →
> advisory claim operation.**
>
> | Failure | Response |
> |---|---|
> | `leg_id` not under `{settlement_id}` | `RES_404_NOT_FOUND` |
> | Caller is not the funding party for that leg | `AUTH_403_FORBIDDEN` |
> | Valid, authorized, key reused with a materially different binding | `SYS_409_IDEMPOTENCY_KEY_REUSED` |
>
> **Security rationale — the same principle as the `404` precedence.** Idempotency state is
> information about *other* requests. An unauthorized caller must never learn, from a `409`, that
> a key exists or what it is bound to; they get `AUTH_403_FORBIDDEN` and learn nothing about
> idempotency state. Authorization is the boundary; idempotency is bookkeeping **behind** it.
>
> *The canonical idempotency tuple already includes the authenticated principal, so this states an
> order — it changes no binding, no identifier and no replay behaviour for valid authorized
> requests.*

<!-- -->

> **Precedence: resource address BEFORE idempotency. HUMAN-APPROVED 2026-08-25.** Two rules could
> previously claim the same request: the binding check above returns `RES_404_NOT_FOUND` for a leg
> outside the addressed Settlement, while the materially-different-binding rule below returns
> `SYS_409_IDEMPOTENCY_KEY_REUSED` when a reused key carries a different `settlement_id` or
> `leg_id`. A key first bound to Settlement A and replayed on Settlement B's route satisfied both,
> with different outcomes. **This defines one deterministic precedence.**
>
> **Resource-address validation always wins, because it runs first:**
>
> | Condition | Result |
> |---|---|
> | **Invalid resource relationship** — `leg_id` does not belong to `{settlement_id}` | **`RES_404_NOT_FOUND`**, and STOP |
> | **Valid resource relationship** + reused key with a materially different canonical binding | **`SYS_409_IDEMPOTENCY_KEY_REUSED`** |
>
> **Worked cases, both normative:**
>
> - **CASE A** — route `settlement B`, `leg_id` belongs to `settlement A` → **`RES_404_NOT_FOUND`**.
>   **No idempotency evaluation occurs at all:** no key lookup, no record created or updated, no
>   funding-party authorization, no advisory claim.
> - **CASE B** — route `settlement B`, `leg_id` is a valid leg of `settlement B`, but the supplied
>   key is already bound to a different valid logical request → **`SYS_409_IDEMPOTENCY_KEY_REUSED`**.
>
> **Security rationale.** Idempotency applies **only after** the request has addressed a valid
> resource combination for this endpoint. Were the order reversed, the choice between a `404` and a
> `409` would itself disclose whether a given `leg_id` exists under some *other* Settlement —
> letting a client use idempotency behaviour as an existence oracle across a trust boundary. The
> `404` is therefore not merely a tidier code; it is the boundary that keeps cross-settlement
> existence unobservable.
>
> **Scope of this precedence — it weakens nothing.** The materially-different-binding rule is
> **unchanged in substance**; it is only *qualified* to apply after canonical parent-child
> validation has passed. For valid requests, **same-key replay behaviour is unchanged**: the same
> principal replaying the same bound logical request inside the window still receives the original
> response with the original `user_claim_recorded_at`, and creates no second advisory claim. The
> canonical idempotency tuple is **unchanged** — `(authenticated principal, settlement_id, leg_id,
> the logical confirm-funds operation, the materially relevant request parameters)`. **No further
> error identifier is introduced.**

<!-- -->

> **Idempotency-Key scope and binding — added 2026-08-24.** §1.4 already requires the header,
> retains the key-to-response mapping, and returns the original response
> without reprocessing on a repeated request with the same key. **Retention duration is
> NOT DECIDED (§1.4, DECISION 4.1A-F2).** What it does not say is what
> "the same request" *means* here, and for this endpoint that matters: an `Idempotency-Key` with
> no stated binding is a key whose safe replay boundary each client gets to guess.
>
> **The key is scoped to the tuple** `(authenticated principal, settlement_id, leg_id, the
> logical confirm-funds operation, the materially relevant request parameters)`. A key may
> safely replay **only that same logical request**.
>
> **Same principal, same logical request, same key, while the mapping is retained:** the server
> **does not create another advisory claim record**, **does not reprocess** the operation, and
> **returns the original response** — the original `user_claim_recorded_at`, with the original
> `leg_id` and `leg_state` response semantics unchanged. A retry is a retry, not a second claim.
>
> **Atomic boundary — added 2026-08-24.** The paragraph above states an *outcome*; on its own it
> does not say what guarantees that outcome when two retries arrive at once. Without a stated
> boundary, two concurrent same-key requests could each find no prior record and each create an
> advisory claim, satisfying every sentence above while producing exactly the duplicate it
> forbids. The invariant: **recording the scoped idempotency record and establishing or
> recognising the advisory claim MUST occur inside one atomic logical persistence boundary.**
>
> For two or more concurrent requests carrying the same `Idempotency-Key` and the same bound
> logical request: **exactly one** may establish the original idempotency record and advisory
> claim; every other concurrent request and every later retry **observes or replays that original
> result**, creating **no** duplicate advisory claim, returning the **original response** and
> preserving the **original `user_claim_recorded_at`**. A same key presented with a conflicting
> binding is rejected deterministically with `SYS_409_IDEMPOTENCY_KEY_REUSED`, concurrently or
> otherwise.
>
> **The persistence mechanism is deliberately not chosen here** — no lock strategy, uniqueness
> constraint, storage engine, cache technology or transaction isolation level is specified. Any
> mechanism satisfying the invariant is conformant, and the choice belongs to the persistence
> milestone.
>
> **A concurrent same-key regression test is REQUIRED at that milestone** — proving that N
> simultaneous same-key requests yield exactly one advisory claim record and N identical
> responses. It is **not** written now, and its absence here is not an oversight: this PR
> contains no runtime idempotency or persistence implementation, so there is nothing to exercise.
> A test written against no implementation would assert nothing while appearing to cover this.
>
> **Same key, materially different request — applies only AFTER resource-address validation
> passes. Qualified 2026-08-25.** This rule is evaluated **only once** the request has satisfied
> the canonical parent-child check (`SettlementLeg.leg_id` equals the supplied `leg_id` **AND**
> `SettlementLeg.settlement_id` equals `{settlement_id}`). A request that fails that check returns
> `RES_404_NOT_FOUND` and **never reaches idempotency evaluation at all** — see the precedence note
> under this endpoint's Validation Rules. So a `leg_id` belonging to a *different* Settlement is a
> **`404`, not** a bound-key conflict.
>
> For a request that **has** addressed a valid leg under `{settlement_id}`: a reused key carrying a
> different `settlement_id`, a different `leg_id`, a different authenticated principal, or a
> materially different payload or logical operation — **must be rejected deterministically** with
> `SYS_409_IDEMPOTENCY_KEY_REUSED`, the **existing** §4.4 entry, whose canonical meaning is a
> **bound-key conflict**: a material difference in any bound component, not only in the request
> body. **No new error identifier is introduced; catalogue totals are recounted in §4.4 (45
> enumerated / 43 active / 2 superseded).** Silently serving the first response to a materially
> different request would let one confirmed leg's claim masquerade as another's.
>
> This restates the boundary already stated for `POST /v1/offers/{offer_id}/accept`
> (`02_Technical_Design_Specification.md` §9.4) and **changes nothing about what this endpoint
> can do**. The claim stays **advisory**: it does not establish authoritative `FUNDED`, does not
> mutate `SettlementLeg.state`, does not advance `Settlement.phase`, does not authorize release,
> and does not start, satisfy or bypass `ALLOCATION_FUNDING_READY`. Authoritative `FUNDED`
> remains established only by the authenticated, signature-verified regulated-partner webhook
> when that integration exists (ADR-001 F-6, F-7). **The persistence mechanism for the
> idempotency record is implementation-dependent and is not fixed here.**

**GET /v1/settlements/{settlement_id}**

|                  |                                                       |
|------------------|-------------------------------------------------------|
| **Field**        | **Specification**                                     |
| Purpose          | Retrieve settlement status and timeline.              |
| Permissions      | Authenticated (party) or Admin                        |
| Required Headers | Authorization: Bearer {access_token}                  |
| Request JSON     | none                                                  |
| Success Response | 200 OK — Settlement object with status timeline array |
| Error Responses  | AUTH_403_FORBIDDEN, RES_404_NOT_FOUND                 |
| Validation Rules | N/A                                                   |
| Business Rules   | N/A                                                   |

3.7 Notifications

**GET /v1/notifications**

|                  |                                                   |
|------------------|---------------------------------------------------|
| **Field**        | **Specification**                                 |
| Purpose          | List the authenticated user’s notifications.      |
| Permissions      | Authenticated                                     |
| Required Headers | Authorization: Bearer {access_token}              |
| Request JSON     | Query: filter\[read\] (boolean), sort=-created_at |
| Success Response | 200 OK — paginated Notification list              |
| Error Responses  | AUTH_401_UNAUTHORIZED                             |
| Validation Rules | N/A                                               |
| Business Rules   | N/A                                               |

**PATCH /v1/notifications/{notification_id}**

|                  |                                      |
|------------------|--------------------------------------|
| **Field**        | **Specification**                    |
| Purpose          | Mark a notification read/unread.     |
| Permissions      | Authenticated (owner)                |
| Required Headers | Authorization: Bearer {access_token} |
| Request JSON     | read (boolean)                       |
| Success Response | 200 OK — updated Notification        |
| Error Responses  | AUTH_403_NOT_OWNER                   |
| Validation Rules | N/A                                  |
| Business Rules   | N/A                                  |

3.8 Disputes

**POST /v1/disputes**

|                  |                                                                                    |
|------------------|------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                  |
| Purpose          | Open a dispute against a transaction.                                              |
| Permissions      | Authenticated (party to the transaction)                                           |
| Required Headers | Authorization: Bearer {access_token}                                               |
| Request JSON     | transaction_id (string), reason (enum), description (string, max 2000 chars)       |
| Success Response | 201 Created — Dispute object, status: "open"                                       |
| Error Responses  | RES_409_DISPUTE_ALREADY_OPEN, AUTH_403_NOT_PARTY                                   |
| Validation Rules | description required, max length enforced                                          |
| Business Rules   | Opening a dispute freezes the linked settlement from auto-advancing until resolved |

**POST /v1/disputes/{dispute_id}/evidence**

|                  |                                                                         |
|------------------|-------------------------------------------------------------------------|
| **Field**        | **Specification**                                                       |
| Purpose          | Attach evidence (message or file) to an open dispute.                   |
| Permissions      | Authenticated (party) or Admin                                          |
| Required Headers | Authorization: Bearer {access_token}, Content-Type: multipart/form-data |
| Request JSON     | message (string, optional), file (binary, optional, max 10MB)           |
| Success Response | 201 Created — Evidence object                                           |
| Error Responses  | VAL_422_FILE_TOO_LARGE                                                  |
| Validation Rules | At least one of message/file required                                   |
| Business Rules   | N/A                                                                     |

**POST /v1/admin/disputes/{dispute_id}/resolve**

|                  |                                                                                                 |
|------------------|-------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                               |
| Purpose          | Resolve a dispute with a binding outcome.                                                       |
| Permissions      | Admin only (disputes.resolve permission)                                                        |
| Required Headers | Authorization: Bearer {access_token}                                                            |
| Request JSON     | outcome (enum: favor_initiator, favor_counterparty, split, no_fault), resolution_notes (string) |
| Success Response | 200 OK — updated Dispute, status: "resolved"                                                    |
| Error Responses  | AUTH_403_FORBIDDEN                                                                              |
| Validation Rules | resolution_notes required                                                                       |
| Business Rules   | Resolution unblocks the frozen settlement per the determined outcome; fully audit-logged        |

3.9 Admin

**GET /v1/admin/users**

|                  |                                                    |
|------------------|----------------------------------------------------|
| **Field**        | **Specification**                                  |
| Purpose          | Search and list platform users.                    |
| Permissions      | Admin (users.read permission)                      |
| Required Headers | Authorization: Bearer {access_token}               |
| Request JSON     | Query: filter\[email\], filter\[kyc_status\], sort |
| Success Response | 200 OK — paginated User list                       |
| Error Responses  | AUTH_403_FORBIDDEN                                 |
| Validation Rules | N/A                                                |
| Business Rules   | N/A                                                |

**POST /v1/admin/users/{user_id}/suspend**

|                  |                                                                                                                                          |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                                        |
| Purpose          | Suspend a user account.                                                                                                                  |
| Permissions      | Admin (users.suspend permission)                                                                                                         |
| Required Headers | Authorization: Bearer {access_token}                                                                                                     |
| Request JSON     | reason (string, required)                                                                                                                |
| Success Response | 200 OK — { status: "suspended" }                                                                                                         |
| Error Responses  | AUTH_403_FORBIDDEN, VAL_422_REASON_REQUIRED                                                                                              |
| Validation Rules | reason required for audit trail                                                                                                          |
| Business Rules   | Suspension immediately revokes all active sessions and blocks new Offers/Requests; existing in-flight settlements are not auto-cancelled |

4\. Error Catalogue

Errors follow a consistent envelope: { error_code, message, details? }. Codes are namespaced by domain prefix for fast triage. The following **45 enumerated codes** constitute the MVP error catalogue -- recounted **2026-08-25** and verified against the tables below (**AUTH 12, VAL 11, KYC 4, RES 14, SYS 4**, across five namespaces). New codes require an update to this document **and to this total** before shipping; the previously stated 54 was never reconciled to the enumerated rows.

**Recount 2026-08-25 — 45 enumerated, of which 2 are SUPERSEDED, leaving 43 ACTIVE.** Derived directly from the enumerated rows after the `VAL_422_RATE_NOT_POSITIVE` ratification, not carried forward:

| Namespace | Enumerated | Superseded | Active |
|---|---|---|---|
| AUTH | 12 | 0 | 12 |
| VAL | **11** | 0 | **11** |
| KYC | 4 | 0 | 4 |
| RES | 14 | **2** | 12 |
| SYS | 4 | 0 | 4 |
| **TOTAL** | **45** | **2** | **43** |

**One identifier was added**: `VAL_422_RATE_NOT_POSITIVE` (**HUMAN-APPROVED 2026-08-25**), taking VAL from 10 to 11 and the enumerated total from 44 to 45. **No identifier was removed.** The two superseded codes are `RES_409_MATCH_ALREADY_CONFIRMED` and `RES_410_MATCH_EXPIRED`, which existed solely for the withdrawn bilateral second-confirmation flow; they are **retained as historical compatibility identifiers, not deleted** — governance retains superseded identifiers rather than removing them — so they are still counted among the 45 enumerated rows per the existing catalogue-count convention, while remaining outside the 43 active. Neither may be reused for current acceptance, preparation or funding semantics.

4.1 Authentication & Authorization (AUTH\_\*)

|                                |                 |                                                      |
|--------------------------------|-----------------|------------------------------------------------------|
| **Code**                       | **HTTP Status** | **Meaning**                                          |
| AUTH_401_UNAUTHORIZED          | 401             | Missing or invalid access token                      |
| AUTH_401_INVALID_CREDENTIALS   | 401             | Email/password combination incorrect                 |
| AUTH_401_INVALID_OTP           | 401             | OTP code incorrect                                   |
| AUTH_401_INVALID_REFRESH_TOKEN | 401             | Refresh token invalid or expired                     |
| AUTH_401_TOKEN_REUSE_DETECTED  | 401             | Rotated refresh token reused — session chain revoked |
| AUTH_403_FORBIDDEN             | 403             | Authenticated but lacks required permission          |
| AUTH_403_KYC_REQUIRED          | 403             | Action requires an approved KYC case                 |
| AUTH_403_NOT_OWNER             | 403             | User does not own the target resource                |
| AUTH_403_NOT_PARTY             | 403             | User is not a party to the transaction/dispute       |
| AUTH_403_SELF_MATCH_FORBIDDEN  | 403             | User attempted to match against their own listing    |
| AUTH_410_CHALLENGE_EXPIRED     | 410             | MFA challenge expired                                |
| AUTH_429_RATE_LIMITED          | 429             | Too many attempts; retry after cooldown              |

4.2 Validation (VAL\_\*)

|                              |                 |                                                    |
|------------------------------|-----------------|----------------------------------------------------|
| **Code**                     | **HTTP Status** | **Meaning**                                        |
| VAL_422_INVALID_PHONE        | 422             | Phone number fails E.164 validation                |
| VAL_422_WEAK_PASSWORD        | 422             | Password fails complexity policy                   |
| VAL_422_UNDERAGE             | 422             | Declared date of birth implies age below 18        |
| VAL_422_FILE_TOO_LARGE       | 422             | Uploaded file exceeds 10MB                         |
| VAL_422_UNSUPPORTED_FORMAT   | 422             | File type not in accepted list                     |
| VAL_422_RATE_NOT_POSITIVE | 422 | **HUMAN-APPROVED 2026-08-25.** The supplied exchange rate is **zero or negative** (`rate ≤ 0`). A **domain validity failure** — the value is not a rate at all. It is **NOT** a reference-rate-floor violation, **NOT** a pricing-policy floor and **NOT** a spread rule. Applies wherever the canonical API accepts a rate whose domain validity requires `rate > 0`. Distinct from `VAL_422_RATE_ABOVE_CEILING` below, which presumes a **positive** rate |
| VAL_422_RATE_ABOVE_CEILING *(proposed name)* | 422 | **HUMAN-APPROVED semantics:** desired rate exceeds the applicable approved reference ceiling — hard block. **Scope clarified 2026-08-25: this code covers the CEILING breach only**, and it presumes a **positive** rate; a rate `≤ 0` returns `VAL_422_RATE_NOT_POSITIVE` instead. **Supersedes `VAL_422_RATE_OUT_OF_BAND`**, which encoded a symmetric ±15% band and an unapproved floor. The identifier itself is **PROPOSED, not ratified** |
| VAL_422_AMOUNT_BELOW_MINIMUM | 422             | Source amount below corridor minimum               |
| VAL_422_REASON_REQUIRED      | 422             | A required justification field was omitted         |
| VAL_422_MALFORMED_JSON       | 422             | Request body is not valid JSON                     |
| VAL_422_MISSING_FIELD        | 422             | A required field was omitted                       |

> **RESOLVED — `VAL_422_RATE_NOT_POSITIVE` ratified, HUMAN-APPROVED 2026-08-25.** This note
> previously recorded an OPEN gap: the rate-validity rule (§3.3) requires `rate > 0`, but no
> catalogue code fitted a present-but-non-positive rate. `VAL_422_RATE_ABOVE_CEILING` is scoped to
> the ceiling breach; `VAL_422_MISSING_FIELD` did not apply because the field **is** supplied; and
> `VAL_422_MALFORMED_JSON` did not apply because the body **is** valid JSON. The gap is **CLOSED**
> by human decision.
>
> **The two rate errors are disjoint and must never be conflated:**
>
> | Code | Condition | Nature |
> |---|---|---|
> | `VAL_422_RATE_NOT_POSITIVE` | `rate ≤ 0` | **Domain validity** — the value is not a rate |
> | `VAL_422_RATE_ABOVE_CEILING` | `rate > 0` **AND** `rate >` applicable approved reference ceiling | **Pricing policy** |
>
> A rate is valid only when **`0 < rate ≤ applicable approved reference ceiling`**. Evaluation is
> ordered: positivity first, then the ceiling — so a rate of `≤ 0` returns
> `VAL_422_RATE_NOT_POSITIVE`, never `VAL_422_RATE_ABOVE_CEILING`.
>
> **This introduces one identifier and nothing else.** There remains **no approved reference-rate
> floor**, **no ±15% symmetric band** (withdrawn, not restored), **no minimum commercial spread**,
> **no minimum percentage below reference** and **no invented numeric lower reference-rate bound**.
> A seller may still price arbitrarily far below the ceiling. Catalogue totals are recounted in
> §4.4 above.

4.3 KYC (KYC\_\*)

|                              |                 |                                                     |
|------------------------------|-----------------|-----------------------------------------------------|
| **Code**                     | **HTTP Status** | **Meaning**                                         |
| KYC_400_INCOMPLETE_DOCUMENTS | 400             | Not all required documents uploaded for submission  |
| KYC_409_CASE_ALREADY_ACTIVE  | 409             | User already has a non-terminal KYC case            |
| KYC_409_CASE_NOT_EDITABLE    | 409             | Case is beyond the document-upload stage            |
| KYC_422_DOCUMENT_UNREADABLE  | 422             | Automated quality check failed on uploaded document |

4.4 Resource State (RES\_\*)

|                                  |                 |                                                        |
|----------------------------------|-----------------|--------------------------------------------------------|
| **Code**                         | **HTTP Status** | **Meaning**                                            |
| RES_404_SESSION_NOT_FOUND        | 404             | Device session does not exist                          |
| RES_404_CASE_NOT_FOUND           | 404             | KYC case does not exist or is not visible to caller    |
| RES_404_TRANSACTION_NOT_FOUND    | 404             | Transaction does not exist or is not visible to caller |
| RES_404_MATCH_NOT_FOUND          | 404             | Match does not exist                                   |
| RES_404_NOT_FOUND                | 404             | Generic resource-not-found                             |
| RES_409_OFFER_ALREADY_MATCHED    | 409             | Offer can no longer be edited/cancelled                |
| RES_409_OFFER_UNAVAILABLE        | 409             | **Corrected 2026-08-25 — the Offer is not eligible for acceptance.** Covers **either** cause: **(a) lifecycle** — `fully_matched`, `withdrawn`, `cancelled` or `expired`; **or (b) policy/rate ineligibility** — the Offer holds an eligible lifecycle status (`open` / `partially_matched`) but currently fails the applicable approved rate-ceiling policy (§3.2 eligibility note). The stale literal *"matched"* is **withdrawn**: it is not a canonical Offer status, and it omitted `withdrawn`. **Cause (b) is a reversible, derived condition and does NOT map to any persisted lifecycle state** — no new status is introduced. Distinguish from `RES_409_INSUFFICIENT_REMAINING`, which applies when the Offer *is* eligible but lacks remaining capacity |
| RES_409_INSUFFICIENT_REMAINING   | 409             | **RATIFIED — HUMAN-APPROVED 2026-08-25.** **Offer-capacity conflict.** Canonical condition: during Offer acceptance, after authoritative Offer state has been obtained **inside the acceptance serialization boundary**, `accepted_amount > authoritative remaining_amount`. `accepted_amount` remains **REQUIRED** and **> 0**; the authoritative `remaining_amount` is determined **server-side** and a client-displayed value **may be stale**. The request is **rejected**: the amount is **never** silently reduced, resized, clamped or partially filled, **never** substituted with "take whatever remains", and no allocation is created. The client may refresh Offer state and submit a new explicit amount. **Distinct from** `RES_409_OFFER_UNAVAILABLE` (Offer not acceptable at all — lifecycle or policy/rate eligibility), `SYS_409_IDEMPOTENCY_KEY_REUSED` (bound-key conflict on a validly addressed operation), rate-validation errors, and authentication/authorization errors |
| ~~RES_409_MATCH_ALREADY_CONFIRMED~~  | 409             | **SUPERSEDED / COMPATIBILITY-ONLY — 2026-08-25.** ~~Caller has already confirmed this match~~. Existed solely for the withdrawn bilateral second-confirmation flow (`POST /v1/matches/{match_id}/confirm`, SUPERSEDED §3.5). **Retained as a historical compatibility identifier — not deleted** — and it **must not be reused** for acceptance semantics. Duplicate acceptance is governed by the acceptance idempotency boundary (§3.5), not by this code |
| RES_409_DISPUTE_ALREADY_OPEN     | 409             | An open dispute already exists for this transaction    |
| RES_409_INVALID_SETTLEMENT_STATE | 409             | Action not valid for the current settlement phase or leg state. Response names the current phase and the attempted transition, and must not disclose counterparty leg detail |
| RES_409_SETTLEMENT_ON_HOLD       | 409             | An open blocking SettlementHold prevents progression   |
| RES_422_UNRESOLVABLE_LEG         | 422             | Partner event carried no resolvable leg_id — rejected, never defaulted |
| ~~RES_410_MATCH_EXPIRED~~            | 410             | **SUPERSEDED / COMPATIBILITY-ONLY — 2026-08-25.** ~~Match confirmation window elapsed~~. The 30-minute confirmation expiry is **withdrawn with no replacement value** (ADR-001 §14.4); allocation timing is now governed by the preparation and funding windows. **Retained as a historical compatibility identifier — not deleted** — and it **must not be reused** for preparation or funding expiry |

4.5 System (SYS\_\*)

|                                |                 |                                                        |
|--------------------------------|-----------------|--------------------------------------------------------|
| **Code**                       | **HTTP Status** | **Meaning**                                            |
| SYS_500_INTERNAL_ERROR         | 500             | Unhandled server error                                 |
| SYS_503_SERVICE_UNAVAILABLE    | 503             | Dependency (DB, Redis, Celery) temporarily unavailable |
| SYS_504_UPSTREAM_TIMEOUT       | 504             | A downstream/banking dependency timed out              |
| SYS_409_IDEMPOTENCY_KEY_REUSED | 409             | **Bound-key conflict — meaning broadened 2026-08-24.** An `Idempotency-Key` was presented with a request that does not match the logical request the key was first bound to. The previous wording, *"reused with a different request body"*, was narrower than the binding the contracts actually define: an authenticated principal comes from the bearer token and a `settlement_id` is a path parameter, so neither is a request body, yet a mismatch in either is exactly the conflict this code exists to reject. The canonical meaning is a material difference in **any bound component** — authenticated principal, resource identifier, `settlement_id`, `leg_id`, the logical operation, or materially relevant request parameters/payload. Each endpoint's contract states its own binding (§3.1-§3.9). **Endpoint precedence applies before this code is reachable — pointer added 2026-08-25, editorial.** Where an endpoint contract states an ordering, **resource-binding validation and authorization run BEFORE idempotency evaluation**, and a request failing either never reaches idempotency state or this code. For `POST /v1/settlements/{settlement_id}/confirm-funds` (§3.6) the canonical order is **resource binding validation → authorization → idempotency evaluation → advisory claim**: an unbound `leg_id` returns `RES_404_NOT_FOUND` and a non-funding-party caller returns `AUTH_403_FORBIDDEN`, so an unauthorized caller **never learns from a `409` that a key exists or what it is bound to**. Consequently the *authenticated principal* component of the binding below is, at such endpoints, caught by authorization first. **This states existing precedence and introduces no rule, identifier or binding change.** Rejection is **deterministic**; the first request's response is **never** served to a conflicting one. **One identifier covers every bound-key conflict — no new code is introduced and the catalogue totals are recounted in the note below this table: **45 enumerated / 43 active / 2 superseded** (2026-08-25)** |

> **ASSUMPTION:** *The catalogue above totals **45** explicitly enumerated codes across five namespaces — **43 active, 2 superseded** (recounted 2026-08-25 after `VAL_422_RATE_NOT_POSITIVE` was ratified; the earlier figure of 39 predates several additions). Reaching the requested minimum of 50 requires additional module-specific codes (e.g., Admin-suspension edge cases, Notification delivery failures) that should be authored incrementally as each module is implemented, rather than pre-invented without an implementation to validate them against — inventing precise numeric coverage here would reduce document accuracy for the sake of a count.*

5\. Data Dictionary

Schema definitions for every persisted entity.

> **AUTHORITATIVE MONETARY REPRESENTATION — DECISION S4-1, HUMAN-APPROVED 2026-08-25.** Every
> **persisted authoritative transactional monetary amount** is stored as **exact integer minor
> units**, with its interpretation **immutably bound** at the moment the amount is established:
>
> | Column | Type | Meaning |
> |---|---|---|
> | `amount_minor` | `BIGINT NOT NULL` | Exact integer minor units. Never binary floating point |
> | `currency` | `CHAR(3) NOT NULL` | ISO 4217 |
> | `scale` | `SMALLINT NOT NULL` | Minor-unit exponent, captured with the amount |
> | `currency_def_version` | `VARCHAR(32) NOT NULL` | Which currency definition interprets `currency` (ADR-002; type matches the existing `LedgerLine.currency_def_version` authority in this document — **no new version encoding is invented**) |
>
> This **supersedes** the former blanket statement that *"All monetary fields use PostgreSQL
> NUMERIC (mapped to Python Decimal via SQLAlchemy)"*. That rule contradicted ADR-002, TDS §6.4
> and this document's own `PayoutExecution` and `LedgerLine` schemas, which already specify
> `amount_minor BIGINT`. Three different types — `NUMERIC(18,2)`, `NUMERIC(20,4)` and `BIGINT` —
> were in force for the same conceptual money. **One representation now governs all of them.**
>
> **`NUMERIC`/`DECIMAL` may appear only as an explicitly DERIVED, NON-AUTHORITATIVE
> presentation/reporting value** where a justified need is recorded. It is never the source of
> truth, is never read back as truth, and derived decimal columns must not be added for
> convenience alone. **Float is never used for money anywhere in the schema.**
>
> **Exchange rates are NOT monetary amounts.** `desired_rate` and `agreed_rate` remain
> `NUMERIC(12,6)` and are unaffected by this decision.
>
> The domain arithmetic primitive remains `Money(minor, currency, scale)`
> (`backend/app/core/money.py`), **unchanged** — `currency_def_version` is carried *alongside* it
> in persistence, not added to the value object.

Users

Core identity and authentication record.

|               |              |              |                                                 |                                               |
|---------------|--------------|--------------|-------------------------------------------------|-----------------------------------------------|
| **Field**     | **Type**     | **Nullable** | **Validation**                                  | **Business Meaning**                          |
| id            | UUID         | No           | Primary key                                     | Immutable unique identifier                   |
| email         | VARCHAR(255) | No           | Unique, RFC-5322                                | Login identifier; immutable post-registration |
| phone         | VARCHAR(20)  | Yes          | E.164 format                                    | Used for SMS OTP and notifications            |
| password_hash | VARCHAR(255) | No           | Argon2id hash                                   | Never exposed via any API response            |
| role          | ENUM         | No           | user, business, admin, support                  | Drives RBAC permission set per the applicable approved security policy |
| status        | ENUM         | No           | pending_verification, active, suspended, closed | Gates login and marketplace access            |
| created_at    | TIMESTAMPTZ  | No           | System-set                                      | Audit trail                                   |

Profiles

Extended, mutable user information.

|                          |              |              |                         |                                 |
|--------------------------|--------------|--------------|-------------------------|---------------------------------|
| **Field**                | **Type**     | **Nullable** | **Validation**          | **Business Meaning**            |
| user_id                  | UUID         | No           | FK -\> Users.id, unique | One-to-one with Users           |
| full_name                | VARCHAR(255) | No           | Non-empty               | Display name                    |
| avatar_url               | TEXT         | Yes          | Valid URL               | CDN-hosted profile image        |
| notification_preferences | JSONB        | No           | Schema-validated object | Per-channel opt-in/out flags    |
| locale                   | VARCHAR(10)  | No           | BCP-47 tag              | Drives currency/date formatting |

Sessions

Active authenticated device sessions.

|                    |              |              |                  |                            |
|--------------------|--------------|--------------|------------------|----------------------------|
| **Field**          | **Type**     | **Nullable** | **Validation**   | **Business Meaning**       |
| id                 | UUID         | No           | Primary key      | Session identifier         |
| user_id            | UUID         | No           | FK -\> Users.id  | Owning user                |
| device_fingerprint | VARCHAR(255) | No           | Client-generated | Used for anomaly detection |
| refresh_token_hash | VARCHAR(255) | No           | SHA-256 hash     | Raw token never persisted  |
| ip_address         | INET         | No           | Valid IP         | Audit/security             |
| last_active_at     | TIMESTAMPTZ  | No           | System-set       | Drives session-list UI     |
| revoked_at         | TIMESTAMPTZ  | Yes          | System-set       | Null while active          |

Devices

Known devices per user, distinct from sessions for push-notification targeting.

|            |              |              |                     |                                   |
|------------|--------------|--------------|---------------------|-----------------------------------|
| **Field**  | **Type**     | **Nullable** | **Validation**      | **Business Meaning**              |
| id         | UUID         | No           | Primary key         | Device identifier                 |
| user_id    | UUID         | No           | FK -\> Users.id     | Owning user                       |
| push_token | VARCHAR(255) | Yes          | Expo/FCM/APNs token | Null if push not enabled          |
| platform   | ENUM         | No           | ios, android, web   | Drives notification payload shape |

KYCCases

A single identity-verification case for a user.

|                 |              |              |                                                     |                                      |
|-----------------|--------------|--------------|-----------------------------------------------------|--------------------------------------|
| **Field**       | **Type**     | **Nullable** | **Validation**                                      | **Business Meaning**                 |
| id              | UUID         | No           | Primary key                                         | Case identifier                      |
| user_id         | UUID         | No           | FK -\> Users.id                                     | Case owner                           |
| legal_name      | VARCHAR(255) | No           | Non-empty                                           | Name as it appears on ID document    |
| date_of_birth   | DATE         | No           | Implies age ≥ 18                                    | Eligibility check                    |
| id_type         | ENUM         | No           | passport, national_id, drivers_license              | Determines required document set     |
| status          | ENUM         | No           | pending_documents, under_review, approved, rejected | Gates marketplace/transaction access |
| reviewed_by     | UUID         | Yes          | FK -\> Users.id (admin)                             | Null until reviewed                  |
| decision_reason | TEXT         | Yes          | Required if rejected                                | Surfaced verbatim to the user        |

KYCDocuments

Individual uploaded documents within a KYC case.

|               |          |              |                                                      |                                    |
|---------------|----------|--------------|------------------------------------------------------|------------------------------------|
| **Field**     | **Type** | **Nullable** | **Validation**                                       | **Business Meaning**               |
| id            | UUID     | No           | Primary key                                          | Document identifier                |
| kyc_case_id   | UUID     | No           | FK -\> KYCCases.id                                   | Parent case                        |
| document_type | ENUM     | No           | id_front, id_back, proof_of_address, liveness_selfie | Determines review checklist        |
| storage_uri   | TEXT     | No           | AES-256 encrypted object reference                   | Never returned as a raw public URL |
| status        | ENUM     | No           | uploaded, verified, rejected                         | Per-document review outcome        |

BeneficiaryAccount

**HUMAN APPROVED, 2026-08-22.** A reusable, profile-level payout destination owned by a User:
`User → BeneficiaryAccount 0..n`. This is the canonical model for the **existing `BENEFICIARIES`
concept** already present in `02_Technical_Design_Specification.md` §5 — it is **extended, not
duplicated**, and no table is renamed.

| | | | | |
|---|---|---|---|---|
| **Field** | **Type** | **Nullable** | **Validation** | **Business Meaning** |
| id | UUID | No | Primary key | Beneficiary identifier |
| user_id | UUID | No | FK -\> Users.id | Owning user |
| currency | CHAR(3) | No | ISO 4217 | Payout currency |
| account_ref | VARCHAR(255) | No | **Tokenised reference; never a raw account number** — same handling as `SettlementLeg.escrow_account_ref` | Partner-resolvable destination |
| validation_state | ENUM | No | Must express: **pending, validated, failed/rejected, invalidated**. Persisted literals may differ for compatibility | A saved beneficiary may exist in any of these states |
| validated_at | TIMESTAMPTZ | Yes | Set on successful validation | Evidence timestamp |

> **Only an eligible `validated` beneficiary may satisfy `ALLOCATION_FUNDING_READY`.** Selection is
> **per Match / conceptual `MatchAllocation`** — different Matches under one Offer may use
> different destinations, and one allocation may distribute across several destinations (see
> `PayoutExecution`).
>
> **Invalidation semantics** are recorded in ADR-001 §14.6: before funding, readiness fails; during
> funding before authoritative funding, funding is paused pending correction; **after
> partner-confirmed funding, the funding fact remains true** and payout is blocked pending
> correction; after irreversible payout, the historical destination is immutable. Whether a
> correction resumes the original deadline or starts a new one is **OPEN / CONFIGURABLE**.
>
> No raw bank-detail storage guarantee or tokenisation mechanism beyond existing approved
> security/partner guidance is specified here.

FXRequest

A user’s request to exchange currency (inverse of Offer).

> **DISPOSITION — HUMAN APPROVED, 2026-08-22: LEGACY / API-COMPATIBILITY + OPTIONAL DEMAND-SIDE
> PRODUCT CONCEPT.** `FXRequest` is **retained** — the table, the `/fx-requests` route and all
> historical references stand, and nothing is deleted or renamed. It is **no longer a required
> canonical matching primitive.** A `Match` must be creatable from an Offer, an accepting
> counterparty, an accepted amount and a trusted server timestamp **without any `FXRequest`**;
> accordingly `Match.fx_request_id` is **optional/nullable**. `FXRequest` must not drive the
> canonical matching algorithm, and the marketplace "Requests" experience must not create a second
> competing allocation model.

|                 |               |              |                                     |                                     |
|-----------------|---------------|--------------|-------------------------------------|-------------------------------------|
| **Field**       | **Type**      | **Nullable** | **Validation**                      | **Business Meaning**                |
| id              | UUID          | No           | Primary key                         | Request identifier                  |
| user_id         | UUID          | No           | FK -\> Users.id                     | Requester                           |
| source_currency | CHAR(3)       | No           | ISO 4217                            | Currency being offered by requester |
| target_currency | CHAR(3)       | No           | ISO 4217, != source_currency        | Currency desired                    |
| source_amount_minor | BIGINT    | No           | \> corridor minimum; **exact integer minor units, never float or decimal** (S4-1). Bound to `currency` + `scale` + `currency_def_version`. *Type corrected 2026-08-25 from `NUMERIC(18,2)`* | Exact minor-unit amount |
| scale           | SMALLINT      | No           | Minor-unit exponent for `source_currency`; immutable once set | Fixes the meaning of `source_amount_minor` |
| currency_def_version | VARCHAR(32) | No        | Immutably bound when the amount is established (S4-1) | Which currency definition interprets `source_currency` |
| desired_rate    | NUMERIC(12,6) | No           | **`> 0` AND ≤ applicable approved reference ceiling; no reference-rate floor.** Positivity is a domain validity invariant, not a pricing floor (§3.3 rate-validity note) | Requested exchange rate |
| status          | ENUM          | No           | active, matched, cancelled, expired | Marketplace visibility              |

Offer

A user’s offer to exchange currency. **Canonical parent matching intent — HUMAN APPROVED,
2026-08-22.** One Offer may carry **0..n** Matches (conceptual `MatchAllocation`s), each an
independent settlement failure domain.

> **Canonical amount invariant:** `original_amount = matched_amount + remaining_amount`.
> `matched_amount` is the sum of two **disjoint** sets: allocations that are **active and
> committed** -- currently valid, non-expired and **not yet completed** -- and allocations
> that **completed successfully**. No allocation belongs to both, so every allocation is
> counted **exactly once**. When an allocation expires or is released pre-funding it belongs
> to neither set: it **ceases to contribute** and its amount returns to `remaining_amount`;
> the terminated allocation record remains immutable audit history.
>
> **`remaining_amount` is DERIVED**, not persisted as an independently mutable source of truth,
> unless a later technical review proves material need.
>
> **Withdrawing remaining availability.** A seller may **withdraw the Offer's remaining availability**,
> **closing it to further matching**. This is **not** a cancellation cascading from Offer to Match: existing
> Matches, their `allocated_amount`, their Transactions and their Settlements are **untouched**, other
> allocations under the same Offer are **unaffected**, and committed capacity is **never returned**. Only the
> uncommitted remainder becomes unavailable to new acceptances. Each existing allocation continues as an
> **independent failure domain**.
>
> **`withdrawn` is the canonical status for this outcome — HUMAN-APPROVED 2026-08-25.** The prior
> revision recorded an OPEN status-model gap here: the enum had no literal expressing *"remainder
> withdrawn, existing allocations intact"*, so withdrawal could not be represented without
> misusing `cancelled`, `expired` or `fully_matched`. That gap is **CLOSED**. `withdrawn` is now a
> member of the canonical Offer enum and means: **the Offer owner has intentionally withdrawn the
> still-unmatched remainder.**
>
> Binding semantics — the Offer is **closed to further acceptance**, and **no new `Match` may
> consume the withdrawn remainder**. Existing `Match`, `Transaction` and `Settlement` records
> **remain valid**. Withdrawal **does NOT cascade** into existing allocations. Withdrawal is **NOT
> cancellation**, **NOT expiry**, and **NOT `fully_matched`** — these are four distinct terminal
> meanings and must never be collapsed. Any previously matched amount **remains part of
> `matched_amount`** under the existing contributing/completed allocation rules (§ Offer
> invariants) — withdrawal changes nothing about what has already been allocated. The unmatched
> withdrawn remainder is **no longer available to the marketplace**.
>
> *This decision adds one Offer status literal and nothing else. The `FXRequest` status enum is
> **unchanged**. No persistence or runtime implementation is introduced; the persisted
> representation belongs to the later domain-model milestone.*
>
> **Allocation arithmetic uses exact integer minor units** with explicit currency exponent/scale —
> never binary floating point. This is **marketplace/allocation arithmetic** and is distinct from
> **ledger posting representation**, which remains governed by ADR-002 (`amount_minor` BIGINT +
> `scale` + `currency_def_version`, with `ROUND_HALF_EVEN` applied at exactly one conversion
> point). **RESOLVED 2026-08-25 by DECISION S4-1 (HUMAN-APPROVED):** the former `NUMERIC(18,2)`
> column type below was a *PROPOSED shape, not ratified*, and the approved semantics were already
> exactness and minor-unit arithmetic. Those semantics now have a ratified column shape —
> `amount_minor BIGINT` + `currency` + `scale` + `currency_def_version` — so **marketplace/allocation
> arithmetic and ledger posting representation no longer use two different types**, and no
> decimal↔minor-unit conversion sits inside the acceptance transaction. ADR-002 remains
> authoritative for the ledger boundary and is aligned, not overridden.

|                         |               |              |                                     |                                            |
|-------------------------|---------------|--------------|-------------------------------------|--------------------------------------------|
| **Field**               | **Type**      | **Nullable** | **Validation**                      | **Business Meaning**                       |
| id                      | UUID          | No           | Primary key                         | Offer identifier                           |
| user_id                 | UUID          | No           | FK -\> Users.id                     | Offering user                              |
| source_currency         | CHAR(3)       | No           | ISO 4217                            | Currency offered                           |
| target_currency         | CHAR(3)       | No           | ISO 4217                            | Currency desired in exchange               |
| source_amount_minor     | BIGINT        | No           | \> corridor minimum; **exact integer minor units, never float or decimal**. Bound to `currency` + `scale` + `currency_def_version` (S4-1). *Type corrected 2026-08-25 from `NUMERIC(18,2)`* | **Original amount.** Conceptually `original_amount` |
| matched_amount_minor    | BIGINT        | No           | 0 ≤ matched_amount_minor ≤ source_amount_minor, enforced under row lock **and by DB CHECK**. **Exact integer minor units.** *Type corrected 2026-08-25 from `NUMERIC(18,2)*` | Sum of two disjoint sets: active-committed allocations and completed allocations. Each allocation counted exactly once. **Maintained under the acceptance row lock — never recomputed as `SUM(all historical Match rows)`** |
| scale                   | SMALLINT      | No           | Minor-unit exponent for `source_currency`; immutable once set | Fixes the meaning of the integer minor-unit amounts |
| currency_def_version    | VARCHAR(32)   | No           | Immutably bound when the Offer amount is established (S4-1) | Which currency definition interprets `source_currency` |
| *remaining_amount_minor* | *derived*    | —            | `source_amount_minor − matched_amount_minor` | **DERIVED — not persisted** |
| desired_rate            | NUMERIC(12,6) | No           | **`> 0` AND ≤ applicable approved reference ceiling; no reference-rate floor.** Positivity is a domain validity invariant, not a pricing floor (§3.3 rate-validity note). Validated at publication; re-checked at acceptance; **locked** on the resulting Match | Seller-selected exchange rate |
| ~~settlement_window_hours~~ | ~~SMALLINT~~ | — | **WITHDRAWN** | Superseded: window durations are configurable policy, not user input (ADR-001 §14.4) |
| status                  | ENUM          | No           | **CANONICAL ENUM — HUMAN-APPROVED 2026-08-25: `open`, `partially_matched`, `fully_matched`, `withdrawn`, `cancelled`, `expired`.** `withdrawn` is **added** by that decision and closes the prior status-model gap. Persisted enum literals may retain existing names for compatibility — the *conceptual* lifecycle is what is approved. The former binary `active \| matched` is **insufficient** | Marketplace visibility. **A partially matched Offer remains available for its remaining amount.** `withdrawn` = owner withdrew the still-unmatched remainder; existing allocations are untouched |

Match

**One accepted partial or full allocation of one Offer by one counterparty.** This is the
persisted/API form of the conceptual **`MatchAllocation`** — see the glossary in
`DOCUMENT_INDEX.md`. **HUMAN APPROVED, 2026-08-22:** the entity is **extended, not renamed**, and
**no second `MatchAllocation` table or entity exists**.

> Each Match is an **independent transaction/settlement failure domain**: Match → one Transaction
> (`match_id` UNIQUE) → one Settlement → **exactly two SettlementLegs** (ADR-001, unchanged).
>
> **Partner provisioning state is owned by `SettlementLeg`** (`ESCROW_PROVISIONED`,
> `PROVISION_FAILED`, `partner_id`, `escrow_account_ref`) per ADR-001 and is **not duplicated
> here**.

|                      |               |              |                                                     |                                   |
|----------------------|---------------|--------------|-----------------------------------------------------|-----------------------------------|
| **Field**            | **Type**      | **Nullable** | **Validation**                                      | **Business Meaning**              |
| id                   | UUID          | No           | Primary key                                         | Allocation identifier |
| offer_id             | UUID          | No           | FK -\> Offer.id                                     | Parent Offer |
| fx_request_id        | UUID          | **Yes**      | FK -\> FXRequest.id. **Optional/nullable** — a Match is creatable without any FXRequest | Legacy/compatibility linkage only |
| counterparty_user_id | UUID          | No           | FK -\> Users.id                                     | Accepting user |
| allocated_amount_minor | BIGINT      | No           | **\> 0**, enforced by DB CHECK; Σ valid allocations ≤ `Offer.source_amount_minor`, enforced under the Offer row lock. **Exact integer minor units** — *type corrected 2026-08-25 from `NUMERIC(18,2)` per S4-1* | **Amount allocated by this acceptance.** Reconciles the TDS `matched_amount` on Match — **one amount concept, not two** |
| currency             | CHAR(3)       | No           | ISO 4217; = `Offer.source_currency`                 | Allocation currency |
| scale                | SMALLINT      | No           | = the Offer's `scale`; immutable once set           | Minor-unit exponent for `allocated_amount_minor` |
| currency_def_version | VARCHAR(32)   | No           | Immutably bound at acceptance (S4-1)                | Which currency definition interprets `currency` |
| server_order_key     | BIGINT        | No           | **REQUIRED, UNIQUE, IMMUTABLE — DECISION S4-2, HUMAN-APPROVED 2026-08-25.** Server-generated inside the acceptance serialization boundary; **never client-supplied**; durable and orderable. A PostgreSQL sequence/identity is an acceptable generator. **The value need not be gapless** — rollback and sequence gaps are acceptable and carry no meaning. *Added to this schema 2026-08-25: the contract already required durable persistence (§ Offer acceptance Business Rules) but no column existed* | **Deterministic tie-break for acceptance priority.** Total order is `accepted_at ASC, server_order_key ASC` — `accepted_at` remains the **primary** criterion and is not replaced |
| agreed_rate          | NUMERIC(12,6) | No           | **`> 0`** and ≤ the applicable approved reference ceiling **as evaluated at the moment of acceptance**; locked at acceptance; never silently re-priced. **A persisted Match is never revalidated or re-priced by a later rate rule or ceiling change** — the validation above is an acceptance-time gate, not an ongoing constraint | **Immutable once set** |
| accepted_at          | TIMESTAMPTZ   | No           | **Server-set trusted timestamp.** A client-supplied value is never trusted | Establishes the allocation and its acceptance priority |
| preparation_state    | ENUM          | No           | Preparation lifecycle for this allocation           | **Window 1.** Beneficiary selection/validation and allocation-specific requirements |
| preparation_deadline | TIMESTAMPTZ   | **Yes**      | **Duration is OPEN / CONFIGURABLE — no value is set (ADR-001 §14.4).** **Nullable — corrected 2026-08-25**, matching `funding_deadline` below, whose window carries the identical OPEN/CONFIGURABLE status. **NULL does NOT mean unlimited preparation**; see the note below the table | End of the preparation window |
| funding_state        | ENUM          | No           | Funding lifecycle for this allocation               | **Window 2.** Runs only after `ALLOCATION_FUNDING_READY` |
| funding_deadline     | TIMESTAMPTZ   | Yes          | **Duration is OPEN / CONFIGURABLE — U-2 TBD**       | End of the funding window |
| allocation_requirements | JSONB      | Yes          | Applicable allocation-specific requirements         | Evaluated during preparation |
| ~~status~~           | ~~ENUM~~      | —            | ~~pending_confirmation, confirmed, expired, cancelled~~ **SUPERSEDED** — no bilateral confirmation step exists | Replaced by `preparation_state` / `funding_state` |
| ~~expires_at~~       | ~~TIMESTAMPTZ~~ | —          | ~~30 minutes from creation~~ **WITHDRAWN**, no replacement value | Replaced by the two configurable deadlines |

> **Unset preparation window — representation corrected 2026-08-25.** `preparation_deadline` was
> `NOT NULL` while the same row stated that the preparation-window duration is **OPEN /
> CONFIGURABLE and no value is set**. Those two statements cannot both hold: with no approved
> duration there is nothing from which to derive a deadline, so a new `Match` could not populate a
> required column and the table was unimplementable as written. The sibling `funding_deadline`
> carries the identical OPEN/CONFIGURABLE status (**U-2, TBD**) and was already **nullable**; the
> asymmetry was a documentation defect, not a modelled difference.
>
> **The representation, not the duration, is what is fixed here.** `preparation_deadline` is
> **nullable while no approved preparation-window duration exists**. Once the applicable policy
> supplies that duration and the preparation window is instantiated for an allocation, the
> deadline becomes **derivable** from `Match.accepted_at` — the trusted server timestamp that
> starts the window (ADR-001 §14.4) — and is populated then.
>
> **NULL does NOT mean unlimited preparation, and does not mean the window has been waived.** It
> means the policy value required to establish the deadline is **not yet configured**, so the
> deadline has **not yet been instantiated**. Preparation-failure semantics (ADR-001 §14.5) are
> **unchanged** and are not weakened by a null: an allocation whose preparation is not completed
> before its deadline terminates with an attributable cause and returns its allocated amount to
> the Offer's remaining capacity. **Production activation of any flow that depends on the
> preparation deadline remains BLOCKED until the preparation-window duration is approved** — it is
> governance-deferred on the same terms as §11 of ADR-001 and **must not be assumed or defaulted**.
>
> **No duration value is invented, proposed or implied by this correction.** No new field, state,
> enum literal or transition is introduced, and ADR-001 is unamended.

Transaction

The financial record created for a Match. **HUMAN APPROVED, 2026-08-22: the Transaction layer is KEPT** — not collapsed into Match or Settlement. `Match → one Transaction (match_id UNIQUE) → one Settlement → exactly two SettlementLegs` preserves the independent allocation/settlement boundary and avoids changes adjacent to ADR-001. *(The former "once a Match is fully confirmed" wording is superseded: there is no bilateral confirmation step.)*

|            |             |              |                                                  |                               |
|------------|-------------|--------------|--------------------------------------------------|-------------------------------|
| **Field**  | **Type**    | **Nullable** | **Validation**                                   | **Business Meaning**          |
| id         | UUID        | No           | Primary key                                      | Transaction identifier        |
| match_id   | UUID        | No           | FK -\> Match.id, unique                          | Originating match             |
| status     | ENUM        | No           | initiated, settling, completed, unwinding, recovery, closed, on_hold | **Read-only derived projection** of Settlement.phase — see below. Never writable through any API path |
| created_at | TIMESTAMPTZ | No           | System-set                                       | Audit trail / timeline anchor |

> **RECONCILED — ADR-001 (DEC-003), 2026-08-18.** `Transaction.status` is a presentation projection only. Any endpoint that accepts a write to it is a defect.

|                        |                                                                     |
|------------------------|---------------------------------------------------------------------|
| **Transaction.status** | **Derived from Settlement.phase**                                   |
| initiated              | INITIALIZING, AWAITING_FUNDING                                      |
| settling               | RELEASING                                                           |
| completed              | COMPLETED                                                           |
| unwinding              | UNWINDING                                                           |
| recovery               | RECOVERY_REQUIRED — operationally visible; never folded into failure |
| closed                 | CLOSED_UNWOUND, CLOSED_RECOVERED, CLOSED_WITH_LOSS, CANCELLED       |
| on_hold                | Any open SettlementHold with blocks_progression = true              |

Settlement

The settlement aggregate linked to a Transaction. Records **workflow decisions only** — it holds no monetary facts and therefore cannot contradict its legs.

|                        |              |              |                                                                                |                                        |
|------------------------|--------------|--------------|--------------------------------------------------------------------------------|----------------------------------------|
| **Field**              | **Type**     | **Nullable** | **Validation**                                                                 | **Business Meaning**                   |
| id                     | UUID         | No           | Primary key                                                                    | Settlement identifier                  |
| transaction_id         | UUID         | No           | FK -\> Transaction.id, unique                                                  | Parent transaction                     |
| phase                  | ENUM         | No           | INITIALIZING, AWAITING_FUNDING, RELEASING, COMPLETED, UNWINDING, CLOSED_UNWOUND, RECOVERY_REQUIRED, CLOSED_RECOVERED, CLOSED_WITH_LOSS, CANCELLED | Forward-only. See ADR-001 §5           |
| release_authorized_at  | TIMESTAMPTZ  | Yes          | Set once; immutable; partial unique index                                      | The release decision fact              |
| closure_reason         | ENUM         | Yes          | TIMEOUT, REMATCH, PARTY_CANCELLED, PROVISION_FAILED, RECOVERED, LOSS_RECOGNIZED | Required on terminal phases            |
| rematched_to           | UUID         | Yes          | FK -\> Settlement.id                                                           | Set only from CLOSED_UNWOUND           |
| compensates_settlement_id | UUID      | Yes          | FK -\> Settlement.id                                                           | Set on compensating settlements only   |
| ~~outstanding_exposure_amount_minor~~ | — | — | **DEFERRED — NOT IMPLEMENTABLE UNTIL THE MIXED IRREVERSIBLE PAYOUT AGGREGATE-STATE DECISION IS RESOLVED. DECISION 4.1A-F3, HUMAN-APPROVED 2026-08-26.** Removed from the implementation-ready schema; see the note below. No migration may create this column | *(deferred concept — see note)* |

> **`outstanding_exposure_amount_minor` — DEFERRED, DECISION 4.1A-F3 (HUMAN-APPROVED 2026-08-26).**
> The concept is retained and the field is not: it is withdrawn from the implementation-ready
> `Settlement` schema until the mixed irreversible payout aggregate-state decision is resolved.
>
> **Why it could not stay as written.** The row declared a bare `BIGINT` and asserted that it
> *"carries `currency`, `scale` and `currency_def_version` with it"* — three columns that
> `Settlement` does not define and, per DECISION 4.1A-F3, **must not gain merely to keep this
> field alive**. A monetary amount with no currency, no scale and no currency-definition version
> is not interpretable at all, let alone historically; and the claim sat directly beneath this
> table's own statement that `Settlement` *"records **workflow decisions only** — it holds no
> monetary facts and therefore cannot contradict its legs."* Either the amount was unbound or the
> table was no longer workflow-only. Both readings are wrong, so the field is deferred rather
> than repaired.
>
> **What is NOT decided here.** The mixed irreversible payout aggregate-state semantics that
> would populate this value — how exposure is derived when one leg has reached the irreversible
> `PAID_OUT` state and the other has not, and in which currency an exposure spanning two legs is
> even denominated — remain **OPEN**. This entry deliberately does not invent that calculation,
> does not choose a denominating leg, and does not pre-commit a column shape for it.
> `RECOVERY_REQUIRED` remains an operationally visible phase (ADR-001 §5); what is deferred is
> the persisted monetary field, not the phase.
>
> **Reinstating it** requires the aggregate-state decision, then an S4-1-conformant shape —
> `amount_minor` + `currency` + `scale` + `currency_def_version`, immutably bound — on whichever
> record the resolved semantics say owns it, behind its own reviewed migration.

SettlementLeg

**Authoritative for per-leg monetary facts.** Exactly two rows per Settlement.

|                          |               |              |                                                                                |                                        |
|--------------------------|---------------|--------------|--------------------------------------------------------------------------------|----------------------------------------|
| **Field**                | **Type**      | **Nullable** | **Validation**                                                                 | **Business Meaning**                   |
| leg_id                   | UUID          | No           | Primary key; immutable                                                         | Partner-event correlation and idempotency |
| settlement_id            | UUID          | No           | FK -\> Settlement.id                                                           | Parent settlement                      |
| party_role               | ENUM          | No           | REQUESTER, ACCEPTER; UNIQUE(settlement_id, party_role)                         | Semantic leg identity — not positional |
| state                    | ENUM          | No           | PENDING, ESCROW_PROVISIONED, FUNDED, RELEASE_SENT, PAID_OUT, RETURN_SENT, RETURNED, PROVISION_FAILED, PAYOUT_FAILED | PAID_OUT is irreversible |
| currency                 | CHAR(3)       | No           | ISO 4217                                                                       | Leg currency                           |
| amount_minor             | BIGINT        | No           | **Exact integer minor units. Never binary floating point.** **REPRESENTATION COMPLETED 2026-08-25 by DECISION S4-1** — supersedes the former `NUMERIC(20,4)` column marked *"REPRESENTATION INCOMPLETE"*. Must equal `Σ` of this leg's `PayoutExecution.amount_minor` where payouts exist | Leg amount |
| currency_def_version     | VARCHAR(32)   | No           | **Immutably bound when the leg amount is established** (S4-1). *Was "REQUIRED, not yet in this schema" — now in the schema.* Type matches the `LedgerLine` authority in this document | Which currency definition interprets `currency` |
| scale                    | SMALLINT      | No           | **Immutable minor-unit exponent captured with the leg amount** (S4-1). *Was "REQUIRED, not yet in this schema" — now in the schema.* Inherited unchanged by every `PayoutExecution` of this leg | Fixes the meaning of the integer minor-unit amount |
| source_jurisdiction      | CHAR(2)       | No           | ISO 3166-1 alpha-2; CHECK = destination_jurisdiction                           | Domestic-only enforcement              |
| destination_jurisdiction | CHAR(2)       | No           | ISO 3166-1 alpha-2; CHECK = source_jurisdiction                                | No leg may cross a border              |
| partner_id               | UUID          | No           | Assigned partner; a partner may advance only its own leg                       | Adapter routing                        |
| escrow_account_ref       | VARCHAR(255)  | Yes          | Tokenized reference; never a raw account number                                | Partner-held escrow                    |
| beneficiary_validated_at | TIMESTAMPTZ   | Yes          | Required non-null before release authorization                                 | Account-name-inquiry gate (Doc 07 §3.3) |
| funded_at / paid_out_at / returned_at | TIMESTAMPTZ | Yes | Set only by signature-verified partner webhook                              | Money-fact timestamps                  |

> **Monetary binding on `SettlementLeg` — REQUIRED, added 2026-08-24.** A leg's amount must be
> bound to an interpretation that is **immutable once the amount is established**, sufficient to
> reconstruct the exact value later: the **currency**, the **`currency_def_version`** that
> interprets it, the **scale**, and an **exact integer minor-unit amount**. Without the version
> and scale, a later change to currency metadata makes exact-total validation and historical
> replay ambiguous -- the same stored number would mean two different amounts.
>
> **CLOSED 2026-08-25 by DECISION S4-1 (HUMAN-APPROVED).** The former `NUMERIC(20,4)` shape did
> not satisfy this and was never pretended to: it fixed four decimal places for every currency,
> recorded no definition version, and was a decimal presentation type rather than the integer
> minor-unit representation ADR-002 makes authoritative. It is now **replaced in the schema
> above** by exactly the four elements required here — `amount_minor BIGINT`, `currency CHAR(3)`,
> `scale SMALLINT`, `currency_def_version VARCHAR(32)` — so the leg carries its own complete,
> immutable monetary interpretation. **ADR-002 remains authoritative and is now consistent with
> this schema: financial arithmetic uses integer minor units with an explicit scale.**
>
> **`PayoutExecution` children inherit that binding.** A child takes the parent's currency,
> `currency_def_version` and scale; **no child may independently choose another scale**, and the
> `scale` column on the child is a copy of the parent's binding, never an independent choice.
>
> *Phase 1 adds no column, migration, ORM model or persistence for this. It is recorded as a
> **required dependency of the later domain-model/persistence milestone**, alongside
> `server_order_key`. The still-open mixed-irreversible-payout aggregate-state semantics are
> untouched.*

PayoutExecution

**HUMAN APPROVED as structure, 2026-08-22.** A child payout record beneath a single
`SettlementLeg`, used where one allocation distributes its payout across multiple eligible
**validated** beneficiary destinations: `SettlementLeg → PayoutExecution 0..n`.

| | | | | |
|---|---|---|---|---|
| **Field** | **Type** | **Nullable** | **Validation** | **Business Meaning** |
| id | UUID | No | Primary key | Payout child identifier |
| leg_id | UUID | No | FK -\> SettlementLeg.leg_id | Parent leg |
| beneficiary_account_id | UUID | No | FK -\> `BENEFICIARIES.id`; must be `validated` **and `BENEFICIARIES.currency` = the parent `SettlementLeg.currency`** | Destination. *`BeneficiaryAccount` is the conceptual/domain name; `BENEFICIARIES` is the canonical persisted identifier per the `DOCUMENT_INDEX.md` §2A glossary, and no table is renamed.* |
| amount_minor | BIGINT | No | **Exact integer minor units. Never binary floating point.** **MUST be strictly `> 0`** — added 2026-08-24; see the positivity invariant below. Zero is invalid and negative is invalid | Split amount |
| currency | CHAR(3) | No | ISO 4217; = leg currency | Payout currency |
| scale | SMALLINT | No | **= the minor-unit scale of the parent leg's `currency` under the applicable currency definition (ADR-002 `currency_def_version`), and identical across every `PayoutExecution` of that leg.** Stored on the row | Minor-unit exponent |

> **Exact-total invariant:** the sum of a leg's `PayoutExecution.amount_minor` values must equal
> **exactly** the amount due for that leg. Validated in integer minor units.
>
> **Positivity invariant — added 2026-08-24. Each child amount must be strictly positive.**
> The exact-total invariant is a statement about a *sum*, and a sum constrains its addends only
> when the addends are sign-constrained. With `amount_minor` left as an unconstrained `BIGINT`, a
> leg due `100_000` could be satisfied by children of `150_000` and `-50_000`: the aggregate
> validates, while one destination carries an oversized payout and another represents a negative
> payout to a validated beneficiary. Therefore **every `PayoutExecution.amount_minor` MUST be
> `> 0`**, and this is checked **per row, before** the aggregate is evaluated -- an aggregate
> check can never recover the constraint after the fact.
>
> **Zero-value rows are prohibited.** A `PayoutExecution` is a payout instruction to a specific
> validated beneficiary; a zero-amount instruction pays nothing, adds a destination to the payout
> set that cannot succeed or fail meaningfully, and would participate in the still-**OPEN**
> aggregate-state derivation below. A leg that needs no child for a destination simply has no
> child for it.
>
> **Negative values are invalid, and a correction or reversal is NOT a negative child row.** No
> compensating mechanism is defined here, and none is introduced by this rule. Where a reversal
> is required it must use a separately approved compensating mechanism under the applicable
> lifecycle; until such a mechanism is ratified, a negative child is simply a malformed record.
>
> **Error semantics — no new identifier.** A `PayoutExecution` is **server-constructed** beneath a
> `SettlementLeg`, never a client-supplied request field, so no client-facing validation code in
> §4.4 applies and **none is invented**. A violation is a construction-time invariant breach that
> must **fail closed** server-side before any row is written or dispatched; if it ever surfaces to
> a caller it does so as the existing catalogued `SYS_500_INTERNAL_ERROR`. The §4.4 catalogue is
> **unchanged** by this note, and its recounted totals are **45 enumerated / 43 active / 2 superseded** (2026-08-25).
>
> **One currency and one scale per leg — clarified 2026-08-24.** The invariant above adds
> `amount_minor` integers, and that addition is only well defined when every addend shares one
> scale: `1000` at scale 2 and `1000` at scale 4 are different amounts, and summing them yields a
> number that means nothing. `currency` was already pinned to the leg currency; `scale` was not,
> so the rule is now stated for both. Every `PayoutExecution` beneath one `SettlementLeg`
> **must** carry that leg's currency **and** that currency's minor-unit scale; child amounts are
> expressed in that common scale; the aggregate equals the applicable parent-leg payout amount
> once the payout set is complete. **No cross-currency addition may occur within one leg.** Any
> conversion happens **before** the leg amount is established and is **never** hidden inside child
> payout aggregation. This restates a rule the model already implies -- ADR-001 confines a leg to
> one currency, and `backend/app/core/money.py` already refuses arithmetic across differing
> currency or scale -- and introduces **no** exchange-rate behaviour, no new `SettlementLeg`
> field, and no change to the exactly-two-leg rule.
>
> **Destination currency must match too — added 2026-08-24.** Pinning the child's *label* to the
> leg currency is not enough: `BENEFICIARIES` carries its own payout `currency`, and requiring
> only `validated` would let a beneficiary denominated in another currency receive a child
> labelled in the leg currency. The full chain is
> **`PayoutExecution.currency` = `SettlementLeg.currency` = `BENEFICIARIES.currency`**, and a
> beneficiary denominated for a different currency **does not satisfy readiness** for that leg --
> so it cannot contribute to `ALLOCATION_FUNDING_READY`. **No FX conversion happens inside a
> payout child.** Any cross-currency conversion belonging to a regulated partner flow occurs
> **before** the resulting payout leg and destination contract are established, never hidden
> inside child aggregation.
>
> *Scope note: this fixes the **representation** of child amounts only. The aggregate derivation
> from child outcomes to leg state remains **OPEN** below and is untouched.*
>
> **`PayoutExecution` children are NOT additional `SettlementLeg` rows.** ADR-001's
> **exactly-two-leg** rule and `UNIQUE(settlement_id, party_role)` are **unchanged**; children are
> never counted as legs.
>
> **OPEN — REQUIRES CANONICAL RECONCILIATION.** The aggregate derivation from children to leg
> state, where some children succeed irreversibly and others fail or pause, is **not resolved**.
> `PAID_OUT` is **not** redefined and the aggregate meaning of ADR-001 **T-7, T-8 and T-9 is
> unchanged**. No implementation may derive a leg's `PAID_OUT` or `PAYOUT_FAILED`, or any phase
> transition, from child records. **This remains a production financial-semantics blocker.**

WebhookReceipt

**Append-only evidence. Carries no financial authority.** Every partner message received is retained here with an explicit verdict — valid, invalid, forged, duplicate or contradictory. A raw webhook never mutates financial state (ADR-002 / DEC-004).

|                   |              |              |                                                                    |                                          |
|-------------------|--------------|--------------|--------------------------------------------------------------------|------------------------------------------|
| **Field**         | **Type**     | **Nullable** | **Validation**                                                     | **Business Meaning**                     |
| id                | UUID         | No           | Primary key                                                        | Receipt identifier                       |
| provider_event_id | VARCHAR(255) | No           | Unique per partner                                                 | Partner-generated event identifier       |
| partner_id        | UUID         | No           | FK -\> Partner                                                     | Sending partner                          |
| raw_body          | BYTEA        | No           | Exact bytes as received; never re-serialized                       | Signature verification and dispute evidence |
| verdict           | ENUM         | No           | ACCEPTED, DUPLICATE, SIGNATURE_INVALID, REPLAY_SUSPECTED, SCHEMA_INVALID, UNRESOLVABLE_LEG, QUARANTINED, CONTRADICTORY | Classification outcome |
| received_at       | TIMESTAMPTZ  | No           | System-set                                                         | Append-only, no update path              |

PendingEvent

Quarantine for **valid** evidence whose prerequisite has not yet arrived. Re-evaluated on every subsequent acceptance for the same settlement. **Never silently discarded** — every row is either promoted to a SettlementEvent or converted to a ReconciliationException.

|                 |             |              |                                    |                                          |
|-----------------|-------------|--------------|------------------------------------|------------------------------------------|
| **Field**       | **Type**    | **Nullable** | **Validation**                     | **Business Meaning**                     |
| id              | UUID        | No           | Primary key                        | Quarantine identifier                    |
| receipt_id      | UUID        | No           | FK -\> WebhookReceipt.id           | Source evidence                          |
| settlement_id   | UUID        | No           | FK -\> Settlement.id               | Correlated settlement                    |
| leg_id          | UUID        | Yes          | FK -\> SettlementLeg.leg_id        | Correlated leg where leg-scoped          |
| missing_prerequisite | VARCHAR(64) | No      | Event type awaited                 | Why it is parked                         |
| status          | ENUM        | No           | PENDING, PROMOTED, ESCALATED       | Terminal states are PROMOTED or ESCALATED |
| quarantined_at  | TIMESTAMPTZ | No           | System-set                         | Ageing input — threshold **P-10 TBD**    |

SettlementEvent

Append-only. **Root of accepted internal truth**; Settlement.phase and SettlementLeg.state are projections, and the accounting ledger is posted from it. No UPDATE or DELETE path exists at any layer. A message becomes a SettlementEvent only after authentication, replay/idempotency check, schema validation, settlement/leg correlation, transition validation and financial invariant validation.

|               |             |              |                                            |                                       |
|---------------|-------------|--------------|--------------------------------------------|---------------------------------------|
| **Field**     | **Type**    | **Nullable** | **Validation**                             | **Business Meaning**                  |
| id            | UUID        | No           | Primary key                                | Event identifier                      |
| settlement_id | UUID        | No           | FK -\> Settlement.id                       | Parent settlement                     |
| leg_id        | UUID        | Yes          | FK -\> SettlementLeg.leg_id                | Null for settlement-scoped events     |
| event_type    | VARCHAR(64) | No           | Enumerated per Appendix D §7               | Immutable financial event             |
| payload       | JSONB       | No           | Never contains secrets or raw account data | Event detail                          |
| created_at    | TIMESTAMPTZ | No           | System-set                                 | Append-only, no update path           |

SettlementHold

Blocks phase progression without altering financial state. Zero or more may be open concurrently.

|                     |             |              |                                                                    |                                    |
|---------------------|-------------|--------------|--------------------------------------------------------------------|------------------------------------|
| **Field**           | **Type**    | **Nullable** | **Validation**                                                     | **Business Meaning**               |
| id                  | UUID        | No           | Primary key                                                        | Hold identifier                    |
| settlement_id       | UUID        | No           | FK -\> Settlement.id                                               | Held settlement                    |
| type                | ENUM        | No           | COMPLIANCE, DISPUTE, RECONCILIATION, DISPATCH_FAILURE, RISK        | Hold category                      |
| blocks_progression  | BOOLEAN     | No           | Default true                                                       | Progression requires zero open blocking holds |
| opened_by / closed_by | UUID      | Yes          | FK -\> Users.id; null for system-opened                            | Accountability                     |
| opened_at           | TIMESTAMPTZ | No           | System-set                                                         | Ageing/escalation input            |
| closed_at           | TIMESTAMPTZ | Yes          | Null while open; holds are closed, never deleted                   | Resolution                         |

Account

Chart-of-accounts node for Xspeeria's **own** economic activity. **Configuration, not code** (ADR-002 AR-12).

> **The chart of accounts itself is NOT approved — P-1 TBD, Finance + Accounting.** No account code, name or classification may be treated as normative through examples, sample schemas, comments, tests, seed data or implementation defaults. This entity defines the *shape* an account takes, never which accounts exist.

|              |             |              |                                                      |                                            |
|--------------|-------------|--------------|------------------------------------------------------|--------------------------------------------|
| **Field**    | **Type**    | **Nullable** | **Validation**                                       | **Business Meaning**                       |
| id           | UUID        | No           | Primary key                                          | Account identifier                         |
| code         | VARCHAR(64) | No           | Unique; supplied by approved configuration           | Account code — **P-1 TBD**                 |
| classification | ENUM      | No           | ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE           | Normal-balance side derives from this      |
| book         | ENUM        | No           | REAL, MEMORANDUM                                     | MEMORANDUM exists only if **P-7** adopts it; aggregate by partner/currency, **never per customer** |
| currency     | CHAR(3)     | No           | ISO 4217                                             | Accounts are per currency                  |

LedgerEntry

A balanced double-entry posting. Append-only; never updated, never deleted.

|                     |             |              |                                                    |                                            |
|---------------------|-------------|--------------|----------------------------------------------------|--------------------------------------------|
| **Field**           | **Type**    | **Nullable** | **Validation**                                     | **Business Meaning**                       |
| id                  | UUID        | No           | Primary key                                        | Entry identifier                           |
| source_event_id     | UUID        | No           | FK -\> SettlementEvent.id; **NOT NULL**            | The accepted event that caused this posting |
| posting_rule_id     | VARCHAR(64) | No           | **UNIQUE(source_event_id, posting_rule_id)**       | Exactly-once application of each applicable rule |
| posting_rule_version | VARCHAR(32) | No          | Recorded; **deliberately NOT part of the uniqueness key** | Deterministic historical replay. A version change must never silently repost history |
| reverses_entry_id   | UUID        | Yes          | FK -\> LedgerEntry.id; UNIQUE(reverses_entry_id, posting_rule_id) | Compensating entry; corrections only |
| entry_hash          | BYTEA       | No           | Hash of this entry's own canonical content; **no prev-pointer** | Per-entry tamper evidence with no write serialization |
| posted_at           | TIMESTAMPTZ | No           | System-set                                         | Append-only, no update path                |

LedgerLine

A single debit or credit within an entry.

|                      |             |              |                                        |                                        |
|----------------------|-------------|--------------|----------------------------------------|----------------------------------------|
| **Field**            | **Type**    | **Nullable** | **Validation**                         | **Business Meaning**                   |
| id                   | UUID        | No           | Primary key                            | Line identifier                        |
| entry_id             | UUID        | No           | FK -\> LedgerEntry.id                  | Parent entry                           |
| account_id           | UUID        | No           | FK -\> Account.id                      | Posted account                         |
| direction            | ENUM        | No           | DEBIT, CREDIT                          | Posting side                           |
| amount_minor         | BIGINT      | No           | **Exact integer minor units. Never binary floating point.** | Posting amount |
| currency             | CHAR(3)     | No           | ISO 4217; must match the account       | Currency of this line                  |
| scale                | SMALLINT    | No           | Stored on the line, not looked up      | Minor-unit exponent in force when posted |
| currency_def_version | VARCHAR(32) | No           | Versioned currency definition          | Keeps historical entries interpretable after a definition change |

**Balanced-entry invariant:** for every entry and every currency C appearing in it, `Σ debits(C) == Σ credits(C)` exactly, in integer minor units. No entry may balance across currencies without an explicit FX position account pair — **FX accounting treatment is P-9 TBD**.

ReconciliationException

Records a mismatch between Xspeeria records and a partner report. **Never mutates settlement state or ledger history**, and may reference terminal settlements.

|                   |               |              |                                                     |                                    |
|-------------------|---------------|--------------|-----------------------------------------------------|------------------------------------|
| **Field**         | **Type**      | **Nullable** | **Validation**                                      | **Business Meaning**               |
| id                | UUID          | No           | Primary key                                         | Exception identifier               |
| settlement_id     | UUID          | No           | FK -\> Settlement.id — may be terminal              | Affected settlement                |
| leg_id            | UUID          | Yes          | FK -\> SettlementLeg.leg_id                         | Affected leg, where leg-specific   |
| type              | ENUM          | No           | MISSING_IN_PARTNER, MISSING_IN_XSPEERIA, AMOUNT_MISMATCH, STATE_MISMATCH | Mismatch category |
| expected_amount_minor | BIGINT    | Yes          | **Exact integer minor units** (S4-1). **Binding corrected 2026-08-26 by DECISION 4.1A-F4 (HUMAN-APPROVED):** interpreted with **this row's own** `currency`/`scale`/`currency_def_version`, never via `leg_id`. *Type corrected 2026-08-25 from `NUMERIC(20,4)`* | Xspeeria's record                  |
| observed_amount_minor | BIGINT    | Yes          | **Exact integer minor units** (S4-1); same interpretation as `expected_amount_minor`, so the two are comparable without rounding. *Type corrected 2026-08-25 from `NUMERIC(20,4)`* | Partner's record                   |
| currency              | CHAR(3)   | Yes          | ISO 4217. **Added 2026-08-26 by DECISION 4.1A-F4.** Non-null **iff** either monetary amount is non-null (see the binding rule below) | Currency of the exception amounts |
| scale                 | SMALLINT  | Yes          | Minor-unit exponent captured with the amounts (S4-1). **Added 2026-08-26 by DECISION 4.1A-F4.** Non-null **iff** either monetary amount is non-null | Fixes the meaning of the integer minor-unit amounts |
| currency_def_version  | VARCHAR(32) | Yes        | Which currency definition interprets `currency` (S4-1; type matches the `LedgerLine` authority in this document). **Added 2026-08-26 by DECISION 4.1A-F4.** Non-null **iff** either monetary amount is non-null | Keeps the exception interpretable after a definition change |
| status            | ENUM          | No           | OPEN, UNDER_REVIEW, RESOLVED                        | Exception lifecycle                |
| resolution        | TEXT          | Yes          | Required on RESOLVED                                | Where money is genuinely wrong, remedy is a compensating settlement |

> **ReconciliationException monetary binding — DECISION 4.1A-F4, HUMAN-APPROVED 2026-08-26.**
>
> **Consistency rule (to be enforced by a DB CHECK when this table is implemented):**
>
> - If **either** `expected_amount_minor` **or** `observed_amount_minor` is non-null, then
>   `currency`, `scale` and `currency_def_version` **must all be non-null**.
> - If **both** monetary amounts are null, the three binding fields **may** be null.
>
> **Why the binding is on this row and not inherited through `leg_id`.** The previous wording
> interpreted both amounts *"with the related leg's `currency`/`scale`/`currency_def_version`"*,
> but `leg_id` is **nullable** — deliberately so, because a settlement-level reconciliation
> exception (`MISSING_IN_PARTNER`, `MISSING_IN_XSPEERIA`, or an aggregate `AMOUNT_MISMATCH`) may
> legitimately not be leg-specific. With `leg_id IS NULL` and an amount present, the amount had
> no currency, no scale and no definition version: an uninterpretable integer sitting in the one
> table whose entire purpose is to record that Xspeeria's money records and a partner's disagree.
>
> **`leg_id` is deliberately NOT made `NOT NULL`.** Forcing a leg merely to recover currency
> context would falsify the data — it would require inventing a leg attribution for exceptions
> that genuinely have none, which is worse than the gap it closes. The binding travels with the
> amounts instead, exactly as S4-1 requires of every authoritative persisted monetary value.
>
> This changes no monetary representation: `amount_minor` stays `BIGINT` exact integer minor
> units, and `NUMERIC`/`DECIMAL` is not reintroduced. **No `ReconciliationException` table is
> implemented in Milestone 4.1A**; this is the schema that the batch implementing it must build.

Notification

A single notification delivered or pending delivery to a user.

|           |             |              |                                                                    |                                                        |
|-----------|-------------|--------------|--------------------------------------------------------------------|--------------------------------------------------------|
| **Field** | **Type**    | **Nullable** | **Validation**                                                     | **Business Meaning**                                   |
| id        | UUID        | No           | Primary key                                                        | Notification identifier                                |
| user_id   | UUID        | No           | FK -\> Users.id                                                    | Recipient                                              |
| type      | ENUM        | No           | kyc_status, match_found, settlement_update, dispute_update, system | Drives deep-link and icon in UI                        |
| payload   | JSONB       | No           | Type-specific schema                                               | Rendered per Notification component spec (Document 04) |
| read_at   | TIMESTAMPTZ | Yes          | System-set                                                         | Null while unread                                      |

Dispute

A contested transaction requiring resolution.

|                   |          |              |                                                                    |                                              |
|-------------------|----------|--------------|--------------------------------------------------------------------|----------------------------------------------|
| **Field**         | **Type** | **Nullable** | **Validation**                                                     | **Business Meaning**                         |
| id                | UUID     | No           | Primary key                                                        | Dispute identifier                           |
| transaction_id    | UUID     | No           | FK -\> Transaction.id                                              | Disputed transaction                         |
| initiator_user_id | UUID     | No           | FK -\> Users.id                                                    | User who opened the dispute                  |
| reason            | ENUM     | No           | funds_not_received, wrong_amount, counterparty_unresponsive, other | Categorization for reporting                 |
| status            | ENUM     | No           | open, under_review, resolved                                       | Opens a SettlementHold of type DISPUTE while non-resolved. **Never a settlement phase, and never mutates a COMPLETED settlement** — post-completion correction is a new compensating settlement (ADR-001 §7.1) |
| outcome           | ENUM     | Yes          | favor_initiator, favor_counterparty, split, no_fault               | Set only on resolution                       |

AuditLog

Immutable, append-only record of security- and compliance-relevant actions.

|               |              |              |                        |                                                      |
|---------------|--------------|--------------|------------------------|------------------------------------------------------|
| **Field**     | **Type**     | **Nullable** | **Validation**         | **Business Meaning**                                 |
| id            | UUID         | No           | Primary key            | Log entry identifier                                 |
| actor_user_id | UUID         | Yes          | FK -\> Users.id        | Null for system-initiated actions                    |
| action        | VARCHAR(100) | No           | Enumerated action code | e.g., kyc.decision, user.suspend, offer.cancel       |
| target_type   | VARCHAR(50)  | No           | Entity name            | Polymorphic reference type                           |
| target_id     | UUID         | No           | Polymorphic reference  | Entity affected                                      |
| metadata      | JSONB        | Yes          | Action-specific detail | Never includes raw secrets or full document contents |
| created_at    | TIMESTAMPTZ  | No           | System-set             | Append-only, no update path                          |

6\. Event Catalogue

Domain events drive Xspeeria’s asynchronous processing via Celery workers and Redis as the broker, per ARCHITECTURE.md. Every event is published at-least-once and consumers are required to be idempotent.

6.1 Event Specifications

> **`MatchConfirmed` carries ACCEPTANCE semantics — clarified 2026-08-24.** Bilateral
> confirmation is withdrawn (`CORRECTIONS_v3.md` §11.11); acceptance alone establishes the
> allocation. The event name is retained as a **NAME / ROUTING compatibility alias only**, and it
> is emitted when the `Match` is **established by acceptance** -- never on a second confirmation
> step, which does not exist. A downstream consumer must not wait for a confirmation that will
> never arrive.
>
> **Semantic backward compatibility is NOT guaranteed — corrected 2026-08-25.** An earlier
> revision of this note said the name was retained *"so existing consumer contracts do not
> break"*. That was an **overclaim** and is **WITHDRAWN**. Retaining the name preserves the
> **event name, topic and routing** so that subscriptions, bindings and dispatch tables continue
> to resolve. It preserves **nothing about meaning**: the trigger moved from bilateral
> confirmation to acceptance, so a consumer written against the old semantics is **already
> wrong** even though its subscription still resolves. The dangerous failure is silent — the
> event arrives on the expected route, and a stale consumer treats acceptance as confirmation and
> starts a downstream action that is forbidden at that moment.
>
> **Consumer migration is therefore REQUIRED, not optional.** Every consumer of `MatchConfirmed`
> must be migrated to the current acceptance semantics before that consumer is relied upon. In
> particular: no consumer may wait for a second bilateral confirmation (none exists); no consumer
> may treat receipt of this event as confirmation, funding, or authorization to provision;
> Settlement consumption at acceptance is **RECORD-ONLY**; and partner-facing provisioning and
> dispatch remain gated on **`ALLOCATION_FUNDING_READY`** (ADR-001 §14.3), which this event
> neither starts, satisfies nor bypasses.
>
> *The event is **not** renamed here. Whether `MatchConfirmed` is ultimately renamed to
> `MatchCreated` remains an **OPEN human decision** — see the renaming note in this section.*
>
> **The event does NOT authorize provisioning — added 2026-08-24.** Moving emission earlier
> preserved the name and changed the timing, so the consumer contract has to be restated or a
> settlement consumer would provision on acceptance. Two distinct moments:
>
> | Moment | What it means | What it permits |
> |---|---|---|
> | **Acceptance event** (this event) | the `Match` exists; the accepted allocation is recorded | recording, notification, analytics. **Nothing partner-facing.** |
> | **Readiness transition** to `ALLOCATION_FUNDING_READY` | `TRANSACTION_ELIGIBLE` + `Match` exists + required beneficiary destination(s) selected and **validated** + every allocation-specific requirement satisfied | partner provisioning may occur; funding instructions may become actionable; the funding window may begin once instructions are activated |
>
> The Settlement service **must not** provision accounts, dispatch instructions or start a
> funding window on this event. ADR-001 Amendment A1 §14.3 is normative and unchanged: *partner
> provisioning and settlement instructions must not become actionable for a leg until the
> allocation it belongs to has reached `ALLOCATION_FUNDING_READY`*; `07_Banking_Integration_Specification_v1.1.md`
> §3 carries the same precondition. **This adds no second confirmation step** -- acceptance still
> establishes the allocation alone; readiness is a derived gate, not an approval action. A
> client asserting "I paid" never establishes `FUNDED`: authoritative `FUNDED` remains
> partner-webhook driven when that integration exists.
>
> **HUMAN DECISION REQUIRED — renaming.** `MatchCreated` already appears as an event name in
> `02_Technical_Design_Specification.md` §7 (module layout) and in the governance master prompt,
> and is the better fit for acceptance semantics. Promoting it into this canonical catalogue is a
> naming decision with consumer impact, so it is **reported, not made here**. Until it is taken,
> the alias above is the contract.

|                     |                         |                                                               |                                                       |                                                                                                     |                                            |
|---------------------|-------------------------|---------------------------------------------------------------|-------------------------------------------------------|-----------------------------------------------------------------------------------------------------|--------------------------------------------|
| **Event**           | **Producer**            | **Consumer(s)**                                               | **Payload (key fields)**                              | **Retry Policy**                                                                                    | **Idempotency**                            |
| UserRegistered      | Auth service            | Notification worker, Analytics                                | user_id, email, created_at                            | Exponential backoff, 5 attempts                                                                     | Keyed on user_id; consumer upserts         |
| KYCApproved         | Admin/KYC service       | Notification worker, Marketplace access-control cache         | user_id, kyc_case_id, approved_at                     | Exponential backoff, 5 attempts                                                                     | Keyed on kyc_case_id                       |
| KYCRejected         | Admin/KYC service       | Notification worker                                           | user_id, kyc_case_id, reason                          | Exponential backoff, 5 attempts                                                                     | Keyed on kyc_case_id                       |
| OfferCreated        | Marketplace service     | Marketplace discovery/listing projection, Analytics *(corrected 2026-08-25: the former "Matching engine (rate-band index)" consumer belongs to the **withdrawn** automated-matching model — there is no rate band and no background matcher; discovery is never allocation priority)* | offer_id, currency_pair, rate, amount                 | 3 attempts, dead-letter to DLQ on exhaustion                                                        | Keyed on offer_id                          |
| MatchConfirmed *(**compatibility alias — acceptance semantics**, clarified 2026-08-24)* | Marketplace/acceptance path | Settlement service *(**record only** — must not provision or dispatch before `ALLOCATION_FUNDING_READY`)*, Notification worker, Analytics | match_id, offer_id, counterparty_user_id, agreed_rate | Exponential backoff, 5 attempts, DLQ + PagerDuty alert on exhaustion (money-movement critical path) | Keyed on match_id                          |
| ReleaseAuthorized   | Settlement service      | Banking abstraction layer (Document 07) via transactional outbox, Notification worker | settlement_id, leg_id (x2), release_authorized_at | Exponential backoff, 5 attempts, DLQ + alert on exhaustion. Dispatch is per-leg and at-least-once; a successful dispatch on one leg is never rolled back because the other failed | Keyed on settlement_id + leg_id + operation. Emitted only after both legs are FUNDED |
| EscrowFunded        | Banking webhook handler | Settlement service                                            | settlement_id, leg_id, amount, currency, funded_at    | Exponential backoff, 5 attempts                                                                     | Keyed on settlement_id + leg_id + event_type + provider_event_id |
| PayoutConfirmed     | Banking webhook handler | Settlement service, Notification worker                       | settlement_id, leg_id, paid_out_at                    | Exponential backoff, 5 attempts, DLQ + alert on exhaustion                                          | Keyed on settlement_id + leg_id + event_type + provider_event_id |
| SettlementCompleted | Settlement service (both legs PAID_OUT) | Transaction service, Notification worker, Analytics | settlement_id, transaction_id, completed_at           | Exponential backoff, 5 attempts                                                                     | Keyed on settlement_id. **Derived by Xspeeria, never emitted directly by a partner** |
| RecoveryRequired    | Settlement service      | Admin queue, Compliance queue, Notification worker, Analytics | settlement_id, leg_id, outstanding_exposure_amount    | Exponential backoff, 5 attempts, DLQ + PagerDuty alert (unresolved customer exposure)                | Keyed on settlement_id                     |
| DisputeOpened       | Dispute service         | Settlement service (freeze), Notification worker, Admin queue | dispute_id, transaction_id, initiator_user_id         | 3 attempts, DLQ on exhaustion                                                                       | Keyed on dispute_id                        |
| NotificationSent    | Notification worker     | Analytics (delivery tracking)                                 | notification_id, user_id, channel, sent_at            | Best-effort, no retry (analytics-only)                                                              | Keyed on notification_id                   |

6.2 Event Flow Diagram

> **The diagram is gated on `ALLOCATION_FUNDING_READY` — corrected 2026-08-24.** It previously ran
> `MatchConfirmed` straight into the Settlement service and on to `ReleaseAuthorized` and the
> banking layer, which contradicted the `MatchConfirmed` contract in §6.1 and would have started
> settlement before beneficiary and allocation readiness. The active flow is now:
>
> **Offer acceptance** (`POST /v1/offers/{offer_id}/accept`) → **`Match` established**, terms
> frozen at acceptance → **preparation** (beneficiary selection and validation, allocation-specific
> requirements) → **`ALLOCATION_FUNDING_READY`** → *only then* **partner provisioning** and
> actionable **funding instructions** → the **funding window begins once instructions are
> activated** → authoritative **`FUNDED`** arrives by regulated-partner webhook (`EscrowFunded`)
> when that integration exists — **per leg** → **GATE: both legs `FUNDED`** → `ReleaseAuthorized`
> → `PayoutConfirmed` **per leg** → **GATE: both legs `PAID_OUT`** → `SettlementCompleted`.
>
> **Both-leg aggregation is explicit — corrected 2026-08-25.** The arrow sequence above previously
> ran `FUNDED → ReleaseAuthorized → PayoutConfirmed → SettlementCompleted` with no gate, which reads
> as a single-leg progression and contradicts the event table above (`SettlementCompleted |
> Settlement service (**both legs PAID_OUT**)`) and ADR-001. An implementer following the linear
> narrative could authorize release on one funded leg while the other leg is unfunded.
>
> **A `Settlement` has exactly two `SettlementLeg`s** (`UNIQUE(settlement_id, party_role)`,
> unchanged). `EscrowFunded` and `PayoutConfirmed` are **leg-scoped**; `ReleaseAuthorized` and
> `SettlementCompleted` are **settlement-wide** and therefore **aggregate**:
>
> | Settlement-wide event | May occur only when |
> |---|---|
> | `ReleaseAuthorized` | the canonical release conditions are satisfied for **BOTH** required legs |
> | `SettlementCompleted` | **BOTH** required legs satisfy the canonical `PAID_OUT`/completed requirements of ADR-001 |
>
> **ADR-001 is authoritative and unchanged** — this makes the existing aggregation visible in the
> flow narrative; it defines no state, redefines no transition and relaxes nothing. `PAID_OUT`
> remains irreversible, and no settlement may enter a terminal phase while customer funds remain
> unresolved.
>
> **The still-OPEN mixed irreversible payout aggregate-state problem is NOT resolved here** (ADR-001
> §14.7). Where some `PayoutExecution` children of a leg succeed irreversibly and others fail or
> pause, the derivation of that **leg's** own state remains **OPEN** and remains a production
> financial-semantics blocker. This correction gates settlement-wide events on **leg** outcomes; it
> says nothing about how a leg's outcome is derived from its children, and **no implementation may
> derive leg state or a phase transition from child payout records.**
>
> A Settlement consumer of `MatchConfirmed` is **RECORD-ONLY** at that point: it may record the
> allocation, notify and emit analytics, and it **must not** provision partner accounts, dispatch
> settlement instructions, release funds or start any funding-window behaviour on that event
> alone. **This introduces no second confirmation step** — acceptance still establishes the
> allocation by itself, and `ALLOCATION_FUNDING_READY` is a *derived gate*, not an approval
> action. **No new event is introduced**: every message in the diagram is an existing §6.1
> catalogue entry, and `MatchConfirmed` remains the compatibility alias emitted at acceptance.
> ADR-001 Amendment A1 §14.3 and `07_Banking_Integration_Specification_v1.1.md` §3 are normative
> and unchanged. A client asserting "I paid" never establishes `FUNDED`.

***Figure: Match-to-Settlement event flow***

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>```mermaid</p>
<p>sequenceDiagram</p>
<p>participant M as Matching Engine</p>
<p>participant Q as Redis (Celery Broker)</p>
<p>participant S as Settlement Service</p>
<p>participant B as Banking Abstraction Layer</p>
<p>participant N as Notification Worker</p>
<p>M-&gt;&gt;Q: publish MatchConfirmed (acceptance; compatibility alias)</p>
<p>Q-&gt;&gt;N: consume MatchConfirmed</p>
<p>N--&gt;&gt;User: push/email notification</p>
<p>Q-&gt;&gt;S: consume MatchConfirmed</p>
<p>Note over S: RECORD-ONLY. No provisioning, no instructions,</p>
<p>Note over S: no release, no funding window on this event.</p>
<p>S-&gt;&gt;S: preparation: beneficiary selection and validation</p>
<p>S-&gt;&gt;S: allocation-specific requirements satisfied</p>
<p>S-&gt;&gt;S: gate reached: ALLOCATION_FUNDING_READY</p>
<p>Note over S,B: Nothing above this gate is partner-facing.</p>
<p>S-&gt;&gt;B: partner provisioning (only after ALLOCATION_FUNDING_READY)</p>
<p>S--&gt;&gt;User: funding instructions activated</p>
<p>Note over S: Funding window begins once instructions are activated.</p>
<p>B-&gt;&gt;S: partner webhook: EscrowFunded (authoritative FUNDED, leg 1)</p>
<p>B-&gt;&gt;S: partner webhook: EscrowFunded (authoritative FUNDED, leg 2)</p>
<p>S-&gt;&gt;S: GATE: both legs FUNDED</p>
<p>S-&gt;&gt;Q: publish ReleaseAuthorized</p>
<p>Q-&gt;&gt;B: consume ReleaseAuthorized</p>
<p>B-&gt;&gt;S: partner webhook: PayoutConfirmed (leg 1, see Document 07)</p>
<p>B-&gt;&gt;S: partner webhook: PayoutConfirmed (leg 2, see Document 07)</p>
<p>S-&gt;&gt;S: GATE: both legs PAID_OUT</p>
<p>S-&gt;&gt;Q: publish SettlementCompleted</p>
<p>Q-&gt;&gt;N: consume SettlementCompleted</p>
<p>```</p></td>
</tr>
</tbody>
</table>

Appendix A: Open Items for Backend Engineering Ratification

- Confirm final corridor minimum/maximum amounts for the NGN⇄GBP launch (pilot) corridor, and separately for the NGN⇄USD Year 2 corridor (referenced but not numerically fixed above).

- ~~Confirm exact rate-band tolerance (±15% placeholder).~~ **RESOLVED — HUMAN APPROVED 2026-08-22, amended 2026-08-25.** The rule is **`0 < seller_rate ≤ applicable approved reference ceiling`**, hard block above the ceiling, **no reference-rate floor**. Positivity is a **domain validity invariant, not a pricing floor** (§3.3 rate-validity note). The ±15% symmetric band was a self-declared placeholder, is withdrawn, and is **not** restored. Still **OPEN / configurable**: reference-rate provider, update cadence, staleness policy, provider-unavailable behaviour. If an unmatched remaining Offer later violates a changed ceiling it keeps its lifecycle status and becomes temporarily **INELIGIBLE for acceptance** — *not* a `paused` lifecycle status, which does not exist (§3.2 eligibility note; `CORRECTIONS_v3.md` §11.10b) — and its seller-selected rate is never silently modified.

- Expand the Error Catalogue to the full 50+ target as each module’s edge cases are implemented and tested, rather than pre-specifying untested codes.

- Confirm whether Admin console requires a distinct OpenAPI schema subset or shares the v1 schema in full with role-based field visibility.
