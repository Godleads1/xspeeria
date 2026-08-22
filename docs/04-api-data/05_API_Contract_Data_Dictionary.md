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

> **`UNKNOWN — NOT VERIFIED` — missing normative security baseline.** Statements below previously cited a repository document named `SECURITY.md` as their normative source. **No such document exists.** No normative Security Baseline Specification currently exists in this repository, and the security-baseline decision (Decision 2, `AUDIT_PHASE0_2026-08-18.md` §14) remains **OPEN**. Those citations now read "the applicable approved security policy", which is **not yet determined** — the controls described therefore lack their expected normative grounding. Documented requirements are not evidence of implementation or verification.

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

All state-mutating POST endpoints that initiate money movement or matching (offer creation, match confirmation, settlement initiation) require an Idempotency-Key header (client-generated UUIDv4). The server persists the key-to-response mapping for 24 hours; a repeated request with the same key returns the original response without reprocessing.

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
| Business Rules   | Only listings in status="active" are returned; a user’s own listings are included and flagged is_own: true        |

**POST /v1/offers**

|                  |                                                                                                                                    |
|------------------|------------------------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                                  |
| Purpose          | Create a new FX offer.                                                                                                             |
| Permissions      | Authenticated, KYC-approved                                                                                                        |
| Required Headers | Authorization: Bearer {access_token}, Idempotency-Key: {uuid}                                                                      |
| Request JSON     | source_currency, target_currency, source_amount (Decimal string), desired_rate (Decimal string), settlement_window_hours (integer) |
| Success Response | 201 Created — Offer object, status: "active"                                                                                       |
| Error Responses  | VAL_422_RATE_OUT_OF_BAND, VAL_422_AMOUNT_BELOW_MINIMUM, AUTH_403_KYC_REQUIRED                                                      |
| Validation Rules | desired_rate must fall within ±15% of the current reference market rate; source_amount ≥ corridor minimum                          |
| Business Rules   | Rate-band check protects counterparties from mispriced or manipulative offers                                                      |

**POST /v1/requests**

|                  |                                                               |
|------------------|---------------------------------------------------------------|
| **Field**        | **Specification**                                             |
| Purpose          | Create a new FX request (mirror of Offer, inverse direction). |
| Permissions      | Authenticated, KYC-approved                                   |
| Required Headers | Authorization: Bearer {access_token}, Idempotency-Key: {uuid} |
| Request JSON     | Identical shape to POST /v1/offers                            |
| Success Response | 201 Created — Request object, status: "active"                |
| Error Responses  | Identical to POST /v1/offers                                  |
| Validation Rules | Identical to POST /v1/offers                                  |
| Business Rules   | Identical to POST /v1/offers                                  |

**PATCH /v1/offers/{offer_id}**

|                  |                                                                                                          |
|------------------|----------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                        |
| Purpose          | Edit an active, unmatched offer.                                                                         |
| Permissions      | Authenticated (owner)                                                                                    |
| Required Headers | Authorization: Bearer {access_token}                                                                     |
| Request JSON     | desired_rate (optional), settlement_window_hours (optional)                                              |
| Success Response | 200 OK — updated Offer                                                                                   |
| Error Responses  | RES_409_OFFER_ALREADY_MATCHED, AUTH_403_NOT_OWNER                                                        |
| Validation Rules | Same rate-band validation as creation                                                                    |
| Business Rules   | Editing an offer that has pending match interest invalidates that interest and notifies the counterparty |

**DELETE /v1/offers/{offer_id}**

|                  |                                                                                                                  |
|------------------|------------------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                                |
| Purpose          | Cancel an active offer.                                                                                          |
| Permissions      | Authenticated (owner)                                                                                            |
| Required Headers | Authorization: Bearer {access_token}                                                                             |
| Request JSON     | none                                                                                                             |
| Success Response | 200 OK — { status: "cancelled" }                                                                                 |
| Error Responses  | RES_409_OFFER_ALREADY_MATCHED                                                                                    |
| Validation Rules | N/A                                                                                                              |
| Business Rules   | Cannot cancel an offer once matched; must go through dispute/cancellation-with-counterparty-consent flow instead |

3.5 Matching

**POST /v1/offers/{offer_id}/accept**

|                  |                                                                                                           |
|------------------|-----------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                         |
| Purpose          | Accept an offer, creating a Match.                                                                        |
| Permissions      | Authenticated, KYC-approved, not the offer owner                                                          |
| Required Headers | Authorization: Bearer {access_token}, Idempotency-Key: {uuid}                                             |
| Request JSON     | none                                                                                                      |
| Success Response | 201 Created — Match object, status: "pending_confirmation"                                                |
| Error Responses  | RES_409_OFFER_UNAVAILABLE, AUTH_403_SELF_MATCH_FORBIDDEN                                                  |
| Validation Rules | A user cannot match against their own offer                                                               |
| Business Rules   | Acceptance locks the offer (status → "matched") atomically to prevent double-acceptance under concurrency |

**POST /v1/matches/{match_id}/confirm**

|                  |                                                                                                       |
|------------------|-------------------------------------------------------------------------------------------------------|
| **Field**        | **Specification**                                                                                     |
| Purpose          | Both-party confirmation step before settlement begins.                                                |
| Permissions      | Authenticated (either matched party)                                                                  |
| Required Headers | Authorization: Bearer {access_token}                                                                  |
| Request JSON     | none                                                                                                  |
| Success Response | 200 OK — { status: "confirmed_by_you", both_confirmed: boolean }                                      |
| Error Responses  | RES_409_MATCH_ALREADY_CONFIRMED, RES_410_MATCH_EXPIRED                                                |
| Validation Rules | Match auto-expires and reverts the offer to active if not confirmed by both parties within 30 minutes |
| Business Rules   | Settlement initiation (Section 3.6) is only triggered once both_confirmed = true                      |

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
| Error Responses  | AUTH_403_FORBIDDEN, RES_409_INVALID_SETTLEMENT_STATE                                                                   |
| Validation Rules | Caller must be the funding party for the supplied leg_id                                                               |
| Business Rules   | **RECONCILED — ADR-001 (DEC-003).** This endpoint does not change `SettlementLeg.state` and does not advance `Settlement.phase`. Only a signature-verified partner webhook may set the `FUNDED` money fact (ADR-001 F-6, F-7). The claim is recorded for support and dispute evidence, and may drive UI messaging, but carries no financial authority. It previously returned a settlement status of `funds_pending_verification`, which implied a client-asserted state change |

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

Errors follow a consistent envelope: { error_code, message, details? }. Codes are namespaced by domain prefix for fast triage. The following 54 codes constitute the MVP error catalogue; new codes require an update to this document before shipping.

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
| VAL_422_RATE_OUT_OF_BAND     | 422             | Desired rate exceeds ±15% of reference market rate |
| VAL_422_AMOUNT_BELOW_MINIMUM | 422             | Source amount below corridor minimum               |
| VAL_422_REASON_REQUIRED      | 422             | A required justification field was omitted         |
| VAL_422_MALFORMED_JSON       | 422             | Request body is not valid JSON                     |
| VAL_422_MISSING_FIELD        | 422             | A required field was omitted                       |

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
| RES_409_OFFER_UNAVAILABLE        | 409             | Offer no longer active (cancelled/expired/matched)     |
| RES_409_MATCH_ALREADY_CONFIRMED  | 409             | Caller has already confirmed this match                |
| RES_409_DISPUTE_ALREADY_OPEN     | 409             | An open dispute already exists for this transaction    |
| RES_409_INVALID_SETTLEMENT_STATE | 409             | Action not valid for the current settlement phase or leg state. Response names the current phase and the attempted transition, and must not disclose counterparty leg detail |
| RES_409_SETTLEMENT_ON_HOLD       | 409             | An open blocking SettlementHold prevents progression   |
| RES_422_UNRESOLVABLE_LEG         | 422             | Partner event carried no resolvable leg_id — rejected, never defaulted |
| RES_410_MATCH_EXPIRED            | 410             | Match confirmation window elapsed                      |

4.5 System (SYS\_\*)

|                                |                 |                                                        |
|--------------------------------|-----------------|--------------------------------------------------------|
| **Code**                       | **HTTP Status** | **Meaning**                                            |
| SYS_500_INTERNAL_ERROR         | 500             | Unhandled server error                                 |
| SYS_503_SERVICE_UNAVAILABLE    | 503             | Dependency (DB, Redis, Celery) temporarily unavailable |
| SYS_504_UPSTREAM_TIMEOUT       | 504             | A downstream/banking dependency timed out              |
| SYS_409_IDEMPOTENCY_KEY_REUSED | 409             | Idempotency key reused with a different request body   |

> **ASSUMPTION:** *The catalogue above totals 39 explicitly enumerated codes across five namespaces. Reaching the requested minimum of 50 requires additional module-specific codes (e.g., Admin-suspension edge cases, Notification delivery failures) that should be authored incrementally as each module is implemented, rather than pre-invented without an implementation to validate them against — inventing precise numeric coverage here would reduce document accuracy for the sake of a count.*

5\. Data Dictionary

Schema definitions for every persisted entity. All monetary fields use PostgreSQL NUMERIC (mapped to Python Decimal via SQLAlchemy) per AGENTS.md and ARCHITECTURE.md; float is never used for money anywhere in the schema.

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

FXRequest

A user’s request to exchange currency (inverse of Offer).

|                 |               |              |                                     |                                     |
|-----------------|---------------|--------------|-------------------------------------|-------------------------------------|
| **Field**       | **Type**      | **Nullable** | **Validation**                      | **Business Meaning**                |
| id              | UUID          | No           | Primary key                         | Request identifier                  |
| user_id         | UUID          | No           | FK -\> Users.id                     | Requester                           |
| source_currency | CHAR(3)       | No           | ISO 4217                            | Currency being offered by requester |
| target_currency | CHAR(3)       | No           | ISO 4217, != source_currency        | Currency desired                    |
| source_amount   | NUMERIC(18,2) | No           | \> corridor minimum                 | Decimal precision, never float      |
| desired_rate    | NUMERIC(12,6) | No           | Within ±15% of reference rate       | Requested exchange rate             |
| status          | ENUM          | No           | active, matched, cancelled, expired | Marketplace visibility              |

Offer

A user’s offer to exchange currency.

|                         |               |              |                                     |                                            |
|-------------------------|---------------|--------------|-------------------------------------|--------------------------------------------|
| **Field**               | **Type**      | **Nullable** | **Validation**                      | **Business Meaning**                       |
| id                      | UUID          | No           | Primary key                         | Offer identifier                           |
| user_id                 | UUID          | No           | FK -\> Users.id                     | Offering user                              |
| source_currency         | CHAR(3)       | No           | ISO 4217                            | Currency offered                           |
| target_currency         | CHAR(3)       | No           | ISO 4217                            | Currency desired in exchange               |
| source_amount           | NUMERIC(18,2) | No           | \> corridor minimum                 | Decimal precision, never float             |
| desired_rate            | NUMERIC(12,6) | No           | Within ±15% of reference rate       | Offered exchange rate                      |
| settlement_window_hours | SMALLINT      | No           | 1–72                                | Max time allowed for settlement post-match |
| status                  | ENUM          | No           | active, matched, cancelled, expired | Marketplace visibility                     |

Match

A confirmed pairing between an Offer and an accepting counterparty.

|                      |               |              |                                                     |                                   |
|----------------------|---------------|--------------|-----------------------------------------------------|-----------------------------------|
| **Field**            | **Type**      | **Nullable** | **Validation**                                      | **Business Meaning**              |
| id                   | UUID          | No           | Primary key                                         | Match identifier                  |
| offer_id             | UUID          | No           | FK -\> Offer.id                                     | Matched offer                     |
| counterparty_user_id | UUID          | No           | FK -\> Users.id                                     | Accepting user                    |
| agreed_rate          | NUMERIC(12,6) | No           | Locked at match time                                | Immutable once set                |
| status               | ENUM          | No           | pending_confirmation, confirmed, expired, cancelled | Drives settlement eligibility     |
| expires_at           | TIMESTAMPTZ   | No           | 30 minutes from creation                            | Auto-reverts offer if unconfirmed |

Transaction

The financial record created once a Match is fully confirmed.

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
| outstanding_exposure_amount | NUMERIC(20,4) | Yes     | Non-null iff phase = RECOVERY_REQUIRED                                         | Unresolved customer exposure           |

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
| amount                   | NUMERIC(20,4) | No           | Decimal only; never float                                                      | Leg amount                             |
| source_jurisdiction      | CHAR(2)       | No           | ISO 3166-1 alpha-2; CHECK = destination_jurisdiction                           | Domestic-only enforcement              |
| destination_jurisdiction | CHAR(2)       | No           | ISO 3166-1 alpha-2; CHECK = source_jurisdiction                                | No leg may cross a border              |
| partner_id               | UUID          | No           | Assigned partner; a partner may advance only its own leg                       | Adapter routing                        |
| escrow_account_ref       | VARCHAR(255)  | Yes          | Tokenized reference; never a raw account number                                | Partner-held escrow                    |
| beneficiary_validated_at | TIMESTAMPTZ   | Yes          | Required non-null before release authorization                                 | Account-name-inquiry gate (Doc 07 §3.3) |
| funded_at / paid_out_at / returned_at | TIMESTAMPTZ | Yes | Set only by signature-verified partner webhook                              | Money-fact timestamps                  |

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
| expected_amount   | NUMERIC(20,4) | Yes          | Decimal only                                        | Xspeeria's record                  |
| observed_amount   | NUMERIC(20,4) | Yes          | Decimal only                                        | Partner's record                   |
| status            | ENUM          | No           | OPEN, UNDER_REVIEW, RESOLVED                        | Exception lifecycle                |
| resolution        | TEXT          | Yes          | Required on RESOLVED                                | Where money is genuinely wrong, remedy is a compensating settlement |

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

|                     |                         |                                                               |                                                       |                                                                                                     |                                            |
|---------------------|-------------------------|---------------------------------------------------------------|-------------------------------------------------------|-----------------------------------------------------------------------------------------------------|--------------------------------------------|
| **Event**           | **Producer**            | **Consumer(s)**                                               | **Payload (key fields)**                              | **Retry Policy**                                                                                    | **Idempotency**                            |
| UserRegistered      | Auth service            | Notification worker, Analytics                                | user_id, email, created_at                            | Exponential backoff, 5 attempts                                                                     | Keyed on user_id; consumer upserts         |
| KYCApproved         | Admin/KYC service       | Notification worker, Marketplace access-control cache         | user_id, kyc_case_id, approved_at                     | Exponential backoff, 5 attempts                                                                     | Keyed on kyc_case_id                       |
| KYCRejected         | Admin/KYC service       | Notification worker                                           | user_id, kyc_case_id, reason                          | Exponential backoff, 5 attempts                                                                     | Keyed on kyc_case_id                       |
| OfferCreated        | Marketplace service     | Matching engine (rate-band index), Analytics                  | offer_id, currency_pair, rate, amount                 | 3 attempts, dead-letter to DLQ on exhaustion                                                        | Keyed on offer_id                          |
| MatchConfirmed      | Matching engine         | Settlement service, Notification worker, Analytics            | match_id, offer_id, counterparty_user_id, agreed_rate | Exponential backoff, 5 attempts, DLQ + PagerDuty alert on exhaustion (money-movement critical path) | Keyed on match_id                          |
| ReleaseAuthorized   | Settlement service      | Banking abstraction layer (Document 07) via transactional outbox, Notification worker | settlement_id, leg_id (x2), release_authorized_at | Exponential backoff, 5 attempts, DLQ + alert on exhaustion. Dispatch is per-leg and at-least-once; a successful dispatch on one leg is never rolled back because the other failed | Keyed on settlement_id + leg_id + operation. Emitted only after both legs are FUNDED |
| EscrowFunded        | Banking webhook handler | Settlement service                                            | settlement_id, leg_id, amount, currency, funded_at    | Exponential backoff, 5 attempts                                                                     | Keyed on settlement_id + leg_id + event_type + provider_event_id |
| PayoutConfirmed     | Banking webhook handler | Settlement service, Notification worker                       | settlement_id, leg_id, paid_out_at                    | Exponential backoff, 5 attempts, DLQ + alert on exhaustion                                          | Keyed on settlement_id + leg_id + event_type + provider_event_id |
| SettlementCompleted | Settlement service (both legs PAID_OUT) | Transaction service, Notification worker, Analytics | settlement_id, transaction_id, completed_at           | Exponential backoff, 5 attempts                                                                     | Keyed on settlement_id. **Derived by Xspeeria, never emitted directly by a partner** |
| RecoveryRequired    | Settlement service      | Admin queue, Compliance queue, Notification worker, Analytics | settlement_id, leg_id, outstanding_exposure_amount    | Exponential backoff, 5 attempts, DLQ + PagerDuty alert (unresolved customer exposure)                | Keyed on settlement_id                     |
| DisputeOpened       | Dispute service         | Settlement service (freeze), Notification worker, Admin queue | dispute_id, transaction_id, initiator_user_id         | 3 attempts, DLQ on exhaustion                                                                       | Keyed on dispute_id                        |
| NotificationSent    | Notification worker     | Analytics (delivery tracking)                                 | notification_id, user_id, channel, sent_at            | Best-effort, no retry (analytics-only)                                                              | Keyed on notification_id                   |

6.2 Event Flow Diagram

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
<p>M-&gt;&gt;Q: publish MatchConfirmed</p>
<p>Q-&gt;&gt;S: consume MatchConfirmed</p>
<p>S-&gt;&gt;Q: publish ReleaseAuthorized</p>
<p>Q-&gt;&gt;B: consume ReleaseAuthorized</p>
<p>Q-&gt;&gt;N: consume MatchConfirmed</p>
<p>N--&gt;&gt;User: push/email notification</p>
<p>B-&gt;&gt;S: webhook callback (see Document 07)</p>
<p>S-&gt;&gt;Q: publish SettlementCompleted</p>
<p>Q-&gt;&gt;N: consume SettlementCompleted</p>
<p>```</p></td>
</tr>
</tbody>
</table>

Appendix A: Open Items for Backend Engineering Ratification

- Confirm final corridor minimum/maximum amounts for the NGN⇄GBP launch (pilot) corridor, and separately for the NGN⇄USD Year 2 corridor (referenced but not numerically fixed above).

- Confirm exact rate-band tolerance (±15% used here as a placeholder consistent with typical P2P FX marketplaces) against actual liquidity/risk modeling.

- Expand the Error Catalogue to the full 50+ target as each module’s edge cases are implemented and tested, rather than pre-specifying untested codes.

- Confirm whether Admin console requires a distinct OpenAPI schema subset or shares the v1 schema in full with role-based field visibility.
