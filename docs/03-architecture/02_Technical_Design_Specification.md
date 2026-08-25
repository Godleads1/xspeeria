<!-- SOURCE DOCUMENT: 02_Technical_Design_Specification.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

# Table of Contents

# XSPEERIA

## Technical Design Specification (TDS)

**Document Classification:** Internal / Engineering / Confidential **Version:** 1.0 (Draft for Engineering Review) **Audience:** Engineering, DevOps, QA, Architecture, Security **Companion Documents:** Business Requirements Specification (BRS), Compliance & Operations Manual (COM)

## Document Control

| Field            | Value                                                                       |
|------------------|-----------------------------------------------------------------------------|
| Document Owner   | Enterprise Solution Architecture                                            |
| Review Cycle     | Quarterly, or upon major architectural change                               |
| Status           | Draft — Pre-Development                                                     |
| Related Corridor | NGN ⇄ GBP (Launch/pilot), NGN ⇄ USD added Year 2, modular expansion planned |
| Distribution     | Engineering, QA, DevOps, Security, Product, Compliance (read-only)          |

# TABLE OF CONTENTS

1.  Executive Overview
2.  System Architecture
3.  Technology Stack
4.  Repository Structure
5.  Domain-Driven Design
6.  Database Design
7.  API Design
8.  Sequence Diagrams
9.  Matching Engine
10. Transaction State Machine
11. Security Architecture
12. Infrastructure
13. Scalability Strategy
14. Testing Strategy
15. Architecture Decision Records

# 1. EXECUTIVE OVERVIEW

## 1.1 Purpose

This Technical Design Specification (TDS) defines the engineering blueprint for Xspeeria, a wallet-less, peer-to-peer fiat currency exchange platform. It translates the business requirements defined in the BRS into a concrete, buildable system architecture, data model, API contract, and operational design.

This document is the authoritative technical reference for all engineering, QA, DevOps, and security work on the Xspeeria platform. Where the BRS defines *what* the system must do and *why*, this TDS defines *how* it will be built.

## 1.2 Design Philosophy

Xspeeria’s technical architecture is governed by six non-negotiable engineering principles:

| Principle                     | Engineering Implication                                                                                                                                                                                                    |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Wallet-less by design         | No custody of user funds at any layer. No internal ledger that represents “held” balances beyond escrow-state tracking during an active matched transaction. Settlement occurs via licensed banking/payment partners.      |
| Deterministic financial rules | All monetary computation uses fixed-point decimal arithmetic. No floating-point types are permitted anywhere in the money-handling path.                                                                                   |
| AI assists, never settles     | Any AI/ML component (fraud scoring, support triage, document classification) may only advise, flag, or recommend. No AI component can authorize, trigger, or execute a movement of money or a change in transaction state. |
| Full auditability             | Every state-changing action on a financial entity produces an immutable audit log entry, including actor, timestamp, before/after state, and correlation ID.                                                               |
| Security by design            | Security controls (authN/authZ, encryption, rate limiting, input validation) are architectural requirements, not post-launch additions.                                                                                    |
| Compliance first              | KYC/AML gating is enforced at the API layer before any matching, offer creation, or transaction initiation logic executes — not as a UI-only restriction.                                                                  |

## 1.3 Assumption Log (Document-Wide)

**\[ASSUMPTION-TDS-01\]** Xspeeria will operate as a regulated Payment Service Provider (PSP) / Money Services Business (MSB) partner arrangement, relying on licensed banking partners for actual fiat custody and settlement rails. No claim is made in this document about Xspeeria itself holding a banking or money transmission license.

**\[ASSUMPTION-TDS-02\] The initial pilot corridor (NGN ⇄ GBP) will use at least one licensed Nigerian payment processor/bank partner and one licensed UK-side payment processor/bank partner, integrated via their respective settlement APIs; the Year 2 corridor (NGN ⇄ USD) will require an equivalent licensed US-side partner per the 5-Year Business Plan. The specific partners are commercial decisions outside the scope of this document.**

**\[ASSUMPTION-TDS-03\]** Mobile clients (React Native/Expo) target iOS and Android. A web client is out of scope for MVP unless stated otherwise in the BRS.

**\[ASSUMPTION-TDS-04\]** Infrastructure will be deployed on a major cloud provider (AWS, GCP, or Azure). This document remains provider-agnostic; provider-specific service names are used illustratively (AWS-flavored) and should be substituted per final infrastructure decision (see ADR-006).

**\[ASSUMPTION-TDS-05\]** Regulatory data residency requirements for Nigerian user PII may require in-country or regional data storage. This is flagged as a compliance-driven infrastructure constraint, to be finalized with legal counsel before production deployment.

## 1.4 Out of Scope for This Document

- Legal licensing strategy (covered in COM)
- Detailed AML policy thresholds (covered in COM)
- Pricing/revenue model (covered in BRS)
- UI visual design system beyond structural references

# 2. SYSTEM ARCHITECTURE

## 2.1 Architectural Style

Xspeeria is built as a **modular monolith at launch**, structured internally along Domain-Driven Design (DDD) bounded contexts, with clear seams that allow individual contexts (e.g., Matching, Settlement, KYC) to be extracted into independent services post-MVP without a rewrite.

**Rationale:** A premature microservices architecture increases operational complexity, distributed-transaction risk, and time-to-market for a team validating product-market fit in a single corridor. A well-bounded modular monolith preserves the option to decompose later (see TDS ADR-001, Section 15).

## 2.2 High-Level Architecture Diagram

    flowchart TB
        subgraph Client Layer
            MobileApp["React Native / Expo Mobile App (iOS/Android)"]
        end

        subgraph Edge Layer
            CDN["CDN / Static Assets"]
            WAF["WAF + API Gateway / Rate Limiter"]
        end

        subgraph Application Layer
            API["FastAPI Application (Modular Monolith)"]
            Auth["Auth Module"]
            KYC["KYC Module"]
            Marketplace["Marketplace / Offers Module"]
            Matching["Matching Engine Module"]
            Txn["Transaction / Escrow Module"]
            Settlement["Settlement Module"]
            Disputes["Disputes Module"]
            Notif["Notification Module"]
            Admin["Admin / Back-Office Module"]
        end

        subgraph Async Layer
            Redis["Redis (Cache, Locks, Queues)"]
            Celery["Celery Workers"]
            Beat["Celery Beat (Scheduler)"]
        end

        subgraph Data Layer
            PG["PostgreSQL (Primary OLTP)"]
            S3["Object Storage (KYC Docs, Evidence)"]
            AuditDB["Append-Only Audit Log Store"]
        end

        subgraph External Partners
            KYCProvider["KYC/Liveness Provider"]
            BankNG["Nigerian Banking/Payment Partner"]
            BankUS["US Banking/Payment Partner"]
            SanctionsAPI["Sanctions/PEP Screening Provider"]
            PushSvc["Push/SMS/Email Provider"]
        end

        MobileApp --> CDN
        MobileApp --> WAF --> API
        API --> Auth
        API --> KYC
        API --> Marketplace
        API --> Matching
        API --> Txn
        API --> Settlement
        API --> Disputes
        API --> Notif
        API --> Admin

        KYC --> KYCProvider
        KYC --> SanctionsAPI
        Settlement --> BankNG
        Settlement --> BankUS
        Notif --> PushSvc

        API --> Redis
        API --> Celery
        Celery --> Beat
        Celery --> PG
        Celery --> S3

        Auth --> PG
        KYC --> PG
        KYC --> S3
        Marketplace --> PG
        Matching --> PG
        Matching --> Redis
        Txn --> PG
        Settlement --> PG
        Disputes --> PG
        Disputes --> S3
        Admin --> PG

        Txn --> AuditDB
        Settlement --> AuditDB
        KYC --> AuditDB

## 2.3 Layered Architecture

    flowchart LR
        subgraph L1["Presentation Layer"]
            A1["Mobile UI Screens"]
            A2["State Management"]
        end
        subgraph L2["API / Interface Layer"]
            B1["FastAPI Routers"]
            B2["Request/Response Schemas (Pydantic)"]
            B3["Middleware: Auth, Rate Limit, Logging"]
        end
        subgraph L3["Application / Service Layer"]
            C1["Use Case Orchestrators"]
            C2["Domain Services"]
        end
        subgraph L4["Domain Layer"]
            D1["Entities / Aggregates"]
            D2["Value Objects"]
            D3["Domain Events"]
        end
        subgraph L5["Infrastructure Layer"]
            E1["SQLAlchemy Repositories"]
            E2["External API Adapters"]
            E3["Celery Task Adapters"]
        end

        L1 --> L2 --> L3 --> L4
        L3 --> L5
        L5 --> DB[(PostgreSQL)]
        L5 --> Ext[["External Partners"]]

**Design rule:** Dependencies point inward. The Domain Layer has zero knowledge of FastAPI, SQLAlchemy, or Celery. This enables unit testing of business rules (e.g., matching logic, fee calculation, state transitions) without spinning up infrastructure.

## 2.4 Component Responsibilities

| Component           | Responsibility                                                 | Owns Data                       |
|---------------------|----------------------------------------------------------------|---------------------------------|
| Auth Module         | Registration, login, MFA, session/token issuance               | Users, Sessions, Devices        |
| KYC Module          | Identity verification workflow, document handling, risk rating | KYCProfiles, KYCDocuments       |
| Marketplace Module  | FX request creation, offer creation, offer listing             | FXRequests, Offers              |
| Matching Engine     | **SUPERSEDED description** — the module creates a `Match` from an **explicit acceptance** of a published Offer (publish-and-accept, §9.2), never by automatically matching offers to requests. Retains §9.3 concurrency protection over concurrent acceptances of one Offer | Matches |
| Transaction Module  | Manages escrow-state transaction lifecycle                     | Transactions, TransactionEvents |
| Settlement Module   | Integrates with banking partners to trigger fiat movement      | SettlementInstructions          |
| Disputes Module     | Case management for contested transactions                     | Disputes, DisputeEvidence       |
| Notification Module | Push/SMS/email delivery                                        | NotificationLog                 |
| Admin Module        | Back-office operations, manual review queues                   | AdminActions                    |

# 3. TECHNOLOGY STACK

## 3.1 Stack Summary

| Layer                    | Technology              | Rationale                                                                                                                              |
|--------------------------|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| Mobile Client            | React Native + Expo     | Single codebase for iOS/Android; Expo accelerates OTA updates and build tooling for a small initial engineering team                   |
| Backend Framework        | FastAPI (Python)        | Async-native, strong typing via Pydantic, automatic OpenAPI generation, mature ecosystem for fintech-grade validation                  |
| Primary Database         | PostgreSQL              | ACID guarantees required for financial state; native support for numeric/decimal types, row-level locking, JSONB for flexible metadata |
| ORM                      | SQLAlchemy (2.0, async) | Explicit control over queries and transactions, critical for correctness in a money-handling system                                    |
| Caching / Locks / Queues | Redis                   | Distributed locking for matching engine concurrency, caching of read-heavy marketplace queries, Celery broker                          |
| Background Processing    | Celery + Celery Beat    | Asynchronous settlement polling, scheduled compliance jobs, notification dispatch, retry-safe task execution                           |
| Containerization         | Docker                  | Environment parity across dev/staging/production                                                                                       |
| API Documentation        | OpenAPI (via FastAPI)   | Auto-generated, versioned API contract for internal and partner consumption                                                            |

## 3.2 Supporting Technologies

| Purpose            | Technology (Illustrative)                                                    |
|--------------------|------------------------------------------------------------------------------|
| Object Storage     | S3-compatible storage for KYC documents, dispute evidence                    |
| Secrets Management | Cloud KMS / Vault                                                            |
| Observability      | Structured logging (JSON), OpenTelemetry tracing, Prometheus/Grafana metrics |
| CI/CD              | GitHub Actions                                                               |
| Error Tracking     | Sentry or equivalent                                                         |
| Feature Flags      | LaunchDarkly or equivalent (optional post-MVP)                               |

## 3.3 Explicitly Prohibited Patterns

- Floating-point (`float`/`double`) types for any monetary field — `Decimal`/`NUMERIC` only.
- Direct SQL string concatenation — parameterized queries / ORM only.
- Synchronous blocking calls to external partners inside the request/response cycle for settlement — must be queued via Celery.
- Storing KYC documents or PII in application logs.

# 4. REPOSITORY STRUCTURE

## 4.1 Monorepo Layout

    xspeeria/
    ├── apps/
    │   ├── mobile/                 # React Native / Expo app
    │   │   ├── src/
    │   │   │   ├── screens/
    │   │   │   ├── components/
    │   │   │   ├── navigation/
    │   │   │   ├── state/
    │   │   │   ├── api/
    │   │   │   └── theme/
    │   │   └── app.json
    │   │
    │   └── api/                    # FastAPI backend
    │       ├── src/
    │       │   ├── modules/
    │       │   │   ├── auth/
    │       │   │   ├── kyc/
    │       │   │   ├── marketplace/
    │       │   │   ├── matching/
    │       │   │   ├── transactions/
    │       │   │   ├── settlement/
    │       │   │   ├── disputes/
    │       │   │   ├── notifications/
    │       │   │   └── admin/
    │       │   │       ├── domain/          # entities, value objects, domain events
    │       │   │       ├── application/     # use cases / orchestrators
    │       │   │       ├── infrastructure/  # repositories, external adapters
    │       │   │       └── api/             # routers, schemas
    │       │   ├── core/
    │       │   │   ├── config.py
    │       │   │   ├── security.py
    │       │   │   ├── database.py
    │       │   │   ├── middleware.py
    │       │   │   └── exceptions.py
    │       │   ├── shared/
    │       │   │   ├── audit/
    │       │   │   ├── money/               # Decimal money value object, FX math
    │       │   │   └── events/
    │       │   └── main.py
    │       ├── tests/
    │       │   ├── unit/
    │       │   ├── integration/
    │       │   └── e2e/
    │       ├── alembic/                     # DB migrations
    │       └── celery_worker.py
    │
    ├── infra/
    │   ├── docker/
    │   ├── terraform/ (or equivalent IaC)
    │   └── ci/
    │
    ├── docs/
    │   ├── adr/
    │   └── openapi/
    │
    └── README.md

## 4.2 Module Internal Structure (Example: Matching Module)

    modules/matching/
    ├── domain/
    │   ├── entities.py         # Match, MatchCandidate
    │   ├── value_objects.py    # MatchScore, ExchangeRate
    │   └── events.py           # MatchCreated, MatchExpired
    ├── application/
    │   ├── find_matches.py
    │   ├── confirm_match.py
    │   └── expire_stale_matches.py
    ├── infrastructure/
    │   ├── repository.py       # SQLAlchemy implementation
    │   ├── lock_manager.py     # Redis distributed lock adapter
    ├── api/
    │   ├── router.py
    │   └── schemas.py
    └── tests/

**Design rule:** No module imports another module’s `infrastructure` or `domain` internals directly. Cross-module communication happens through the `application` layer’s public use-case interfaces or via domain events, enforcing the bounded-context seams needed for future service extraction.

# 5. DOMAIN-DRIVEN DESIGN

## 5.1 Bounded Contexts

| Bounded Context      | Responsibility                                          | Upstream/Downstream                                 |
|----------------------|---------------------------------------------------------|-----------------------------------------------------|
| Identity & Access    | User accounts, authentication, sessions                 | Upstream to all contexts                            |
| Compliance (KYC/AML) | Identity verification, risk rating, sanctions screening | Upstream to Marketplace, Transactions               |
| Marketplace          | FX requests, offers, listings                           | Downstream of Compliance; Upstream of Matching      |
| Matching             | Pairing requests to offers                              | Downstream of Marketplace; Upstream of Transactions |
| Transaction & Escrow | Lifecycle of a matched trade                            | Downstream of Matching; Upstream of Settlement      |
| Settlement           | Fiat movement via banking partners                      | Downstream of Transactions                          |
| Disputes             | Contested transaction handling                          | Downstream of Transactions                          |
| Notifications        | Cross-cutting communication                             | Consumer of domain events from all contexts         |
| Admin/Back-Office    | Operational oversight, manual intervention              | Consumer/actor across all contexts                  |

## 5.2 Context Map

    flowchart LR
        Identity["Identity & Access"] --> Compliance["Compliance (KYC/AML)"]
        Compliance --> Marketplace["Marketplace"]
        Marketplace --> Matching["Matching"]
        Matching --> TxnCtx["Transaction & Escrow"]
        TxnCtx --> Settlement["Settlement"]
        TxnCtx --> Disputes["Disputes"]
        TxnCtx -.events.-> Notifications["Notifications"]
        Compliance -.events.-> Notifications
        Settlement -.events.-> Notifications
        Admin["Admin/Back-Office"] -.oversight.-> Compliance
        Admin -.oversight.-> Disputes
        Admin -.oversight.-> TxnCtx

## 5.3 Core Aggregates

### 5.3.1 User Aggregate

- **Root:** `User`
- **Entities:** `Profile`, `Device`, `Session`
- **Value Objects:** `Email`, `PhoneNumber`, `Password Hash`
- **Invariants:** A `User` cannot be treated as identity-verified for KYC-gated actions without an associated KYC case in `approved` state. The authoritative KYC state is `KYCCases.status = approved` (`05_API_Contract_Data_Dictionary.md`, KYCCases entity — `KYCCases` is the canonical persisted identifier per `DOCUMENT_INDEX.md` §2A; the conceptual name is `KycCase`). *Vocabulary note: "verified" is used descriptively here and elsewhere in this document for the same condition; it is not a value of `Users.status`, whose enumeration is `pending_verification, active, suspended, closed`.*

### 5.3.2 KYCProfile Aggregate

- **Root:** `KYCProfile`
- **Entities:** `KYCDocument`, `ScreeningResult`
- **Value Objects:** `RiskRating`, `VerificationLevel`
- **Invariants:** A `KYCProfile` cannot move to `approved` while any linked `ScreeningResult` has an unresolved `sanctions_hit`.

### 5.3.3 FXRequest Aggregate

- **Root:** `FXRequest`
- **Value Objects:** `Money` (amount + currency), `RequestedRate`, `RequestWindow`
- **Invariants:** An `FXRequest` can only be created by a `User` with `verified` KYC status.

### 5.3.4 Offer Aggregate

- **Root:** `Offer`
- **Value Objects:** `Money`, `OfferedRate`, `AvailabilityWindow`
- **Invariants:** **HUMAN APPROVED, 2026-08-22.** `original_amount = matched_amount + remaining_amount`, where `matched_amount` is the sum of two **disjoint** sets: allocations that are **active and committed** -- currently valid, non-expired and **not yet completed** -- and allocations that **completed successfully**. No allocation belongs to both, so every allocation is counted **exactly once**, and `remaining_amount` is **derived, not persisted**. The concurrency invariant is scoped to the **contributing** allocations, not to every `Match` row that has ever referenced the Offer: **the sum of allocations that currently contribute to `matched_amount` can never exceed `original_amount`**, enforced under row lock. Summing all historical `Match` records would be wrong, because terminated records are retained as audit history while their capacity has already returned to `remaining_amount` -- a replacement allocation would then push the historical total past `original_amount` while the Offer is in fact correctly allocated. **Contributing** is the predicate defined immediately above: an allocation is contributing when it is *active and committed* (valid, non-expired, not released or otherwise terminated pre-funding, and not yet completed) **or** *successfully completed*. It is stated here semantically because no persistence exists yet; its concrete persisted representation -- the status column or state enum the locking and validation query filters on -- belongs to the later domain-model milestone and is deliberately not fixed here. An expired or pre-funding-released allocation **ceases to contribute** to `matched_amount` and its amount returns to remaining capacity; the terminated allocation record remains immutable audit history.
- **Withdrawal semantics:** withdrawing an Offer's remaining availability **closes it to further matching** and **does not cascade to allocations** — existing Matches, their allocated amounts, Transactions and Settlements are untouched, other allocations are unaffected, and committed capacity is never returned. Only the uncommitted remainder becomes unavailable.
- **Lifecycle:** **CANONICAL ENUM — HUMAN-APPROVED 2026-08-25:** **`open`, `partially_matched`, `fully_matched`, `withdrawn`, `cancelled`, `expired`**. The former binary `active → matched` model is insufficient. A partially matched Offer **remains available for its remaining amount**. **`withdrawn`** — added by that decision — means the owner **intentionally withdrew the still-unmatched remainder**: the Offer is closed to further acceptance and no new `Match` may consume that remainder, while existing `Match`, `Transaction` and `Settlement` records remain valid and untouched. It is **not** `cancelled`, **not** `expired` and **not** `fully_matched`; any previously matched amount **remains part of `matched_amount`** under the contributing/completed allocation rules above. A `withdrawn` Offer is **excluded from `marketplace-active`** listing (`05_API_Contract_Data_Dictionary.md` § marketplace listing). This closes the previously OPEN withdrawal status-model gap. The concrete persisted representation still belongs to the later domain-model milestone.
- **Arithmetic:** exact **integer minor units** with explicit currency exponent/scale; never binary floating point. This is marketplace/allocation arithmetic, distinct from ADR-002 ledger posting representation, which is unchanged and remains authoritative for the ledger conversion boundary.

### 5.3.5 Match Aggregate

- **Root:** `Match` — **the persisted form of the conceptual `MatchAllocation`**: one accepted partial or full allocation of one Offer by one counterparty. **HUMAN APPROVED, 2026-08-22:** extended, **not renamed**; no second `MatchAllocation` entity exists. See the glossary in `DOCUMENT_INDEX.md`.
- **Entities:** none (references `Offer` by ID; **`FXRequest` reference is optional/nullable** — a Match is creatable from Offer + accepting counterparty + accepted amount + trusted server timestamp, with no `FXRequest`)
- **Invariants:** `allocated_amount > 0`; `agreed_rate` is **locked at acceptance** and never silently re-priced; `accepted_at` is a **server-set trusted timestamp** establishing acceptance priority, broken deterministically by a unique server-generated ordering key on equal timestamps (see the acceptance-priority note in the marketplace-semantics section); each Match is an **independent settlement failure domain** — one Match → one Transaction → one Settlement → **exactly two SettlementLegs** (ADR-001, unchanged).
- **Two-window lifecycle:** preparation (beneficiary selection and validation, allocation-specific requirements) → derived gate **`ALLOCATION_FUNDING_READY`** → funding. Both durations are **OPEN / CONFIGURABLE**. Partner provisioning must not become actionable before `ALLOCATION_FUNDING_READY`. See **ADR-001 Amendment A1 §14**.
- **Partner provisioning state is owned by `SettlementLeg`**, not duplicated onto `Match`.
- **Value Objects:** `MatchedAmount`, `AgreedRate`
- **Invariants:** **Corrected 2026-08-24.** A `Match`'s core allocation terms are immutable **from acceptance**. The superseded wording *"immutable once `confirmed`"* keyed immutability to a bilateral confirmation step that no longer exists (`CORRECTIONS_v3.md` §11.11; `POST /v1/matches/{match_id}/confirm` is withdrawn), which left an accepted allocation nominally mutable through preparation and funding. Acceptance alone establishes the allocation, so acceptance is where the terms freeze. The immutable terms are, at minimum: the **Offer reference**, the **accepting party reference**, the **accepted amount**, the **`agreed_rate`**, **`accepted_at`**, and the **server ordering key** once it is implemented. None of these may be mutated during preparation or funding. Corrections are made through an explicit compensating, terminal or replacement record or event under the applicable lifecycle -- never by rewriting the accepted terms. *No new state enum is introduced by this correction, and its persisted representation belongs to the later domain-model milestone.*

### 5.3.6 Transaction Aggregate

- **Root:** `Transaction`
- **Entities:** `TransactionEvent` (append-only)
- **Value Objects:** `Money`, `FeeBreakdown`, `SettlementReference`
- **Invariants:** State transitions must follow the defined state machine (Section 10). No state may be skipped.

## 5.4 Domain Events (Selected)

| Event                      | Emitted By        | Consumed By                       |
|----------------------------|-------------------|-----------------------------------|
| `UserRegistered`           | Identity & Access | Notifications, Compliance         |
| `KYCApproved`              | Compliance        | Marketplace, Notifications        |
| `KYCRejected`              | Compliance        | Notifications, Admin              |
| `OfferCreated`             | Marketplace       | Matching                          |
| `FXRequestCreated`         | Marketplace       | Matching                          |
| `MatchConfirmed` *(**NAME/ROUTING compatibility alias — ACCEPTANCE semantics**; **RECORD-ONLY** for Settlement consumers. See the alias note below this table)* | Matching (emitted at acceptance) | Transaction, Notifications — **record-only**; **never** authorization to provision, dispatch or fund |
| `EscrowFunded`             | Settlement        | Settlement (leg-scoped, carries `leg_id`) |
| `ReleaseAuthorized`        | Settlement        | Banking Abstraction Layer via outbox, Notifications |
| `PayoutConfirmed`          | Settlement        | Settlement (leg-scoped, carries `leg_id`) |
| `PayoutFailed`             | Settlement        | Settlement, Admin, Notifications  |
| `SettlementCompleted`      | Settlement        | Transaction, Notifications        |
| `SettlementUnwound`        | Settlement        | Transaction, Notifications        |
| `RecoveryRequired`         | Settlement        | Admin, Compliance, Notifications  |
| `HoldOpened` / `HoldClosed` | Settlement       | Admin, Compliance                 |
| `ReconciliationMismatchDetected` | Reconciliation | Admin, Compliance               |
| `DisputeOpened`            | Disputes          | Admin, Notifications              |

> **`MatchConfirmed` alias note — aligned with the API contract 2026-08-25.** This table previously
> listed `MatchConfirmed` as an ordinary event consumed by `Transaction`, with no indication that
> its trigger and consumer contract had changed. An implementer reading only this table would apply
> **legacy bilateral-confirmation semantics to an acceptance event** — exactly the failure the API
> contract's alias note exists to prevent. `05_API_Contract_Data_Dictionary.md` §6.1 is
> **authoritative** for this event; this entry is aligned to it and adds nothing new.
>
> - `MatchConfirmed` is a **NAME / ROUTING compatibility alias only.** The name, topic and routing
>   are preserved so existing subscriptions and dispatch tables still resolve. **Semantic backward
>   compatibility is NOT claimed** — the trigger moved from bilateral confirmation to acceptance, so
>   a consumer written against the old meaning is already wrong even though its subscription
>   resolves.
> - It is emitted when the `Match` is **established by acceptance**. **There is no second bilateral
>   confirmation step**, and none may be introduced; no consumer may wait for one.
> - It is **NOT** evidence of confirmation, **NOT** authorization for funding instructions, **NOT**
>   authorization for partner provisioning or dispatch, and **NOT** authoritative funding evidence.
>   A Settlement consumer is **RECORD-ONLY** at this point.
> - **`ALLOCATION_FUNDING_READY` continues to gate partner provisioning** (ADR-001 §14.3). This
>   event neither starts, satisfies nor bypasses that gate. Authoritative `FUNDED` remains
>   established only by authenticated, signature-verified regulated-partner webhook evidence.
>
> **Naming relationship with `Appendix_D`.** `Appendix_D_Financial_Correctness_Settlement_Specification_Xspeeria_v1.1.md`
> §"Order and match" lists **`MatchCreated`**. The two names refer to **the same acceptance-time
> occurrence** — a `Match` coming into existence — described from different documents;
> `MatchCreated` is the name that matches the semantics, `MatchConfirmed` is the emitted
> compatibility alias retained for routing. **This is a naming divergence recorded, not resolved,
> and it is emphatically not a claim of semantic backward compatibility.** **No second event exists
> or may be created**, and the two names must never be implemented as two events.
>
> **The event is NOT renamed here.** Whether `MatchConfirmed` becomes `MatchCreated` remains an
> **OPEN human decision** (`05_API_Contract_Data_Dictionary.md` §6.1, renaming note).

*Updated per ADR-001 (DEC-003). `TransactionFundsReceived` and `SettlementFailed` are superseded: funding is leg-scoped, and failure is a leg fact whose settlement-level consequence depends on outstanding exposure. The canonical event catalogue is `Appendix_D` Section 7.*

# 6. DATABASE DESIGN

## 6.1 Entity Relationship Diagram

    erDiagram
        USERS ||--o| PROFILES : has
        USERS ||--o| KYC_PROFILES : has
        USERS ||--o{ BENEFICIARIES : owns
        MATCHES }o--o{ BENEFICIARIES : "selects per allocation"
        USERS ||--o{ FX_REQUESTS : creates
        USERS ||--o{ OFFERS : creates
        KYC_PROFILES ||--o{ KYC_DOCUMENTS : contains
        KYC_PROFILES ||--o{ SCREENING_RESULTS : contains
        FX_REQUESTS ||--o{ MATCHES : "optional legacy linkage"
        OFFERS ||--o{ MATCHES : "allocated via (0..n)"
        MATCHES ||--|| TRANSACTIONS : produces
        TRANSACTIONS ||--o{ TRANSACTION_EVENTS : logs
        TRANSACTIONS ||--o| SETTLEMENTS : "settled via"
        TRANSACTIONS ||--o| DISPUTES : "may raise"
        DISPUTES ||--o{ DISPUTE_EVIDENCE : contains
        USERS ||--o{ AUDIT_LOGS : "generates (as actor)"

        USERS {
            uuid id PK
            string email
            string phone
            string password_hash
            string status
            timestamp created_at
        }
        PROFILES {
            uuid id PK
            uuid user_id FK
            string full_name
            string country
            jsonb metadata
        }
        KYC_PROFILES {
            uuid id PK
            uuid user_id FK
            string verification_level
            string risk_rating
            string status
            timestamp reviewed_at
        }
        KYC_DOCUMENTS {
            uuid id PK
            uuid kyc_profile_id FK
            string doc_type
            string storage_ref
            string status
        }
        SCREENING_RESULTS {
            uuid id PK
            uuid kyc_profile_id FK
            string screening_type
            boolean is_hit
            jsonb raw_result
        }
        BENEFICIARIES {
            uuid id PK
            uuid user_id FK
            string bank_name
            string account_ref
            string currency
        }
        FX_REQUESTS {
            uuid id PK
            uuid user_id FK
            string direction
            numeric amount
            string currency_from
            string currency_to
            numeric requested_rate
            string status
            timestamp expires_at
        }
        OFFERS {
            uuid id PK
            uuid user_id FK
            numeric amount
            numeric matched_amount
            string currency_from
            string currency_to
            numeric offered_rate
            string status
            timestamp expires_at
        }
        MATCHES {
            uuid id PK
            uuid fx_request_id FK
            uuid offer_id FK
            numeric matched_amount
            numeric agreed_rate
            string status
            timestamp confirmed_at
        }
        TRANSACTIONS {
            uuid id PK
            uuid match_id FK
            string state
            numeric amount
            numeric fee_amount
            string currency
            timestamp created_at
            timestamp updated_at
        }
        TRANSACTION_EVENTS {
            uuid id PK
            uuid transaction_id FK
            string event_type
            jsonb payload
            string actor
            timestamp created_at
        }
        SETTLEMENTS {
            uuid id PK
            uuid transaction_id FK
            string partner_reference
            string status
            timestamp initiated_at
            timestamp completed_at
        }
        DISPUTES {
            uuid id PK
            uuid transaction_id FK
            string opened_by
            string status
            string resolution
            timestamp opened_at
            timestamp closed_at
        }
        DISPUTE_EVIDENCE {
            uuid id PK
            uuid dispute_id FK
            string evidence_type
            string storage_ref
        }
        AUDIT_LOGS {
            uuid id PK
            uuid actor_user_id FK
            string action
            string entity_type
            uuid entity_id
            jsonb before_state
            jsonb after_state
            string correlation_id
            timestamp created_at
        }

## 6.2 Key Table Design Notes

| Table                    | Notes                                                                                                               |
|--------------------------|---------------------------------------------------------------------------------------------------------------------|
| `users`                  | `password_hash` uses Argon2id. `status` enum: `pending`, `active`, `suspended`, `closed`.                           |
| `kyc_profiles`           | **SUMMARY / PROJECTION ONLY — clarified 2026-08-25 by DECISION S4-4 (HUMAN-APPROVED).** The **canonical KYC case persistence and API authority is `KYCCases` (conceptual `KycCase`)**, per `DOCUMENT_INDEX.md` §2A and §5.1 of this document. `kyc_profiles` is **not** a second authoritative KYC workflow and **must not** carry the case lifecycle: it holds derived summary attributes only. `risk_rating` enum: `low`, `medium`, `high`. Drives EDD triggers (see COM). The KYC lifecycle is `pending_documents → under_review → approved \| rejected`, owned by `KYCCases`. Jurisdiction-specific document requirements remain configuration/legal authority driven and are **not** enumerated here |
| `fx_requests` / `offers` | **Monetary columns are integer minor units — `amount_minor BIGINT` + `currency CHAR(3)` + `scale SMALLINT` + `currency_def_version VARCHAR(32)`. CORRECTED 2026-08-25 by DECISION S4-1 (HUMAN-APPROVED).** The former *"All monetary columns are `NUMERIC(20,4)`"* is **withdrawn**: it contradicted both ADR-002 and the API contract, which already specify `amount_minor BIGINT` for `PayoutExecution` and `ledger_lines`. No `FLOAT`/`DOUBLE` permitted anywhere. **Rates are not monetary amounts** and remain `NUMERIC(12,6)` |
| `matches`                | **Immutable once established by acceptance. CORRECTED 2026-08-25.** The former wording *"Immutable after `confirmed`"* is **stale**: bilateral match confirmation is **withdrawn** (`CORRECTIONS_v3.md` §11.11) and **no second confirmation step exists** — acceptance alone establishes the allocation. `allocated_amount`, `agreed_rate`, `accepted_at` and `server_order_key` are immutable from establishment. Corrections are handled via compensating transaction events. Carries `server_order_key BIGINT NOT NULL UNIQUE` per DECISION S4-2 |
| `transactions`           | `status` is a **read-only derived projection** of `settlements.phase`; no API or service writes it directly.        |
| `settlements`            | `phase` constrained via DB-level CHECK mirroring Section 10.4. `release_authorized_at` set-once, enforced by a partial unique index. `BEFORE UPDATE` trigger re-validates each phase gate against live `settlement_legs` rows. |
| `settlement_legs`        | Exactly two rows per settlement (`REQUESTER`, `ACCEPTER`), `UNIQUE(settlement_id, party_role)`. `state` CHECK-constrained per Section 10.2. CHECK: source and destination jurisdictions must be identical. Authoritative for per-leg monetary facts. |
| `settlement_events`      | Append-only; no UPDATE or DELETE permitted at any layer (enforced via DB role permissions). **Root of accepted internal truth** (`docs/adr/002-…`, DEC-004). |
| `webhook_receipts`       | Append-only **evidence only — no financial authority**. Every partner message retained with an explicit verdict. A raw webhook never mutates financial state. |
| `pending_events`         | Quarantine for **valid** evidence awaiting a prerequisite. Every row is promoted to `settlement_events` or escalated to `reconciliation_exceptions` — none expires silently. |
| `accounts`               | Chart of accounts as **configuration**. `book` ∈ {REAL, MEMORANDUM}. MEMORANDUM exists only if **P-7** adopts it and is aggregate by partner/currency, **never per customer**. Chart contents are **P-1 TBD**. |
| `ledger_entries`         | Append-only. `UNIQUE(source_event_id, posting_rule_id)`; `source_event_id NOT NULL` FK; `posting_rule_version` recorded but **not** in the uniqueness key; `entry_hash` over own content with **no prev-pointer**. |
| `ledger_lines`           | Append-only. `amount_minor BIGINT` exact integer minor units — never binary floating point. `currency`, `scale`, `currency_def_version` stored on the line. Balanced per currency per entry. |
| `currency_definitions`   | **Versioned and configurable.** Minor-unit rules can change; historical entries stay interpretable via the version recorded on each line. |
| `settlement_holds`       | Typed (`COMPLIANCE`, `DISPUTE`, `RECONCILIATION`, `DISPATCH_FAILURE`, `RISK`), 0..n concurrent per settlement, `blocks_progression` boolean. Closed, never deleted. |
| `reconciliation_exceptions` | Linked to a settlement and optionally a leg. May reference terminal settlements. Never mutates settlement state.  |
| `outbox`                 | Transactional outbox for partner dispatch. `UNIQUE(settlement_id, leg_id, operation)`; deterministic idempotency key. |
| `webhook_events`         | `UNIQUE(settlement_id, leg_id, event_type, provider_event_id)` — mandatory deduplication key. `leg_id` is required; unresolvable-leg webhooks are rejected. |
| `transaction_events`     | Retained for non-settlement transaction history; append-only, same restrictions as `settlement_events`.             |
| `audit_logs`             | Written to a logically separate, restricted-access schema. Application service accounts have INSERT-only privilege. |

## 6.3 Indexing Strategy

| Table          | Index                                              | Purpose                                             |
|----------------|----------------------------------------------------|-----------------------------------------------------|
| `offers`       | `(currency_from, currency_to, status, expires_at)` | Marketplace listing queries                         |
| `fx_requests`  | `(currency_from, currency_to, status, expires_at)` | **FXRequest listing/lookup. CORRECTED 2026-08-25** — the former purpose *"Matching engine candidate lookup"* is **stale**: there is no automated matcher and there are no matching runs under publish-and-accept. **The index and FXRequest compatibility are retained**, not removed; whether FXRequest is an active MVP flow remains **OPEN (R5-9)** |
| `matches`      | `(offer_id)`, `(fx_request_id)`                    | `(offer_id)` — allocation lookup and aggregate consistency for the acceptance path, the canonical parent. `(fx_request_id)` — **retained for FXRequest compatibility only**; `fx_request_id` is nullable and a Match is creatable without any FXRequest |
| `matches`      | `(server_order_key)` UNIQUE                        | Deterministic acceptance ordering `(accepted_at ASC, server_order_key ASC)`; uniqueness enforced per DECISION S4-2 |
| `settlements`  | `(phase, updated_at)`                              | Operational dashboards, stuck-settlement detection  |
| `settlements`  | Partial index on `phase = 'RECOVERY_REQUIRED'`     | Ageing/escalation queue — must stay operationally visible |
| `settlement_legs` | `(settlement_id, state)`                        | Phase-gate evaluation, single-sided-funding detection |
| `ledger_entries` | `(source_event_id, posting_rule_id)` UNIQUE      | Exactly-once posting per applicable rule            |
| `ledger_lines`  | `(account_id, entry_id)`                          | Account balance recomputation from lines            |
| `pending_events` | `(status, quarantined_at)`                       | Quarantine ageing and escalation sweep              |
| `webhook_receipts` | `(provider_event_id)` UNIQUE                    | Ingress deduplication                               |
| `audit_logs`   | `(entity_type, entity_id, created_at)`             | Audit trail retrieval                               |

## 6.4 Data Retention & Precision Rules

- **All authoritative persisted monetary state — ledger and non-ledger alike — is exact integer minor units. CORRECTED 2026-08-25 by DECISION S4-1 (HUMAN-APPROVED).** Every persisted authoritative monetary amount stores `amount_minor BIGINT` + `currency CHAR(3)` + `scale SMALLINT` + `currency_def_version VARCHAR(32)`, immutably bound together at the moment the amount is established. `ROUND_HALF_EVEN` applies at exactly **one** conversion point, in the application layer, never at the database layer. The former rule — *"All monetary values outside the accounting ledger: `NUMERIC(20,4)`"* — is **withdrawn**: a split representation put a decimal↔minor-unit conversion inside the money path and disagreed with the API contract, which already specifies `amount_minor BIGINT` for `PayoutExecution`.
- **`NUMERIC`/`DECIMAL` is permitted only as an explicitly derived, non-authoritative presentation or reporting value**, where a justified need is recorded. It is never the source of truth and is never read back as truth. Derived decimal columns must not be added for convenience alone.
- **Exchange rates are not monetary amounts.** `desired_rate` and `agreed_rate` remain `NUMERIC(12,6)`; this rule does not apply to them.
- **Accounting-ledger postings** use the same integer-minor-unit representation per `docs/adr/002-financial-event-ledger-architecture.md` §4.4 (DEC-004), so the balanced-entry invariant is provable without rounding ambiguity. Residue posts to a suspense account and is never discarded. *(This is no longer a divergence from a separate non-ledger rule: one representation now governs both.)*
- **No binary floating point is permitted in any authoritative monetary state, anywhere.**
- Timestamps: UTC, `TIMESTAMPTZ` only.
- Soft-deletes are prohibited for financial tables; state is represented via explicit status fields, never row deletion.

# 7. API DESIGN

## 7.1 REST Conventions

| Convention      | Rule                                                                                                              |
|-----------------|-------------------------------------------------------------------------------------------------------------------|
| Base path       | `/api/v1/...`                                                                                                     |
| Versioning      | URI-based (`/v1`, `/v2`); breaking changes require a new version, never an in-place contract change               |
| Resource naming | Plural nouns (`/offers`, `/transactions`)                                                                         |
| Authentication  | Bearer JWT in `Authorization` header                                                                              |
| Pagination      | Cursor-based: `?cursor=<opaque>&limit=<n>`, default `limit=20`, max `limit=100`                                   |
| Filtering       | Query parameters, explicitly allow-listed per endpoint (no arbitrary filter injection)                            |
| Idempotency     | State-changing POSTs (offer creation, **Offer acceptance**, settlement trigger) require an `Idempotency-Key` header. *Corrected 2026-08-24: "match confirmation" is **SUPERSEDED** — that step no longer exists; acceptance is the idempotent money-sensitive operation (§9.4)* |
| Error format    | RFC 7807 Problem Details JSON                                                                                     |

## 7.2 Standard Error Response

    {
      "type": "https://xspeeria.com/errors/insufficient-kyc-level",
      "title": "KYC Level Insufficient",
      "status": 403,
      "detail": "This action requires verification level TIER_2 or higher.",
      "correlation_id": "b3f1c2..."
    }

## 7.3 Representative Endpoints

| Method | Path                                      | Purpose                             | Auth                      |
|--------|-------------------------------------------|-------------------------------------|---------------------------|
| POST   | `/v1/auth/register`                       | Register new user                   | None                      |
| POST   | `/v1/auth/login`                          | Authenticate, issue JWT             | None                      |
| POST   | `/v1/auth/mfa/verify`                     | Verify MFA challenge                | Partial session           |
| POST   | `/v1/kyc/documents`                       | Upload KYC document                 | User                      |
| GET    | `/v1/kyc/status`                          | Get current KYC status              | User                      |
| POST   | `/v1/fx-requests`                         | Create FX request                   | Verified user             |
| POST   | `/v1/offers`                              | Create offer                        | Verified user             |
| GET    | `/v1/offers`                              | List/search offers                  | Verified user             |
| POST   | `/v1/offers/{offer_id}/accept`            | Accept some or all of an Offer's remaining amount, establishing a `Match` | Verified user (KYC-approved, `TRANSACTION_ELIGIBLE`, not the Offer owner) |
| GET    | `/v1/transactions/{id}`                   | Get transaction detail              | Party to transaction      |
| POST   | `/v1/settlements/{settlement_id}/confirm-funds` | User's **advisory** claim that they have sent funds for one `SettlementLeg` (`leg_id` **required**) | Funding party for that leg |
| POST   | `/v1/disputes`                            | Open a dispute                      | Party to transaction      |
| POST   | `/v1/webhooks/settlement/{partner}`       | Inbound partner settlement callback | HMAC-signed, partner-only |

> **`POST /v1/matches/{id}/confirm` is SUPERSEDED / HISTORICAL — corrected 2026-08-24.**
> It was published in this table as an active operation while the rest of the document had
> already withdrawn bilateral confirmation (`CORRECTIONS_v3.md` §11.11; §5.3.5; §7.1
> Idempotency), leaving two incompatible API contracts. **Acceptance alone establishes the
> `Match`**, so the canonical money-sensitive operation is `POST /v1/offers/{offer_id}/accept`
> — the row above, and the endpoint §7.1 already names as requiring `Idempotency-Key`. **No
> replacement confirmation endpoint exists and none may be introduced.** The `MatchConfirmed`
> event name survives **only** as a compatibility alias emitted when the Match is established
> by acceptance (`05_API_Contract_Data_Dictionary.md`, event catalogue); it is not a second
> user- or API-facing confirmation action, and consuming it authorizes nothing partner-facing
> before `ALLOCATION_FUNDING_READY`.
>
> **`POST /v1/transactions/{id}/fund-confirmation` is SUPERSEDED / HISTORICAL — HUMAN
> ARCHITECTURE DECISION, 2026-08-24.** This table published it as an active operation while
> `05_API_Contract_Data_Dictionary.md` §4.3 defined the *same* user action as
> `POST /v1/settlements/{settlement_id}/confirm-funds` with a **required `leg_id`**, a
> different parent resource and a different response shape — two active contracts for one
> action, which is what a client would have had to choose between.
>
> **The settlement contract is canonical.** A funding claim is made against one
> `SettlementLeg` inside a `Settlement`, not against the `Transaction` as a whole: a
> Transaction spans **both** legs, so a Transaction-parented endpoint cannot say *which* side
> the claim is about without smuggling `leg_id` in anyway. `Transaction.status` is a
> read-only presentation projection under ADR-001 (DEC-003) and owns no settlement state, so
> parenting a settlement-affecting claim on it would invert the ownership the ADR
> establishes. The ratified response semantics are unchanged: `leg_id`, `leg_state`,
> `user_claim_recorded_at`.
>
> **Customer confirmation is an advisory claim and nothing more.** It records that a user
> *says* they sent funds. It does **not** establish authoritative `FUNDED`, does **not**
> authorize settlement release, does **not** start, satisfy or bypass
> `ALLOCATION_FUNDING_READY`, and does **not** substitute for regulated-partner verification.
> It does not mutate `SettlementLeg.state` and does not advance `Settlement.phase`.
>
> **Authoritative `FUNDED` is established only by the authenticated, signature-verified
> regulated-partner webhook**, when that integration exists (ADR-001 F-6, F-7;
> `07_Banking_Integration_Specification_v1.1.md`). A client asserting "I paid" never
> establishes a money fact. The claim is retained for support and dispute evidence and may
> drive UI messaging; it carries no financial authority.

## 7.4 Pagination Response Shape

    {
      "data": [ /* items */ ],
      "pagination": {
        "next_cursor": "eyJpZCI6ID...",
        "has_more": true,
        "limit": 20
      }
    }

## 7.5 Rate Limiting Tiers

| Tier                     | Scope             | Limit       |
|--------------------------|-------------------|-------------|
| Unauthenticated          | Per IP            | 20 req/min  |
| Authenticated (standard) | Per user          | 120 req/min |
| Settlement webhooks      | Per partner key   | 300 req/min |
| Admin endpoints          | Per admin session | 60 req/min  |

# 8. SEQUENCE DIAGRAMS

## 8.1 Sign Up

    sequenceDiagram
        actor U as User
        participant M as Mobile App
        participant API as API Gateway
        participant Auth as Auth Module
        participant DB as PostgreSQL
        participant Notif as Notification Module

        U->>M: Enter email, phone, password
        M->>API: POST /v1/auth/register
        API->>Auth: validate & create user
        Auth->>DB: INSERT users (status=pending)
        Auth->>Notif: emit UserRegistered
        Notif-->>U: send verification email/SMS
        Auth-->>M: 201 Created + verification instructions

## 8.2 Login (with MFA)

    sequenceDiagram
        actor U as User
        participant M as Mobile App
        participant Auth as Auth Module
        participant DB as PostgreSQL

        U->>M: Enter credentials
        M->>Auth: POST /v1/auth/login
        Auth->>DB: verify password hash
        alt credentials valid
            Auth-->>M: 200 partial_session_token (MFA required)
            U->>M: Enter MFA code
            M->>Auth: POST /v1/auth/mfa/verify
            Auth->>DB: validate MFA code
            Auth-->>M: 200 access_token + refresh_token
        else invalid
            Auth-->>M: 401 Unauthorized
        end

## 8.3 KYC Verification

    sequenceDiagram
        actor U as User
        participant M as Mobile App
        participant KYC as KYC Module
        participant Prov as KYC/Liveness Provider
        participant Sanc as Sanctions Screening
        participant DB as PostgreSQL
        participant Admin as Back-Office

        U->>M: Upload ID + liveness selfie
        M->>KYC: POST /v1/kyc/documents
        KYC->>DB: store document reference
        KYC->>Prov: submit for verification
        Prov-->>KYC: verification result
        KYC->>Sanc: run sanctions/PEP screen
        Sanc-->>KYC: screening result
        alt clean result, high confidence
            KYC->>DB: update kyc_profiles status=approved
            KYC-->>M: KYC approved
        else hit or low confidence
            KYC->>DB: status=manual_review
            KYC->>Admin: queue for manual review
            Admin->>KYC: decision (approve/reject)
            KYC->>DB: update status
            KYC-->>M: status update
        end

## 8.4 Offer Creation

    sequenceDiagram
        actor U as User
        participant M as Mobile App
        participant Mkt as Marketplace Module
        participant DB as PostgreSQL
        participant Match as Matching Engine

        U->>M: Define offer (amount, rate, direction)
        M->>Mkt: POST /v1/offers
        Mkt->>Mkt: verify KYC status = verified
        Mkt->>DB: INSERT offers (status=active)
        Mkt->>Match: emit OfferCreated
        Mkt-->>M: 201 Created

## 8.5 Matching

    sequenceDiagram
        participant Trig as OfferCreated / FXRequestCreated Event
        participant Match as Matching Engine
        participant Redis as Redis (Distributed Lock)
        participant DB as PostgreSQL
        participant Notif as Notification Module

        Trig->>Match: new candidate available
        Match->>Redis: acquire lock (offer_id / request_id)
        Match->>DB: query compatible counter-candidates
        Match->>Match: apply matching rules (rate, amount, expiry)
        alt match found
            Match->>DB: INSERT matches (status=proposed)
            Match->>Redis: release lock
            Match->>Notif: emit MatchProposed
            Notif-->>Match: notify both parties
        else no match
            Match->>Redis: release lock
        end

## 8.6 Settlement

    sequenceDiagram
        participant Txn as Transaction Module
        participant Celery as Celery Worker
        participant Settle as Settlement Module
        participant BankNG as NG Banking Partner
        participant BankUS as US Banking Partner
        participant DB as PostgreSQL
        participant Notif as Notification Module

        Txn->>Celery: enqueue settlement task (funds confirmed)
        Celery->>Settle: create_settlement(transaction_id)
        Settle->>DB: INSERT settlements (phase=INITIALIZING) + 2 settlement_legs
        BankA-->>Settle: webhook: escrow provisioned (leg_id)
        BankB-->>Settle: webhook: escrow provisioned (leg_id)
        Settle->>DB: phase=AWAITING_FUNDING
        BankA-->>Settle: webhook: escrow funded (leg_id=REQUESTER)
        Settle->>DB: leg REQUESTER = FUNDED (release still blocked)
        BankB-->>Settle: webhook: escrow funded (leg_id=ACCEPTER)
        Settle->>DB: leg ACCEPTER = FUNDED
        Settle->>DB: BEGIN; FOR UPDATE settlement + both legs
        Settle->>DB: assert both FUNDED + beneficiaries validated + no blocking hold
        Settle->>DB: set release_authorized_at; phase=RELEASING; outbox x2; COMMIT
        Settle->>BankA: release (leg_id, deterministic idempotency key)
        Settle->>BankB: release (leg_id, deterministic idempotency key)
        BankA-->>Settle: webhook: payout confirmed (leg_id)
        Settle->>DB: leg = PAID_OUT (phase unchanged - one leg only)
        BankB-->>Settle: webhook: payout confirmed (leg_id)
        Settle->>DB: leg = PAID_OUT; both PAID_OUT so phase=COMPLETED
        Settle->>Txn: emit SettlementCompleted
        Txn->>Notif: notify both parties

## 8.7 Webhook Processing

    sequenceDiagram
        participant Partner as Banking Partner
        participant API as Webhook Endpoint
        participant Verify as Signature Verifier
        participant Celery as Celery Worker
        participant Settle as Settlement Module

        Partner->>API: POST /v1/webhooks/settlement/{partner}
        API->>Verify: verify HMAC signature
        alt signature valid
            API->>Celery: enqueue process_webhook(payload)
            API-->>Partner: 200 OK (ack)
            Celery->>Settle: apply settlement update (idempotent)
        else invalid signature
            API-->>Partner: 401 Unauthorized
        end

## 8.8 Notifications (Fan-out)

    sequenceDiagram
        participant Domain as Domain Event Bus
        participant Notif as Notification Module
        participant Celery as Celery Worker
        participant Push as Push Provider
        participant SMS as SMS Provider
        participant Email as Email Provider

        Domain->>Notif: emit event (e.g. SettlementCompleted)
        Notif->>Celery: enqueue notification task
        Celery->>Push: send push notification
        Celery->>SMS: send SMS (if configured)
        Celery->>Email: send email receipt

## 8.9 Disputes

    sequenceDiagram
        actor U as User (Complainant)
        participant M as Mobile App
        participant Disp as Disputes Module
        participant DB as PostgreSQL
        participant Admin as Back-Office / Ops

        U->>M: Open dispute on transaction
        M->>Disp: POST /v1/disputes
        Disp->>DB: INSERT disputes (status=open)
        Disp->>Admin: queue for review
        Admin->>Disp: request evidence
        U->>Disp: upload evidence
        Disp->>DB: INSERT dispute_evidence
        Admin->>Disp: render resolution
        Disp->>DB: UPDATE disputes status=resolved
        Disp-->>U: notify resolution

# 9. MATCHING ENGINE

> **SECTION-WIDE SUPERSESSION — HUMAN DECISION, 2026-08-22; propagated 2026-08-24.** The
> canonical marketplace behaviour is **PUBLISH AND ACCEPT** (§9.2). Nothing in this section
> authorises automated Match creation, best-rate allocation priority, price-time allocation
> priority or order-book semantics. The section name and the material below are **retained as
> historical/superseded design**, not as implementable guidance. §9.3 concurrency protection is
> the exception: it is **RETAINED AND APPLICABLE**, and now guards concurrent acceptances of a
> single Offer.

## 9.1 Matching Modes — **SUPERSEDED**

> The modes below describe **automated** matching of an `Offer` against an `FXRequest`, which is
> withdrawn. The **partial-overlap concept survives** as partial acceptance of an Offer's
> remaining amount; the `MVP Status` column is historical and must not be read as current scope.

| Mode              | Description                                                                      | MVP Status                               |
|-------------------|----------------------------------------------------------------------------------|------------------------------------------|
| Exact Match       | An `Offer` and `FXRequest` with equal amount and mutually acceptable rate        | In scope                                 |
| Partial Match     | An `Offer` fulfills part of an `FXRequest` (or vice versa); remainder stays open | In scope                                 |
| Multi-Offer Match | An `FXRequest` is fulfilled by aggregating multiple smaller `Offers`             | Phase 2 (flagged as future scope in BRS) |

## 9.2 Matching Algorithm (Exact/Partial)

> **SUPERSEDED — HUMAN DECISION, 2026-08-22. The canonical marketplace behaviour is PUBLISH AND
> ACCEPT.** A seller publishes an Offer; an eligible counterparty accepts some or all of the
> currently available remainder, creating one `Match` (conceptual `MatchAllocation`).
>
> The following are **withdrawn** and must not be implemented:
>
> - **automated Match creation** from Offer + FXRequest events;
> - **price-time allocation priority** — the "Oldest first (price-time priority)" sort below;
> - **best-rate allocation priority** among several users accepting the same Offer;
> - **central-limit-order-book semantics** of any kind.
>
> Acceptance priority within one Offer is **first eligible acceptance by trusted server
> timestamp** (`Match.accepted_at`, server-set; a client-supplied timestamp is never trusted).
>
> **Tie-break — deterministic, added 2026-08-24.** `accepted_at` alone is not a total order: two
> acceptances serialized in the same instant can carry the same value at stored precision, and
> an undefined winner is not auditable. Equal timestamps are resolved by a **unique
> server-generated ordering key** assigned inside the same acceptance serialization boundary
> that enforces `Σ valid allocations ≤ original_amount`, giving the total order
> `(accepted_at ASC, server_order_key ASC)`. The key is server-authoritative and unique; a
> client-supplied value never participates. The resulting order is stable and replayable, so an
> audit or dispute re-derives the same sequence from persisted state. **The ordering contract is
> **`server_order_key` is a REQUIRED, immutable property of an accepted `Match` -- human decision
> 2026-08-24.** Server-generated, unique within the acceptance ordering scope, assigned inside
> the acceptance serialization boundary, never client-supplied, and part of the accepted-allocation
> audit contract. **Durable persistence of it is REQUIRED of the future persistence
> implementation** -- not optional and not aspirational -- while the exact storage mechanism
> stays implementation-dependent. Phase 1 does not implement that persistence yet, so it is a
> **required dependency of the later domain-model/persistence milestone**. The seller's rate does not
> become a priority mechanism and discovery/ranking does not become allocation priority — both
> remain excluded above. The **persistence mechanism for `server_order_key` is
> implementation-dependent** and is not fixed here; a monotonic sequence or a time-sortable
> identifier allocated under the same lock are non-normative examples.
>
> **Marketplace discovery and ranking remain separate and permitted** — listings may be ordered by
> rate, amount, corridor, availability or time. Ranking a listing is not allocating it.
>
> **What survives from the flow below:** the partial-overlap concept, and all of §9.3 concurrency
> protection, which applies unchanged to concurrent acceptances of one Offer. The diagram is
> retained as superseded history.


    flowchart TD
        Start["New Offer or FXRequest event"] --> Lock["Acquire Redis lock on candidate ID"]
        Lock --> Query["Query counter-side candidates:\nsame currency pair, compatible rate,\nstatus=active, not expired"]
        Query --> Sort["Sort candidates by:\n1. Best rate for requester\n2. Oldest first (price-time priority)"]
        Sort --> Loop{"Candidates remaining?"}
        Loop -- No --> NoMatch["No match found — remains listed"]
        Loop -- Yes --> Check["Check amount overlap"]
        Check --> Amount{"Full or partial overlap?"}
        Amount -- Full --> CreateFull["Create Match: full amount\nMark both sides status=matched"]
        Amount -- Partial --> CreatePartial["Create Match: partial amount\nReduce remaining amount on larger side"]
        CreateFull --> Release["Release lock"]
        CreatePartial --> Release
        Release --> Propose["Emit MatchProposed event"]
        NoMatch --> ReleaseEnd["Release lock"]

## 9.3 Concurrency Protection

> **RETAINED AND APPLICABLE — HUMAN APPROVED.** These controls now guard **concurrent acceptances
> of a single Offer**. The invariant they must enforce is that the **sum of valid allocation
> amounts never exceeds the Offer's original amount**. Locking is scoped to the Offer's amount
> fields; **whole-Offer "lock after first Match" semantics are withdrawn**, because a partially
> matched Offer remains available for its remaining amount.


- **Distributed locking:** **Corrected 2026-08-24 — `offer_id` is the mandatory serialization
  key for acceptance.** Redis-based locks (e.g., Redlock pattern) scoped to the `offer_id` whose
  capacity is being consumed. The former `offer_id`/`fx_request_id` alternative is **withdrawn**:
  it belonged to the automated-matching model, and an acceptance must never serialize on the
  demand side. **Reworded 2026-08-25:** the lock exists to prevent **two concurrent acceptances of
  the same Offer** from double-allocating the same capacity. The former phrasing — *"two concurrent
  matching runs"* — carried the withdrawn background-matcher framing into a bullet that is still
  normative; there are no matching runs under publish-and-accept, only client-initiated
  acceptances. The mechanism and its scope (`offer_id`) are unchanged.
- **Database-level guard:** `matched_amount` updates on `offers` use `SELECT ... FOR UPDATE` row
  locking within a single DB transaction as a second line of defense against race conditions.
  **The `fx_requests` capacity-update path is withdrawn as an acceptance authority** (2026-08-24):
  the authoritative capacity being consumed is the Offer's, and an acceptance without an
  `FXRequest` must satisfy the same Offer-level invariant. *A row lock here is not the withdrawn
  product concept of locking the whole Offer lifecycle after its first Match — the Offer remains
  open for later partial acceptances*, independent of the Redis lock.
- **Optimistic concurrency:** Each `offers`/`fx_requests` row carries a `version` column; updates include a `WHERE version = :expected_version` clause, rejecting stale writes.

## 9.4 Idempotency

> **SUPERSEDED — obsolete automated-matcher language, marked 2026-08-25.** The two bullets that
> opened this section are retained for historical context only and are **no longer normative**:
>
> - ~~Every matching run is triggered by a domain event carrying a unique `event_id`.~~
> - ~~The Matching Engine records processed `event_id`s in a short-TTL idempotency table/cache;
>   duplicate event delivery (e.g., from at-least-once queue semantics) is a no-op.~~
>
> They belong to the **withdrawn automated-matching model** (§5.5, *SUPERSEDED — HUMAN DECISION,
> 2026-08-22*). The canonical matching model is **publish-and-accept**: matching is driven by the
> buyer's **explicit Offer acceptance request**, not by a background run over a candidate index.
> Within an Offer, priority is **first eligible acceptance by trusted server ordering**
> `(accepted_at ASC, server_order_key ASC)`.
>
> **The short-TTL cache is NOT the acceptance idempotency boundary and must never be presented as
> one.** Acceptance idempotency is the **atomic logical persistence boundary** defined in the
> bullets below, which commits the idempotency record together with `Match` creation and the Offer
> capacity mutation. A TTL cache satisfies none of that.
>
> **Not reintroduced:** automated candidate matching, price-time priority, CLOB semantics, or
> background matching runs. Where a generic event consumer still needs de-duplication (for
> at-least-once queue delivery), that is ordinary **event-consumer deduplication** and carries no
> money-path authority.
>
> *Whether `FXRequest` creation remains an active MVP flow is a **separate OPEN human decision**
> (R5-9) and is not resolved here.*
- **Corrected 2026-08-24 — idempotency belongs to Offer acceptance.** The former wording keyed
  idempotency to *"match confirmation endpoints"*, a step withdrawn with bilateral confirmation
  (`CORRECTIONS_v3.md` §11.11); that wording is **SUPERSEDED**. The money-sensitive idempotent
  operation is **`POST /v1/offers/{offer_id}/accept`**, which already requires the header
  (`05_API_Contract_Data_Dictionary.md`). Its semantics: an `Idempotency-Key` is **required**;
  the same authenticated principal replaying the same logical acceptance with the same key
  **must not create a second `Match`**, and after successful processing the replay returns or
  references the original `Match` per the API contract; reusing a key with a materially
  different acceptance payload **fails deterministically** (`SYS_409_IDEMPOTENCY_KEY_REUSED`,
  whose canonical meaning is a **bound-key conflict** — see the shared note below);
  and **a retry must never consume Offer capacity twice**, which the acceptance serialization
  boundary in §9.2 already governs. No storage implementation is specified here.
- **Atomic idempotency boundary for Offer acceptance — added 2026-08-25.** The bullet above
  states *outcomes*; it does not say what holds under **simultaneous** retries, and §9.2 does not
  close that gap. **Offer-row serialization orders concurrent requests; it does not deduplicate
  them by key.** Two concurrent requests carrying the same `Idempotency-Key` and the same bound
  logical acceptance can each be serialized correctly on the Offer capacity row, each observe no
  prior idempotency record, and each create a `Match` — satisfying every sentence written above
  and in §9.2 while producing exactly the duplicate they forbid, and consuming capacity twice.
  Deduplication that commits **separately** from the Match insert does not prevent this; it only
  narrows the window. The `confirm-funds` boundary below already states this invariant for the
  *advisory* endpoint, and the *authoritative, money-sensitive* one must not be weaker.

  **The invariant.** For `POST /v1/offers/{offer_id}/accept`, all of the following MUST occur
  inside **one atomic logical persistence boundary**, committing as a unit or not at all:

  1. authoritative Offer-capacity serialization;
  2. `Idempotency-Key` **binding resolution and lookup**;
  3. **replay / conflict decision** — see the ordering rule below. A hit on the same bound logical
     request **replays the original result and stops here**; a hit with a materially different
     binding **fails with `SYS_409_IDEMPOTENCY_KEY_REUSED` and stops here**; a miss continues as a
     **new** request;
  4. authoritative `remaining_amount` read *(new requests only)*;
  5. `accepted_amount` validation *(new requests only)* — **required**, `> 0`, `≤` authoritative
     remaining capacity, else `RES_409_INSUFFICIENT_REMAINING`;
  6. establishment of the original idempotency record;
  7. `accepted_at` assignment (**server-set trusted timestamp**);
  8. `server_order_key` assignment;
  9. `Match` establishment;
  10. Offer capacity / allocation-state update;
  11. binding of the response to the idempotency result;
  12. commit.

  **Ordering rule — key resolution precedes capacity validation. Corrected 2026-08-25.** An
  earlier revision of this list validated `accepted_amount` against authoritative remaining
  capacity **before** resolving the `Idempotency-Key`, which contradicted the replay guarantee
  stated below in this same section. The failure was concrete: once the first acceptance has
  consumed capacity, a **legitimate retry of that already-completed request** would be measured
  against the *now-reduced* remaining amount and rejected with `RES_409_INSUFFICIENT_REMAINING`,
  instead of replaying the original `Match` — the request's **own** allocation making its retry
  look impossible. A conflicting reuse could likewise be misclassified as a capacity failure
  before `SYS_409_IDEMPOTENCY_KEY_REUSED` was ever reached.

  **Serialization still comes first (step 1).** Resolving the key inside the Offer-capacity
  serialization boundary is what makes the replay/conflict decision race-free; moving the lookup
  earlier in the *step order* does not move it outside the boundary.

  **Capacity is validated only for a new request.** Steps 4-5 run **only** when step 3 found no
  prior record. This is not a relaxation:

  | Case | Behaviour |
  |---|---|
  | **Retry of a completed same bound request** | **Replays** the original `Match`, response, `accepted_at` and `server_order_key`. Capacity is **not** re-validated — it was already validated and consumed once, by this very request |
  | **New request / new key** | Validated against the **authoritative current** `remaining_amount` read inside the boundary. A client-displayed value is advisory and may be stale |
  | **Same key, materially different binding** | `SYS_409_IDEMPOTENCY_KEY_REUSED` — never served the first request's response |

  **The invariants are unchanged: no duplicate `Match`, and no duplicate capacity consumption.**
  A replay creates nothing and consumes nothing; a new request consumes capacity exactly once
  under serialization. Rejection of a genuinely oversized new request is **unchanged** —
  `RES_409_INSUFFICIENT_REMAINING`, **never** silently reduced, resized, clamped or partially
  filled.

  **Key binding.** The key is scoped to `(authenticated principal, offer_id, the logical
  acceptance operation, accepted_amount, the materially relevant request parameters)`. A
  client-supplied ordering value never participates.

  **Same key, same bound request — concurrent or retried.** Of two or more such requests,
  **exactly one** logical acceptance wins: **exactly one `Match`** is established, Offer capacity
  is consumed **exactly once**, and the original idempotency record is written once. Every other
  concurrent request and every later retry **observes or replays that original result** — the
  original `Match`, the original response, the original `accepted_at` and `server_order_key`.
  **No second `Match`. No second capacity consumption.**

  **Same key, materially different binding.** Rejected deterministically with
  `SYS_409_IDEMPOTENCY_KEY_REUSED` — the existing §4.4 catalogue entry, whose canonical meaning is
  a **bound-key conflict** — concurrently or otherwise. **No new error identifier is introduced.**

  **Different keys racing for the same Offer capacity.** Out of scope for idempotency: the
  existing acceptance serialization and authoritative `remaining_amount` rules (§9.2) decide the
  outcome unchanged, `Σ valid allocations ≤ original_amount` holds, and a losing request is
  **rejected** with `RES_409_INSUFFICIENT_REMAINING` — **never** silently reduced, resized,
  clamped or partially filled. Priority remains `(accepted_at ASC, server_order_key ASC)`.

  **No mechanism is chosen here** — no lock strategy, uniqueness constraint, isolation level,
  advisory lock, storage engine, cache technology or ORM. Any mechanism meeting the invariant is
  conformant, and the choice belongs to the persistence milestone. `server_order_key` durable
  persistence remains a **REQUIRED** dependency of that milestone.

  **Concurrency regression tests are REQUIRED at the persistence milestone** — three cases:
  (a) **same-key concurrent acceptance** — N simultaneous same-key requests yield exactly one
  `Match`, exactly one capacity consumption and N identical responses; (b) **different-key race**
  — concurrent acceptances under different keys preserve the capacity invariant, with losers
  rejected rather than clamped; (c) **same key, conflicting binding** — deterministic
  `SYS_409_IDEMPOTENCY_KEY_REUSED`. These are **not** written now: this PR carries no domain,
  persistence or runtime idempotency implementation, so such tests would assert nothing while
  appearing to cover the case.
- **`POST /v1/settlements/{settlement_id}/confirm-funds` — key scope stated, added 2026-08-24.**
  The endpoint already requires the header, and §1.4 of `05_API_Contract_Data_Dictionary.md`
  already retains the key-to-response mapping for **24 hours** and returns the original response
  without reprocessing. What was missing is the **binding**: an `Idempotency-Key` with no stated
  scope leaves each client to guess its own safe replay boundary. The key is scoped to
  `(authenticated principal, settlement_id, leg_id, the logical confirm-funds operation, the
  materially relevant request parameters)`, and may safely replay **only that same logical
  request**. Inside the window, the same principal replaying that request with the same key
  **must not create a second advisory claim record** and **must not reprocess**: the original
  response is returned, carrying the original **`user_claim_recorded_at`** with `leg_id` and
  `leg_state` semantics unchanged. Reusing the key with a materially different `settlement_id`,
  `leg_id`, principal, payload or logical operation **fails deterministically**
  (`SYS_409_IDEMPOTENCY_KEY_REUSED`, the existing §4.4 entry — **no new identifier**). This is
  the same boundary already stated for acceptance above and **grants the endpoint nothing**: the
  claim remains **advisory**, never establishing authoritative `FUNDED`, never mutating
  `SettlementLeg.state` or advancing `Settlement.phase`, never authorizing release, and never
  starting, satisfying or bypassing `ALLOCATION_FUNDING_READY`. Authoritative `FUNDED` stays
  regulated-partner-webhook driven (§7.3). No storage implementation is specified here.
- **`confirm-funds` processing order — mirrored from the API contract 2026-08-25.** The canonical
  order for `POST /v1/settlements/{settlement_id}/confirm-funds` is **resource binding validation
  → authorization → idempotency evaluation → advisory claim operation**, and each stage is
  fail-closed:
  1. **Resource binding** — `SettlementLeg.leg_id` equals the supplied `leg_id` **AND**
     `SettlementLeg.settlement_id` equals `{settlement_id}`. If not, `RES_404_NOT_FOUND` and
     **STOP** — no idempotency lookup, no idempotency record write, no authorization, no claim.
  2. **Authorization** — the caller must be the funding party for that leg, else
     `AUTH_403_FORBIDDEN`. This runs **before** any idempotency evaluation, so an unauthorized
     caller never learns from a `409` whether a key exists or what it is bound to.
  3. **Idempotency evaluation** — a reused key with a materially different canonical binding
     returns `SYS_409_IDEMPOTENCY_KEY_REUSED`; the same bound logical request replays the original
     response and `user_claim_recorded_at`.
  4. **Advisory claim operation** — inside the atomic boundary described below.

  This states an **order**, not a new rule: no identifier is introduced, the canonical idempotency
  tuple `(authenticated principal, settlement_id, leg_id, the logical confirm-funds operation, the
  materially relevant request parameters)` is unchanged, and the claim remains **advisory only**.
  `05_API_Contract_Data_Dictionary.md` §3.6 is authoritative and carries the same order.
- **Atomic idempotency boundary for `confirm-funds` — added 2026-08-24.** The bullet above
  states an *outcome*; it does not by itself say what holds under simultaneous retries. Two
  concurrent same-key requests could each observe no prior record and each create an advisory
  claim, satisfying every sentence written there while producing the duplicate it forbids. The
  invariant: **recording the scoped idempotency record and establishing or recognising the
  advisory claim MUST occur inside one atomic logical persistence boundary.** Of two or more
  concurrent requests carrying the same key and the same bound logical request, **exactly one**
  establishes the original idempotency record and advisory claim; every other concurrent request
  and every later retry **observes or replays that original result** — no duplicate advisory
  claim, the original response, the original `user_claim_recorded_at`. A conflicting binding on
  the same key is rejected deterministically with `SYS_409_IDEMPOTENCY_KEY_REUSED`, concurrently
  or otherwise. **No mechanism is chosen here** -- no lock strategy, uniqueness constraint,
  storage engine, cache technology or isolation level; any mechanism meeting the invariant is
  conformant, and the choice belongs to the persistence milestone. **A concurrent same-key
  regression test is REQUIRED at that milestone** (N simultaneous same-key requests, exactly one
  claim record, N identical responses). It is **not** written now: this PR carries no runtime
  idempotency or persistence implementation, so a test here would assert nothing while appearing
  to cover the case.
- **`SYS_409_IDEMPOTENCY_KEY_REUSED` means a bound-key conflict — one meaning, both documents,
  added 2026-08-24.** The §4.4 catalogue previously defined it as a key *"reused with a different
  request body"*, which is narrower than the bindings the two bullets above actually declare: an
  authenticated principal arrives in the bearer token and a `settlement_id` is a path parameter,
  so neither is a request body, yet a mismatch in either is precisely the conflict this code
  exists to reject. Its canonical meaning across both authority documents is therefore a material
  difference in **any bound component** — authenticated principal, resource identifier,
  `settlement_id`, `leg_id`, the logical operation, or materially relevant request
  parameters/payload. Each endpoint's contract states its own binding. Rejection is
  **deterministic**, and the first request's response is **never** served to a conflicting one.
  **One identifier covers every bound-key conflict on every idempotent endpoint; no new error
  code is introduced. **Catalogue totals recounted 2026-08-25: 45 enumerated / 43 active / 2 superseded** (`05_API_Contract_Data_Dictionary.md` §4.4).**

## 9.5 Matching Rules Table

| Rule                  | Description                                                                                                                       |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| Rate compatibility    | `Offer.offered_rate` must be within the `FXRequest.requested_rate` tolerance band (configurable, e.g., ±0.5%)                     |
| Currency pair         | Must match exactly (e.g., NGN→GBP offers only match NGN→GBP requests; NGN→USD supported from Year 2 per the 5-Year Business Plan) |
| Expiry                | Expired offers/requests are excluded from candidate queries and swept by a scheduled Celery Beat job                              |
| KYC gate              | Both parties must hold `verified` KYC status at match time (re-checked, not just at creation time)                                |
| Self-match prevention | A user cannot match against their own offer/request                                                                               |

# 10. TRANSACTION STATE MACHINE

> **RECONCILED — ADR-001 (DEC-003), 2026-08-18.** This section previously defined a 13-state `PascalCase` transaction state machine. It has been superseded by the canonical model in `docs/adr/001-transaction-state-machine.md` and `Appendix_D` Section 5.1. The earlier model assumed a **singular sender** (`AwaitingFunds → FundsReceived` on *"Sender confirms + partner verifies"*), which cannot represent the dual-escrow funding asymmetry that gates release, and it permitted `AwaitingFunds → Cancelled` on funding timeout, which would strand an already-funded party's money.

## 10.1 Model Structure

Financial facts and workflow state are separate concerns:

| Layer | Entity | Authority |
|---|---|---|
| Per-leg financial facts | `SettlementLeg.state` — 9 states | **Authoritative.** Money facts settable only by signature-verified partner webhook |
| Workflow decisions | `Settlement.phase` — 10 phases, forward-only | Xspeeria's own decisions; contains no funding or payout vocabulary |
| Customer-facing status | `Transaction.status` | **Derived, read-only projection.** Never written directly |
| Holds, disputes, reconciliation | `SettlementHold`, `Dispute`, `ReconciliationException` | Separate entities; never mutate settlement state |

Legs are identified by semantic party role (`REQUESTER`, `ACCEPTER`) plus an immutable UUID `leg_id`. Currency and jurisdiction are leg attributes, so the model is corridor- and direction-agnostic.

## 10.2 Leg State Diagram

    stateDiagram-v2
        [*] --> PENDING: Settlement created
        PENDING --> ESCROW_PROVISIONED: Partner provisions escrow
        PENDING --> PROVISION_FAILED: Provisioning failed
        ESCROW_PROVISIONED --> FUNDED: Partner webhook confirms escrow funded
        FUNDED --> RELEASE_SENT: Release dispatched and acknowledged
        FUNDED --> RETURN_SENT: Unwind initiated
        RELEASE_SENT --> PAID_OUT: Partner webhook confirms payout
        RELEASE_SENT --> PAYOUT_FAILED: Partner reports payout failure
        PAYOUT_FAILED --> RELEASE_SENT: Retry with corrected beneficiary
        PAYOUT_FAILED --> RETURN_SENT: Return escrow instead
        RETURN_SENT --> RETURNED: Partner webhook confirms return
        PAID_OUT --> [*]
        RETURNED --> [*]
        PROVISION_FAILED --> [*]

`PAID_OUT` has zero outbound transitions. Once a partner has paid a beneficiary domestically, Xspeeria — holding no funds and having no cross-border reach — cannot reverse it.

## 10.3 Settlement Phase Diagram

    stateDiagram-v2
        [*] --> INITIALIZING: Match confirmed
        INITIALIZING --> AWAITING_FUNDING: Both legs ESCROW_PROVISIONED
        INITIALIZING --> CANCELLED: Provisioning failed / cancelled, zero legs FUNDED
        AWAITING_FUNDING --> RELEASING: Both legs FUNDED + beneficiaries validated
        AWAITING_FUNDING --> UNWINDING: Window expired, >=1 leg FUNDED
        AWAITING_FUNDING --> CANCELLED: Window expired, zero legs FUNDED
        RELEASING --> COMPLETED: Both legs PAID_OUT
        RELEASING --> UNWINDING: Payout failed, zero legs PAID_OUT
        RELEASING --> RECOVERY_REQUIRED: >=1 PAID_OUT and >=1 permanently failed
        UNWINDING --> CLOSED_UNWOUND: All funded legs RETURNED
        UNWINDING --> RECOVERY_REQUIRED: Return permanently failed
        RECOVERY_REQUIRED --> CLOSED_RECOVERED: Exposure resolved, no loss
        RECOVERY_REQUIRED --> CLOSED_WITH_LOSS: Loss recognized, case closed
        COMPLETED --> [*]
        CLOSED_UNWOUND --> [*]
        CLOSED_RECOVERED --> [*]
        CLOSED_WITH_LOSS --> [*]
        CANCELLED --> [*]

## 10.4 Phase Transition Table

Gates are evaluated under `SELECT ... FOR UPDATE` on the settlement and both legs, in fixed ID order, with leg state re-read inside the lock.

| #  | From              | To                 | Gate                                                                                     | Actor       |
|----|-------------------|--------------------|------------------------------------------------------------------------------------------|-------------|
| 1  | —                 | INITIALIZING       | Match confirmed by both parties                                                          | System      |
| 2  | INITIALIZING      | AWAITING_FUNDING   | Both legs `ESCROW_PROVISIONED`                                                           | System      |
| 3  | INITIALIZING      | CANCELLED          | Leg `PROVISION_FAILED` or party cancels — and zero legs `FUNDED`                          | System/User |
| 4  | AWAITING_FUNDING  | RELEASING          | Both legs `FUNDED` ∧ both beneficiaries validated ∧ no blocking hold ∧ not yet authorized | System      |
| 5  | AWAITING_FUNDING  | UNWINDING          | Funding window expired ∧ ≥1 leg `FUNDED`                                                 | System      |
| 6  | AWAITING_FUNDING  | CANCELLED          | Funding window expired ∧ zero legs `FUNDED`                                              | System      |
| 7  | RELEASING         | COMPLETED          | **Both legs `PAID_OUT`**                                                                 | System      |
| 8  | RELEASING         | UNWINDING          | ≥1 leg permanently `PAYOUT_FAILED` ∧ **zero legs `PAID_OUT`**                            | Admin       |
| 9  | RELEASING         | RECOVERY_REQUIRED  | **≥1 leg `PAID_OUT` ∧ ≥1 leg permanently failed**                                        | System      |
| 10 | UNWINDING         | CLOSED_UNWOUND     | All previously-`FUNDED` legs `RETURNED`                                                  | System      |
| 11 | UNWINDING         | RECOVERY_REQUIRED  | Return permanently failed                                                                | System      |
| 12 | RECOVERY_REQUIRED | CLOSED_RECOVERED   | Exposure resolved, no loss                                                               | **Admin**   |
| 13 | RECOVERY_REQUIRED | CLOSED_WITH_LOSS   | Loss recognized and case financially closed                                              | **Admin**   |

Rematch is not a phase: `CLOSED_UNWOUND` + `closure_reason = REMATCH` + `rematched_to`. A new settlement may be created only after `CLOSED_UNWOUND` — rematching must never reuse funds from the previous settlement.

## 10.5 Invariants

- No phase or leg transition may be applied outside the tables above; attempted invalid transitions raise a domain-level `InvalidStateTransitionError` and are logged to the audit trail.
- Every transition writes a `SettlementEvent` row (append-only). `settlement_events` is the source of truth; `settlements.phase` and `settlement_legs.state` are projections, and `transactions.status` is a further read-only projection for presentation.
- **All phase transitions are forward-only. There are no backward transitions.**
- `COMPLETED` is **strictly terminal** and financially immutable. This supersedes the earlier statement in this section that *"Completed is not fully terminal."* A post-completion dispute never mutates the completed record: it opens a `Dispute` entity, and any financial correction is made through a **new compensating settlement** carrying `compensates_settlement_id`, consistent with Section 7.4's existing rule that corrections require a compensating event, never a mutation.
- No settlement may enter a terminal phase while any leg is `FUNDED` and neither `PAID_OUT` nor `RETURNED` — customer funds may never be stranded by closure.
- The aggregate never stores a monetary fact, and therefore cannot contradict the legs. Money facts (`FUNDED`, `PAID_OUT`, `RETURNED`) exist only on `SettlementLeg` and in `settlement_events`, and are settable only by a signature-verified, in-replay-window partner webhook.
- `release_authorized_at` is set once and is immutable, guarded by a partial unique index.
- Disputes, compliance holds and reconciliation exceptions are separate entities and never alter financial state. Multiple holds may be open concurrently; progression requires zero open blocking holds.

## 10.6 Financial Event and Ledger Integration (ADR-002 / DEC-004)

- A raw partner message is **evidence, not truth**. It becomes an accepted `settlement_event` only after authentication, replay/idempotency check, schema validation, settlement/leg correlation, transition validation and financial invariant validation. `webhook_receipts` carries **no financial authority**.
- **Valid but premature or out-of-order evidence is quarantined in `pending_events` and re-evaluated — never silently discarded.** Contradictory evidence is retained but never promoted, and raises a reconciliation exception plus a blocking hold.
- A **separate append-only double-entry accounting ledger** records **Xspeeria's own economic activity only**. It is not a customer wallet ledger and asserts no ownership of customer principal held by partners. **No real-book entry may be posted against `FUNDED`, `PAID_OUT` or `RETURNED` for the principal itself, under any policy configuration.**
- **Processing is two-stage.** Ingress persists a receipt and acknowledges within 2 seconds (Document 07 §5.4) creating **no financial state**. An async worker then validates and evaluates **pure** posting rules, and writes `settlement_events`, both projections, `ledger_entries`, `ledger_lines`, audit records and outbox rows in **one local atomic transaction**. **No network call occurs inside it.** Outbox dispatch follows commit with deterministic idempotency keys.
- **`settlement_events` remains authoritative if a projection defect is found.** Projections are deterministically rebuildable from accepted history without rewriting it. The ledger is **never silently rebuilt** — divergence is a P1 incident requiring human investigation and sign-off, because a silent rebuild is indistinguishable from tampering.
- **Accounting policy is not determined.** The chart of accounts is configuration (**P-1**). Also open: **P-2** … **P-11**. No example, sample schema, comment, test, seed value or implementation default may make any of them normative. **TBD — Finance / Accounting / Legal / Compliance / Product / Banking Partner as applicable.**

# 11. SECURITY ARCHITECTURE

## 11.1 Authentication & Session Management

| Control            | Implementation                                                                                                             |
|--------------------|----------------------------------------------------------------------------------------------------------------------------|
| Password storage   | Argon2id hashing, per-user salt                                                                                            |
| Token type         | JWT (short-lived access token, ~15 min) + rotating refresh token                                                           |
| MFA                | TOTP-based (authenticator app) mandatory for all users; SMS OTP as fallback (flagged as weaker — see risk register in COM) |
| Session revocation | Refresh tokens stored server-side (hashed) to support revocation on logout/compromise                                      |
| Device binding     | Refresh tokens bound to device fingerprint; anomalous device triggers re-authentication                                    |

## 11.2 Authorization (RBAC)

| Role                 | Scope                                                                                 |
|----------------------|---------------------------------------------------------------------------------------|
| `user`               | Own resources only (offers, requests, transactions where party)                       |
| `support_agent`      | Read access to assigned support tickets, limited write on disputes                    |
| `compliance_officer` | Full KYC/AML module access, read-only elsewhere                                       |
| `ops_admin`          | Transaction/settlement manual intervention, read-only KYC                             |
| `super_admin`        | Full access, requires hardware-key MFA, all actions logged with elevated audit detail |

Authorization is enforced at the API layer via dependency-injected permission checks on every route — never solely at the UI layer.

## 11.3 Encryption

| Data State                 | Control                                                                                                              |
|----------------------------|----------------------------------------------------------------------------------------------------------------------|
| In transit                 | TLS 1.2+ enforced everywhere; HSTS enabled                                                                           |
| At rest (database)         | Encryption at rest via cloud-provider managed disk/volume encryption                                                 |
| At rest (sensitive fields) | Application-level field encryption for PII (national ID numbers, document numbers) using envelope encryption via KMS |
| Object storage (KYC docs)  | Server-side encryption, access via short-lived signed URLs only                                                      |

## 11.4 Secrets Management

- No secrets in source control, environment files committed to git, or client-side code.
- Secrets injected at runtime via a managed secrets store (e.g., AWS Secrets Manager / HashiCorp Vault).
- Automated secret rotation for database credentials and partner API keys on a defined cadence.

## 11.5 Rate Limiting & Abuse Prevention

- Tiered rate limiting per Section 7.5.
- Progressive backoff and account lockout after repeated failed authentication attempts.
- Device/IP velocity checks feeding into the fraud-scoring signal (advisory only, per AI principle in Section 1.2).

## 11.6 Webhook Verification

- All inbound partner webhooks (settlement callbacks) must carry an HMAC-SHA256 signature validated against a shared secret before processing.
- Replay protection via timestamp + nonce validation; requests outside a defined time window are rejected.
- Webhook processing is idempotent (Section 9.4 pattern applies equally here).

## 11.7 Input Validation

- All request/response schemas defined via Pydantic models with strict typing; unknown fields rejected.
- File uploads (KYC documents, dispute evidence) restricted by MIME type, size limit, and passed through malware scanning before storage.

## 11.8 Security Threat Model Summary (STRIDE-Oriented)

| Threat Category        | Example Risk                            | Mitigation                                                                           |
|------------------------|-----------------------------------------|--------------------------------------------------------------------------------------|
| Spoofing               | Fake partner webhook                    | HMAC signature verification                                                          |
| Tampering              | Modified transaction amount in transit  | TLS + server-side recomputation, never trust client-submitted amounts for settlement |
| Repudiation            | User denies confirming a match          | Immutable audit log with actor + timestamp                                           |
| Information Disclosure | KYC document leak                       | Encryption at rest, signed URL access, least-privilege IAM                           |
| Denial of Service      | Matching engine flooded with offer spam | Rate limiting, KYC-gated offer creation                                              |
| Elevation of Privilege | Support agent accessing admin functions | Strict RBAC enforcement at API layer                                                 |

# 12. INFRASTRUCTURE

## 12.1 Environment Strategy

| Environment | Purpose                                                | Data                                          |
|-------------|--------------------------------------------------------|-----------------------------------------------|
| Development | Local/shared dev                                       | Synthetic data only                           |
| Staging     | Pre-production validation, partner sandbox integration | Synthetic + sandbox partner data              |
| Production  | Live traffic                                           | Real user data, full security controls active |

## 12.2 Containerization & Deployment

    flowchart TB
        Dev["Developer commits code"] --> CI["CI Pipeline (GitHub Actions)"]
        CI --> Lint["Lint + Type Check"]
        Lint --> Test["Unit + Integration Tests"]
        Test --> Build["Build Docker Images"]
        Build --> Scan["Container Security Scan"]
        Scan --> Push["Push to Container Registry"]
        Push --> DeployStaging["Deploy to Staging"]
        DeployStaging --> E2E["Automated E2E Tests"]
        E2E --> Approval["Manual Release Approval"]
        Approval --> DeployProd["Deploy to Production (Blue/Green)"]
        DeployProd --> Monitor["Post-Deploy Monitoring Window"]

## 12.3 Logging & Monitoring

| Capability       | Tooling (Illustrative)                                                                      |
|------------------|---------------------------------------------------------------------------------------------|
| Structured logs  | JSON logs shipped to centralized log aggregator                                             |
| Metrics          | Prometheus-compatible metrics; Grafana dashboards                                           |
| Tracing          | OpenTelemetry distributed tracing across API → Celery → external partner calls              |
| Alerting         | PagerDuty/Opsgenie integration tied to severity thresholds (see COM Incident Response Plan) |
| Audit log access | Restricted, read-only, itself logged when queried                                           |

## 12.4 Backups & Disaster Recovery

| Item                           | Policy                                                                                                    |
|--------------------------------|-----------------------------------------------------------------------------------------------------------|
| Database backups               | Automated daily full backup + continuous WAL archiving for point-in-time recovery                         |
| Backup retention               | Minimum 35 days rolling, subject to final data retention policy in COM                                    |
| Backup testing                 | Quarterly restore drills to a sandboxed environment                                                       |
| RTO (Recovery Time Objective)  | Target ≤ 4 hours for full platform restoration (assumption, to be validated against banking partner SLAs) |
| RPO (Recovery Point Objective) | Target ≤ 15 minutes of data loss via WAL-based point-in-time recovery                                     |

**\[ASSUMPTION-TDS-06\]** RTO/RPO targets above are engineering-proposed defaults pending sign-off from Operations leadership in the Compliance & Operations Manual.

## 12.5 CI/CD Pipeline Gates

| Gate            | Requirement to Pass                                                                   |
|-----------------|---------------------------------------------------------------------------------------|
| Static analysis | No high/critical linter or type errors                                                |
| Unit tests      | 100% pass, minimum coverage threshold on money-handling modules (see Section 14)      |
| Dependency scan | No known critical CVEs in dependency tree                                             |
| Container scan  | No critical vulnerabilities in built image                                            |
| Staging E2E     | Full critical-path E2E suite passes                                                   |
| Manual approval | Required for all production deployments (no fully automated prod deploy at MVP stage) |

# 13. SCALABILITY STRATEGY

## 13.1 Scaling Approach by Layer

| Layer           | Strategy                                                                                                                                                           |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| API layer       | Horizontal auto-scaling of stateless FastAPI instances behind a load balancer                                                                                      |
| Database        | Vertical scaling initially; read replicas introduced for reporting/admin queries as load grows; partitioning of `transaction_events`/`audit_logs` by date at scale |
| Matching engine | Stateless workers coordinated via Redis locks; horizontally scalable as long as lock contention is monitored                                                       |
| Background jobs | Celery worker pool scaled independently per queue (settlement, notifications, compliance jobs each on dedicated queues to prevent noisy-neighbor delays)           |
| Caching         | Redis used for hot marketplace read paths (active offer listings) with short TTL invalidated on write                                                              |

## 13.2 Anticipated Bottlenecks & Mitigations

| Bottleneck                                              | Mitigation                                                                                     |
|---------------------------------------------------------|------------------------------------------------------------------------------------------------|
| Matching engine lock contention under high offer volume | Partition locks by currency pair; consider sharding matching workers by pair                   |
| Settlement partner API latency                          | Fully asynchronous via Celery; never block user-facing requests on partner round-trips         |
| KYC document processing backlog                         | Queue-based processing with autoscaled workers; manual review capacity planning (Ops)          |
| Audit log write volume                                  | Append-only table with time-based partitioning; archived to cold storage past retention window |

## 13.3 Multi-Corridor Expansion Considerations

The bounded-context structure (Section 5) allows new currency corridors to be added by: 1. Extending `currency_from`/`currency_to` enums and partner integration adapters 2. Adding corridor-specific compliance rules (configuration, not code fork) 3. No change required to the core matching, transaction, or state machine logic

This is a direct architectural consequence of keeping currency pair as data, not as a structural assumption baked into the domain model.

# 14. TESTING STRATEGY

## 14.1 Testing Pyramid

    flowchart TB
        E2E["E2E Tests\n(Critical user journeys)"]
        Integration["Integration Tests\n(Module + DB + Redis)"]
        Unit["Unit Tests\n(Domain logic, money math, state machine)"]

        Unit --> Integration --> E2E

## 14.2 Test Category Definitions

| Category    | Scope                                                                                                          | Tooling                                                                 |
|-------------|----------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| Unit        | Pure domain logic — matching rules, fee calculation, state transitions, money value object arithmetic          | pytest                                                                  |
| Integration | Module boundaries with real PostgreSQL/Redis (via test containers), no external partner calls                  | pytest + testcontainers                                                 |
| E2E         | Full critical user journeys through the API against a staging-like environment, partner calls mocked/sandboxed | pytest / Playwright (for mobile flows where applicable)                 |
| Performance | Load testing of matching engine and API under simulated peak traffic                                           | Locust / k6                                                             |
| Security    | Static analysis, dependency scanning, periodic penetration testing                                             | Bandit, Snyk/Dependabot, third-party pentest (see COM audit procedures) |

## 14.3 Mandatory Coverage Requirements

| Area                            | Minimum Requirement                                                             |
|---------------------------------|---------------------------------------------------------------------------------|
| Money/Decimal arithmetic module | 100% branch coverage                                                            |
| Transaction state machine       | Every defined transition + every invalid-transition rejection covered           |
| Matching engine concurrency     | Dedicated test suite simulating concurrent match attempts on the same liquidity |
| Webhook signature verification  | Valid, invalid, replayed, and malformed payload cases                           |
| KYC gating logic                | Verified/unverified/manual-review paths across every gated endpoint             |

## 14.4 Test Data Policy

- No real PII in any non-production environment.
- Synthetic KYC documents and sanctions-screening fixtures used for automated testing.
- Staging partner integrations use sandbox credentials only; production credentials never present outside the production environment.

# 15. ARCHITECTURE DECISION RECORDS

> **CITATION CONVENTION — added 2026-08-18.** The records in this section are **TDS-internal** and predate the repository-level ADR register at `docs/adr/`. Their numbering is independent and collides with it: TDS ADR-001 is the modular-monolith decision, whereas repository ADR-001 is the canonical transaction/settlement state machine.
>
> To cite unambiguously:
>
> - **Repository ADRs** (rank 2 authority per `DOCUMENT_INDEX.md` §1) — cite by path: `docs/adr/001-transaction-state-machine.md`, `docs/adr/002-financial-event-ledger-architecture.md`.
> - **TDS-internal ADRs** (this section) — cite as **`TDS ADR-00N`**, never as bare `ADR-00N`.
>
> The records below are **not renumbered**, because existing cross-references in the Business Requirements Specification and Compliance Operations Manual already qualify them as "TDS ADR-003" and renumbering would break them. Where this section conflicts with a repository ADR on the same subject, the repository ADR governs.

## ADR-001: Modular Monolith over Microservices at Launch

**Status:** Accepted

**Context:** The team must ship an MVP in a single corridor with a small engineering team while preserving a credible path to scale.

**Decision:** Build a modular monolith with strict bounded-context seams (Section 5), not a microservices architecture, at launch.

**Consequences:** Faster initial development, simpler operational overhead, single deployment unit. Requires discipline to maintain module boundaries to avoid a “big ball of mud.” Revisit post-MVP once traffic/team size justify extraction (candidate first extraction: Matching Engine, due to its distinct scaling profile).

## ADR-002: PostgreSQL as System of Record

**Status:** Accepted

**Context:** Financial data requires strong consistency guarantees, native decimal support, and mature transactional semantics.

**Decision:** PostgreSQL is the single system of record for all transactional data; no NoSQL store is used for money-related entities.

**Consequences:** Strong consistency at the cost of horizontal write scaling, mitigated via read replicas and partitioning strategy (Section 13).

## ADR-003: Wallet-less Escrow-State Model

**Status:** Accepted

**Context:** Xspeeria must not hold custody of user funds, per business principle and regulatory posture (see BRS, COM).

**Decision:** The `Transaction` aggregate tracks *state* (awaiting funds, funds received, settled) but the application never represents an internal ledger balance available for withdrawal; all actual fund movement happens through licensed banking partners.

**Consequences:** Reduces custodial regulatory burden; increases dependency on partner API reliability and requires robust reconciliation tooling (see Settlement module, Section 8.6, and COM Transaction Monitoring).

## ADR-004: Distributed Locking via Redis for Matching Engine

**Status:** Accepted

**Context:** Concurrent match attempts on the same liquidity must not result in double-allocation.

**Decision:** Use Redis-based distributed locks (Redlock pattern) as primary concurrency guard, with database row-locking as a secondary guard (Section 9.3).

**Consequences:** Introduces Redis as a hard dependency for matching correctness, not just performance; requires Redis high-availability configuration in production.

## ADR-005: AI Components Are Advisory-Only

**Status:** Accepted

**Context:** Business principle mandates AI never settles money (Section 1.2).

**Decision:** Any ML/AI component (fraud scoring, support triage) integrates as a read-only signal into human/deterministic-rule decision points; no AI output can directly trigger a state transition on `Transaction` or `Settlement` aggregates.

**Consequences:** Slightly higher latency/manual review load in ambiguous cases; significantly reduces regulatory and liability risk.

## ADR-006: Cloud Provider Selection Deferred

**Status:** Proposed (Open)

**Context:** This document is written cloud-agnostically to avoid premature lock-in during architecture review.

**Decision:** Final cloud provider selection to be made jointly by Engineering and Operations leadership, factoring in Nigerian/US data residency requirements (see BRS/COM), before infrastructure build-out begins.

**Consequences:** Infrastructure-as-code and deployment tooling choices in Section 12 remain illustrative until this ADR is resolved. **\[ASSUMPTION-TDS-04 applies.\]**

## Document End Notes

This Technical Design Specification is a living document. Any change to the Transaction State Machine (Section 10), Security Architecture (Section 11), or the wallet-less custody model (ADR-003) requires review and sign-off from both Engineering Architecture and Compliance leadership before implementation, given their direct regulatory relevance.

**Next steps per master documentation plan:** Business Requirements Specification (Document 1) and Compliance & Operations Manual (Document 3) remain available on request.
