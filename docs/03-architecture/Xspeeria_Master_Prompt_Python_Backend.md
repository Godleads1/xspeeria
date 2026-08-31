# XSPEERIA — MASTER PROMPT (Python/FastAPI Backend Edition)
### For Claude Code inside VS Code

---

## HOW TO USE THIS DOCUMENT

This replaces the TypeScript-backend version of the Xspeeria master prompt. Everything about the **product** stays the same — this document changes the **backend language to Python**, hardens the **security posture**, and adds the **operational workflow** for running it through Claude Code the way you ran CargoFlow.

Workflow:

1. Scaffold the repo manually first (see Section 5). Never let the agent do initial setup — you own the skeleton, then the agent works inside it.
2. Save this entire document as `AGENTS.md` in the project root, and make `CLAUDE.md` point to it (`See AGENTS.md for all instructions.`) — same pattern you used on CargoFlow.
3. Install the skills in Section 18 before you start Phase 0.
4. Paste this whole document as your first message to Claude Code (Opus, high effort) with the instruction: *"Review this, then brainstorm and design Phase 0. Ask any question when necessary."*
5. For every phase after that: **brainstorm → write spec → review → write plan → review → implement → verify → commit → PR → merge → next phase.** Never let the agent skip straight to code.
6. Use Opus (high effort) for brainstorming/planning, Sonnet for implementation — same split you used on CargoFlow.
7. At the end of every phase, before marking it done, require the agent to run: `ruff`, `mypy --strict`, `pytest`, `bandit`, `pip-audit`. A phase is not "done" because it compiles — it's done when it passes all five.

---

## 0. ROLE

You are my **Senior Fintech Software Architect, Product Manager, UI/UX Designer, Security Architect, Python Backend Engineer, Mobile Engineer, DevOps Engineer, and QA Engineer.**

We are building **Xspeeria**, a production-ready fintech platform for peer-to-peer fiat currency exchange, with a **Python backend**. The product vision, MVP boundary, and financial correctness rules below are non-negotiable. The technology choices are negotiable only where explicitly marked.

---

## 1. PRODUCT VISION (condensed)

Xspeeria is a trusted P2P marketplace for fiat currency exchange — not a wallet, not a crypto exchange. Users publish buy/sell FX intents, get matched (including partial/multi-offer splits) against real counter-offers, and settle through **licensed financial partners**, never through funds custodied directly by Xspeeria. Core loop: select currencies → set/accept a rate → get matched → controlled settlement → track to completion → rate the transaction.

Primary users: diaspora users, migrant workers, freelancers, SMEs, importers/exporters — corridors are added deliberately, one at a time, never all at once.

---

## 2. NON-NEGOTIABLE PRODUCT & SECURITY PRINCIPLES

1. Xspeeria never assumes it is allowed to hold customer funds directly. Prefer licensed banks, PSPs, MSBs, and card issuers for regulated activity.
2. Minimize custody of customer money wherever legally and commercially possible.
3. AI may recommend, classify, and assist. **Deterministic financial rules and licensed institutions control actual settlement — never the model.**
4. Never expose production financial credentials, KYC documents, encryption keys, card data, or banking secrets to the coding agent.
5. Every financial transaction has an explicit, auditable state machine. No arbitrary status changes.
6. Every sensitive action is authenticated, authorized, logged, and traceable.
7. Build incrementally. Never jump ahead of the current phase.
8. Explain reasoning, architecture, trade-offs, and risk before writing code.
9. Money is never a `float`. Ever. Anywhere. This is enforced in code review, not just convention.
10. Security, compliance, correctness, and auditability are product requirements — not "if there's time" items.

---

## 3. RECOMMENDED TECH STACK

### Mobile
React Native · Expo · TypeScript · Expo Router · TanStack Query · React Hook Form · Zod · native secure storage · push notifications

### Web / Admin
Next.js · React · TypeScript · Tailwind CSS · shadcn/ui · TanStack Query · React Hook Form · Zod

### Backend — Python

| Concern | Choice | Why |
|---|---|---|
| Language / runtime | Python 3.12+ | Modern typing (`TypedDict`, generics), performance improvements, `Decimal` native |
| Web framework | **FastAPI** | Async-native, OpenAPI schema generation built-in, Pydantic-native, best fit for a type-safe REST + webhook-heavy fintech backend |
| Validation / schemas | **Pydantic v2**, strict mode, `extra="forbid"` | Same job Zod does on the TS side — validate at every boundary, reject unknown fields |
| ORM | **SQLAlchemy 2.0 (async)** + **Alembic** migrations | Parameterized queries only — no raw SQL string interpolation, ever |
| DB driver | `asyncpg` | Async PostgreSQL driver |
| Auth | Custom auth service (extend `fastapi-users` or hand-roll) | MFA, passkeys/WebAuthn, device/session management, suspicious-login detection |
| Password hashing | **Argon2id** via `argon2-cffi` | Current best-practice hash, tuned cost parameters |
| Tokens | JWT (`python-jose`/`authlib`) short-lived access + hashed rotating refresh, Redis revocation list | |
| MFA | `pyotp` (TOTP), `webauthn`/`fido2` (passkeys) | |
| Background jobs | **Celery** (Redis/RabbitMQ broker) or **arq** for lighter async-native jobs | KYC callbacks, reconciliation, webhook processing, notifications |
| Caching / rate limiting / idempotency | **Redis** | Token buckets, idempotency-key locks, session/token revocation |
| Real-time | FastAPI native **WebSockets**, or **SSE** via `sse-starlette` | Match notifications, transaction/settlement status |
| Encryption | `cryptography` (AES-256-GCM envelope encryption) | Field-level encryption for PII, beneficiary bank data |
| AI integration | Anthropic Python SDK, isolated service layer | Rate guidance and support only — no write access to settlement |
| Testing | `pytest`, `pytest-asyncio`, `httpx.AsyncClient`, `polyfactory`/`factory_boy`, `hypothesis`, `coverage.py` | Property-based tests for money/rate edge cases |
| Static analysis | `mypy --strict`, `ruff` (lint + import sort) | |
| Security scanning | `bandit` (SAST), `pip-audit`/`safety` (dependency CVEs), `detect-secrets` (pre-commit) | |
| Observability | `structlog` (structured JSON logs), OpenTelemetry, Sentry, `prometheus-fastapi-instrumentator` | |
| Containers | Docker multi-stage, slim/distroless base, **non-root user**, pinned+hashed requirements (`pip-compile --generate-hashes`) | |
| Deployment | Railway / Render / Fly.io / AWS ECS-Fargate (not Vercel — long-running async Python doesn't fit serverless functions well) | |
| Secrets | Env vars via secrets manager (Doppler / Infisical / AWS Secrets Manager) — never committed | |

### Database
PostgreSQL · SQLAlchemy · Redis for caching, rate limits, queues, idempotency locks

### File Storage
Encrypted object storage (S3 / Cloudflare R2) for KYC documents, receipts, dispute evidence — signed URLs, strict access control, retention policies, malware scanning, audit logging on every access

### KYC / AML
Integrate an established provider (Smile Identity, Youverify, Sumsub, or similar with African-corridor coverage) rather than building identity verification from scratch. Support identity + document + liveness verification, sanctions/PEP screening, transaction monitoring.

### Financial Infrastructure
Licensed partners only, behind provider adapters — never hard-coded into business logic:

```
Xspeeria Settlement Service
  |
  +-- BankProviderAdapter
  +-- PSPProviderAdapter
  +-- EscrowProviderAdapter
  +-- CardProviderAdapter
```

### Analytics
Privacy-conscious product analytics. Never send passwords, KYC documents, card data, bank credentials, or sensitive transaction details into analytics.

---

## 4. HIGH-LEVEL ARCHITECTURE

```
Xspeeria Mobile App (React Native)      Xspeeria Web App (Next.js)
              |                                   |
              +----------------+------------------+
                               |
                    API / BFF Layer (FastAPI)
                    OpenAPI schema --> generated
                    TypeScript client (openapi-
                    typescript / orval) for full
                    frontend/backend type safety
                               |
        +----------------------+-----------------------+
        |                      |                        |
    Auth Service         Marketplace Service       User Service
        |
   +----+----+
   |         |
Matching   Rate
Engine     Engine
   |
Transaction Service
   |
Settlement Engine
   |
   +----------+----------+
   |          |          |
  Bank       PSP       Escrow
 Partner   Partner    Partner
              |
      Beneficiary Banks

Supporting services: KYC/AML · Fraud/Risk · Notifications ·
Disputes · Audit Logs · Reconciliation · Analytics · Admin · Support
```

**Cross-language type safety note:** because the backend is Python, tRPC (TS-only) is not usable across the boundary. FastAPI auto-generates an OpenAPI 3.1 schema; run `orval` (or `openapi-typescript`) in CI to regenerate a typed TS client for the Next.js/React Native apps on every schema change. This preserves end-to-end type safety without a shared-language requirement.

---

## 5. BACKEND PROJECT STRUCTURE

Scaffold this yourself before handing the repo to Claude Code:

```
xspeeria-api/
  app/
    api/                # FastAPI routers only — thin, no business logic
      v1/
        auth.py
        kyc.py
        fx_requests.py
        offers.py
        matching.py
        transactions.py
        settlement.py
        beneficiaries.py
        disputes.py
        admin.py
        webhooks/
    core/
      config.py         # settings via pydantic-settings, env-driven
      security.py        # password hashing, JWT, permission dependencies
      money.py            # Decimal-based Money value object
      exceptions.py
    domain/              # pure business logic — framework-agnostic, unit-testable
      matching/
      fx/
      transactions/
      risk/
    services/            # orchestration layer — calls domain + repositories + providers
    models/              # SQLAlchemy models
    schemas/             # Pydantic request/response schemas (separate from models)
    repositories/         # DB access layer — only place raw queries live
    providers/           # BankProviderAdapter, PSPProviderAdapter, EscrowProviderAdapter, CardProviderAdapter
    workers/             # Celery/arq tasks
    db/
      migrations/         # Alembic
  tests/
    unit/
    integration/
    e2e/
  docs/
    PLAN.md
    PROGRESS.md
    ARCHITECTURE.md
    SECURITY.md
    COMPLIANCE.md
    adr/
  AGENTS.md               # this document
  CLAUDE.md                # "See AGENTS.md"
  pyproject.toml
  Dockerfile
  docker-compose.yml       # local Postgres + Redis
```

**Layering rule (mandatory):** `api/` calls `services/`, `services/` calls `domain/` + `repositories/` + `providers/`. Nothing outside `repositories/` touches SQLAlchemy sessions directly. Nothing outside `domain/` decides business rules. This is what makes the matching engine and money logic independently unit-testable and, if ever needed, portable to another runtime without a rewrite.

---

## 6. CORE DOMAIN MODULES

```
auth · users · organizations · kyc · aml · currencies · fx-offers ·
fx-requests · matching · transactions · escrow · settlement ·
beneficiaries · accounts · reconciliation · risk · fraud ·
disputes · notifications · referrals · cards · support · audit · admin
```

Do not build one giant service containing all business logic — each module above is its own `domain/` + `service/` pair.

---

## 7. DATABASE DESIGN & MONEY PRECISION

**Authoritative money is exact integer minor units — `amount_minor BIGINT` + `currency CHAR(3)` + `scale SMALLINT` + `currency_def_version VARCHAR(32)`, immutably bound together at the moment the amount is established. CORRECTED 2026-08-25 by DECISION S4-1 (HUMAN-APPROVED).** The former instruction — *"Use PostgreSQL with `NUMERIC` columns for all money fields"* — is **withdrawn as authoritative money storage**: it contradicted ADR-002, `02_Technical_Design_Specification.md` §6.2/§6.4 and the API contract, which already specify `amount_minor BIGINT`. `NUMERIC`/`DECIMAL` survives **only** as an explicitly derived, non-authoritative presentation/reporting value with a justified need, and must never be read back as truth. **Rates are not monetary amounts** and remain `NUMERIC(12,6)`. **Never `FLOAT`/`DOUBLE` anywhere.** Core entities: `User`, `Profile`, `Organization`, `Membership`, `KycCase`, `Beneficiary`, `FxRequest`, `FxOffer`, `Match`, `Transaction`, `TransactionParty`, `Settlement`, `SettlementLeg`, `SettlementEvent`, `SettlementHold`, `ReconciliationException`, `Outbox`, `WebhookReceipt`, `PendingEvent`, `Account`, `LedgerEntry`, `LedgerLine`, `CurrencyDefinition`, `Dispute`, `AuditLog`.

Per ADR-001 (§8), `SettlementEvent` is **append-only and the source of truth**; `settlements.phase` and `settlement_legs.state` are projections of it, and `transactions.status` is a further **read-only** projection for presentation. `UPDATE`/`DELETE` on the event store is revoked at the DB role level, not merely discouraged. Financial records are append-only — never silently overwrite transaction history.

Schema-level constraints required by ADR-001:

- `settlement_legs`: exactly two rows per settlement, `UNIQUE(settlement_id, party_role)`; `CHECK` that source and destination jurisdiction are identical (no cross-border leg).
- `settlements`: `CHECK` on `phase`; partial unique index enforcing `release_authorized_at` set-once; `BEFORE UPDATE` trigger re-validating each phase gate against live leg rows.
- `webhook_events`: `UNIQUE(settlement_id, leg_id, event_type, provider_event_id)`.
- `outbox`: `UNIQUE(settlement_id, leg_id, operation)`.
- No wallet, balance, or customer cash-ledger table may exist — assert this in CI against the live schema.

**Financial event and accounting ledger (ADR-002 / DEC-004).** `docs/adr/002-financial-event-ledger-architecture.md` is authoritative.

Three stores with different authority: `webhook_receipts` (append-only **evidence**, no financial authority), `pending_events` (quarantine for valid evidence awaiting a prerequisite), and `settlement_events` (**root of accepted internal truth**). A raw webhook never mutates financial state. A message is accepted only after authentication, replay/idempotency check, schema validation, settlement/leg correlation, transition validation and financial invariant validation. Valid but premature evidence is **quarantined and re-evaluated, never silently discarded**; contradictory evidence is retained but never promoted.

A **separate append-only double-entry accounting ledger** records **Xspeeria's own economic activity only**. It is not a customer wallet ledger. **Customer principal movements (`FUNDED`, `PAID_OUT`, `RETURNED`) must never create real-book entries for the principal itself.**

Additional schema constraints:

- `ledger_entries`: `UNIQUE(source_event_id, posting_rule_id)`; `source_event_id NOT NULL` FK; `posting_rule_version` recorded but **not** in the uniqueness key; `entry_hash` over own content with **no prev-pointer**.
- `ledger_lines`: `amount_minor BIGINT` exact integer minor units; `currency`, `scale` and `currency_def_version` stored **on the line**; balanced per currency per entry.
- `REVOKE UPDATE, DELETE` on `settlement_events`, `webhook_receipts`, `ledger_entries`, `ledger_lines` from every application role, plus `BEFORE UPDATE/DELETE` triggers as defence in depth.
- Tamper evidence: per-entry content hash + periodic signed Merkle checkpoints. **No global `prev_entry_hash` chain** — it would serialize every ledger write.

**Processing model.** Stage 1 (synchronous, ≤2s per banking spec §5.4): authenticate, deduplicate, persist receipt, ack — **no financial state**. Stage 2 (async worker): validate and evaluate posting rules as **pure functions** (no I/O, no projection reads), then **one local atomic transaction** writing `settlement_events` + both projections + `ledger_entries` + `ledger_lines` + audit + outbox rows. **No network call occurs inside that transaction.** Outbox dispatch happens after commit with deterministic idempotency keys.

Implement in `domain/ledger/` (pure posting rules, framework-free) and `services/ledger/` (posting orchestration). Nothing outside `services/ledger/` may INSERT into ledger tables.

**Accounting policy is NOT approved and must not be invented** through examples, sample schemas, comments, tests, seed data or implementation defaults. The chart of accounts is **configuration** (P-1 TBD). Also open: P-2 revenue recognition · P-3 exposure recognition · P-4 loss recognition · P-5 recovery accounting · P-6 partner receivable/payable treatment · P-7 memorandum escrow accounting · P-8 reporting currency · P-9 FX accounting treatment · P-10 suspense ageing and quarantine thresholds · P-11 checkpoint frequency and external anchoring. **TBD — Finance / Accounting / Legal / Compliance / Product / Banking Partner as applicable.**

**Money rules (enforced in `core/money.py`):**

- All money values are `decimal.Decimal`, constructed from strings, never from `float`.
- Every currency has an explicit precision (NGN → 2dp, USD → 2dp, JPY → 0dp) defined in one place.
- Every calculation states its rounding mode explicitly (`ROUND_HALF_EVEN` unless a specific rule requires otherwise).
- A single `Money` value object owns all arithmetic — no ad hoc decimal math scattered across services.
- Pydantic schemas use `condecimal(decimal_places=..., max_digits=...)` matched to the target currency, never a bare `float` type on any money field.

---

## 8. TRANSACTION STATE MACHINE

> **RECONCILED — ADR-001 (DEC-003), 2026-08-18.** The single 14-state chain previously in this section has been superseded. Its `FUNDS_CONFIRMED` state could not distinguish one escrow funded from both, which is the distinction that gates release. See `docs/adr/001-transaction-state-machine.md`.

Financial facts and workflow decisions are **separate concerns**. Three artifacts, not one enum:

**`SettlementLeg.state` — 9 states, authoritative for per-leg financial facts.** Exactly two legs per settlement, identified by semantic party role (`REQUESTER`, `ACCEPTER`) plus an immutable UUID `leg_id`:

```
PENDING → ESCROW_PROVISIONED → FUNDED → RELEASE_SENT → PAID_OUT
PENDING → PROVISION_FAILED
RELEASE_SENT → PAYOUT_FAILED → RELEASE_SENT   (retry, corrected beneficiary)
PAYOUT_FAILED → RETURN_SENT
FUNDED → RETURN_SENT → RETURNED
```

`FUNDED`, `PAID_OUT` and `RETURNED` are money facts, settable **only** by a signature-verified, in-replay-window partner webhook. **`PAID_OUT` is irreversible and has zero outbound transitions.**

**`Settlement.phase` — 10 phases, forward-only.** Xspeeria's own decisions; contains no funding or payout vocabulary and therefore cannot contradict the legs:

```
INITIALIZING → AWAITING_FUNDING → RELEASING → COMPLETED
                              ↘ UNWINDING → CLOSED_UNWOUND
                                RELEASING → RECOVERY_REQUIRED → CLOSED_RECOVERED
                                                              → CLOSED_WITH_LOSS
                              ↘ CANCELLED
```

Terminal: `COMPLETED`, `CLOSED_UNWOUND`, `CLOSED_RECOVERED`, `CLOSED_WITH_LOSS`, `CANCELLED`. `RECOVERY_REQUIRED` is **not** terminal and must remain operationally visible.

**Separate entities, never phases:** `SettlementHold` (0..n concurrent, typed, `blocks_progression`), `Dispute`, `ReconciliationException`.

**Hard invariants — enforce in code and in the schema, not by convention:**

- `RELEASING` requires **both** legs `FUNDED` **and** both beneficiary accounts validated.
- `COMPLETED` requires **both** legs `PAID_OUT`.
- `UNWINDING`/`CLOSED_UNWOUND` require **zero** legs `PAID_OUT` — a partial payout is never a reversal.
- One leg `PAID_OUT` plus one permanently failed ⇒ `RECOVERY_REQUIRED`, never `COMPLETED`, never `CLOSED_UNWOUND`.
- No terminal phase while any leg is `FUNDED` and neither `PAID_OUT` nor `RETURNED`.
- No backward phase transitions exist.
- Rematching never reuses funds: escrow must be `RETURNED` and the settlement `CLOSED_UNWOUND` before a new settlement is created and linked via `rematched_to`.
- `CLOSED_WITH_LOSS` records that a recovery case was financially closed with a recognized loss. It does **not** assign the loss to Xspeeria — loss allocation is governed separately. **TBD — Legal / Partner Contracting / Insurance & Risk.**

Implement as an explicit state machine in `domain/settlement/` — a `TransitionTable` mapping `(current_phase, event) -> next_phase` with a pure gate predicate over leg states, not scattered `if`/`elif` chains. The phase derivation function is safety-critical: keep it pure and property-test it exhaustively. Every transition must: take `SELECT ... FOR UPDATE` on the settlement and both legs in fixed ID order → re-read leg state inside the lock → validate the gate → validate actor permission → execute → append a `SettlementEvent` → write audit → emit notifications → be idempotent.

**Release dispatch uses a transactional outbox.** The authorization decision (assert both legs `FUNDED`, beneficiaries validated, no blocking hold, `release_authorized_at IS NULL`; set `release_authorized_at`; set phase; append event; insert two outbox rows) commits in a **single** transaction. Dispatch happens afterwards, at-least-once, per leg, with a deterministic key `sha256(settlement_id | leg_id | operation | release_authorized_at)`. A successful dispatch to one leg is **never** rolled back because the other failed; the failing leg retries against the same key, and after exhausting retries a `DISPATCH_FAILURE` hold opens with no change to financial state. Never persist "both commands dispatched" as a fact — it is not one.

**Webhook deduplication is keyed on `(settlement_id, leg_id, event_type, provider_event_id)`** via a unique DB constraint. A webhook without a resolvable `leg_id` is rejected, never defaulted to a leg.

---

## 9. MATCHING ENGINE

Business problem: a user's request may need to be filled by several partial offers rather than one.

```
User needs: $10,000
Offer A: $4,000  |  Offer B: $3,500  |  Offer C: $2,500  →  Total: $10,000
```

Support exact matching, partial matching, multi-offer/split matching, currency-pair and rate compatibility, amount constraints, corridor restrictions, offer expiry, and liquidity limits. **Matching must be deterministic and fully unit-tested in `domain/matching/` with zero framework dependencies** — no database, no HTTP, pure functions in, pure results out. This is what makes it auditable and, later, portable. The AI layer may *suggest* rates; it never decides a match.

Concurrency is the hard part here — two users must never both successfully claim the same liquidity. Use a DB-level unique constraint or `SELECT ... FOR UPDATE` inside a transaction, and write a test that fires concurrent accept requests at the same offer.

---

## 10. SECURITY ARCHITECTURE (Python-specific, mandatory)

This is the section that makes the answer to "how secure can Python be" concrete. Every item below is a control, not an aspiration — each one maps to a library/practice the agent must actually implement.

**Authentication & sessions**
- Argon2id password hashing (`argon2-cffi`), tuned work factor
- Short-lived JWT access tokens (5–15 min) + rotating refresh tokens, hashed at rest, revocable via Redis
- MFA (TOTP via `pyotp`) mandatory for `ADMIN`/`SUPER_ADMIN`/`COMPLIANCE` roles, optional but encouraged for users
- WebAuthn/passkey support where feasible
- Device fingerprinting, new-device alerts, session/device management endpoints

**Input & output validation**
- Every endpoint has a Pydantic v2 request schema with `model_config = ConfigDict(extra="forbid")` — unknown fields are rejected, not ignored
- Separate response schemas from DB models so internal-only fields never leak
- Server re-validates every business rule regardless of what the client sent — never trust client-computed totals, rates, or fees

**Injection prevention**
- SQLAlchemy Core/ORM with bound parameters exclusively — no f-string or `%`-formatted SQL anywhere
- `bandit` CI rule flags any raw `execute()` call with string concatenation

**Money integrity**
- See Section 7 — `Decimal` end-to-end is itself a security control against silent fraud-by-rounding

**Authorization (RBAC)**
- Centralized permission system as FastAPI dependencies: `Depends(require_permission("transaction.refund"))`, never scattered `if user.role == "ADMIN"` checks
- Deny-by-default; a route with no explicit permission dependency should fail closed, not open

**Webhook & provider security**
- HMAC signature verification using `hmac.compare_digest` (constant-time, prevents timing attacks)
- Timestamp window validation to reject replayed events
- Idempotency enforced via a unique DB constraint on `(provider, event_id)`
- Provider IP allowlisting where the provider supports it

**Secrets management**
- No secrets in source or committed `.env` files — enforced by `detect-secrets` pre-commit hook
- Secrets loaded from a secrets manager per environment; rotated on a schedule
- Scoped, provider-specific API keys — never one shared key across dev/staging/prod

**Encryption**
- TLS everywhere, HSTS
- Field-level envelope encryption (AES-256-GCM via `cryptography`) for KYC PII and beneficiary bank details, with a KMS-managed data key — not application-level static keys
- Object storage server-side encryption + short-lived signed URLs for documents

**Dependency & code security (CI-gated on every PR)**
- `mypy --strict` — catches whole classes of bugs before runtime
- `ruff` — lint + import hygiene
- `bandit` — static security analysis
- `pip-audit` / `safety` — dependency CVE scanning
- Pinned, hashed requirements (`pip-compile --generate-hashes`)
- Automated dependency update PRs (Dependabot/Renovate)

**Rate limiting & abuse prevention**
- Redis-backed token bucket per IP and per user; stricter limits on auth/KYC endpoints
- Escalating friction (CAPTCHA) after repeated auth failures

**Audit logging**
- Structured (`structlog`, JSON), append-only audit log for every sensitive action — `USER_CREATED`, `KYC_APPROVED`, `MATCH_ACCEPTED`, `SETTLEMENT_COMPLETED`, `ADMIN_ACTION`, etc.
- No PII or secrets ever written to logs — redaction filters enforced at the logging layer, not by convention

**Infrastructure hardening**
- Non-root Docker user, minimal/distroless base image, read-only root filesystem where possible
- Database not publicly reachable; least-privilege IAM per service
- WAF + DDoS protection in front of the API

**Compliance-adjacent controls**
- PCI-DSS scope minimization: never handle raw card PAN/CVV — tokenized card-issuer integration only
- Data retention/deletion policy that accounts for both GDPR-style and regional data-protection regimes (e.g., NDPR for Nigerian corridors) — flag any jurisdiction-specific requirement for legal review rather than assuming

**Before launch:** a dedicated penetration test and security review is a required phase (Phase 14), not optional polish.

---

## 11. API DESIGN

REST, versioned (`/api/v1/...`), resource + verb pattern, documented automatically via FastAPI's OpenAPI schema. This is the deliberate choice over GraphQL/tRPC because regulated banking webhooks and provider integrations expect conventional REST/webhook interfaces, and because the OpenAPI schema is what feeds the typed frontend client (Section 4).

```
POST   /api/v1/auth/sign-up
POST   /api/v1/auth/sign-in
POST   /api/v1/kyc/start
GET    /api/v1/kyc/status
POST   /api/v1/fx-requests
GET    /api/v1/fx-requests
POST   /api/v1/offers
GET    /api/v1/matching/find
POST   /api/v1/matching/{id}/accept
GET    /api/v1/transactions/{id}
GET    /api/v1/transactions/{id}/timeline
POST   /api/v1/settlement
POST   /api/v1/beneficiaries
POST   /api/v1/disputes
GET    /api/v1/notifications
```

Every mutating endpoint requires an `Idempotency-Key` header for anything that touches money — retried requests with the same key return the same result rather than creating a duplicate transaction.

---

## 12. ROLE-BASED ACCESS CONTROL

```
USER · BUSINESS_USER · BUSINESS_ADMIN · SUPPORT_AGENT · OPERATIONS ·
COMPLIANCE · RISK_ANALYST · FINANCE · ADMIN · SUPER_ADMIN
```

Permissions are granular (`transaction.read`, `transaction.refund`, `kyc.review`, `user.suspend`, `audit.read`, `settings.manage`, …) and enforced through the centralized dependency in `core/security.py`, never through inline role checks scattered across route handlers.

---

## 13. AI RATE GUIDANCE (Claude integration)

The AI layer may: analyze recent marketplace rates, identify normal ranges, explain rate movements, suggest competitive pricing, flag outlier offers, summarize trends. It must **never**: move money, approve a regulated transaction, override KYC/AML, bypass limits, or make an irreversible financial decision.

```
Market Data + Marketplace Data + Historical Data
        |
Rate Analysis Service (Python)
        |
AI Recommendation (Anthropic SDK, isolated service, read-only DB access)
        |
Deterministic Rules
        |
User-facing Suggested Rate
```

Keep the Anthropic SDK call in its own service with no write permissions to `transactions`, `settlement`, or `escrow` tables — the recommendation and the executable price must remain architecturally distinct.

---

## 14. TESTING STRATEGY

- **Unit** (`domain/`, pure functions, no I/O): money calculations, fee/rate math, matching algorithm, state transitions, authorization logic. Use `hypothesis` for property-based tests on money edge cases (rounding, currency precision boundaries, negative/zero amounts).
- **Integration**: database, KYC provider (sandbox), settlement provider (sandbox), webhook handling, notifications.
- **End-to-end**: sign up → KYC → create request → find match → accept → settlement → completion, run against sandbox providers only. **Never real customer money in automated tests.**
- **Critical financial test cases (mandatory, every phase touching money):** duplicate payment, duplicate webhook, partial settlement, failed settlement, provider timeout, network failure mid-transaction, transaction/offer expiry, rate changes mid-flow, concurrent matches on the same offer, two users accepting the same offer, insufficient liquidity, partial multi-match failure, reversal, refund, dispute, account suspension mid-transaction.

- **ADR-001 invariant tests (CI-blocking, independent of the aggregate coverage floor):**

| ID | Test |
|---|---|
| T-1 | Release/complete from a single funded leg raises `InvalidStateTransitionError` |
| T-2 | Exhaustive: for all phase pairs, only the 13 gated transitions succeed; every other pair raises |
| T-3 | `PAID_OUT` has zero outbound leg transitions |
| T-4 | `COMPLETED` has zero outbound phase transitions |
| T-5 | `RELEASING` unreachable unless both legs `FUNDED` **and** both beneficiaries validated |
| T-6 | `COMPLETED` unreachable unless both legs `PAID_OUT` |
| T-7 | `UNWINDING`/`CLOSED_UNWOUND` unreachable when any leg is `PAID_OUT` |
| T-8 | One leg `PAID_OUT` + one permanently failed ⇒ `RECOVERY_REQUIRED`; `COMPLETED` and `UNWINDING` both raise |
| T-9 | No terminal phase reachable while a leg is `FUNDED` and neither `PAID_OUT` nor `RETURNED` |
| T-10 | Leg-1 and leg-2 webhooks carrying the **same** `event_type` are both processed — the `leg_id` deduplication regression test |
| T-11 | Any single webhook replayed 100× yields one event and one state change |
| T-12 | Unsigned, bad-signature, or out-of-replay-window webhook advances nothing |
| T-13 | No client-originated request can set a money fact |
| T-14 | Webhook with unresolvable `leg_id` is rejected, not defaulted |
| T-15 | Partner A's signed webhook cannot advance partner B's leg |
| T-16 | `release_authorized_at` cannot be written twice under concurrent authorization attempts |
| T-17 | Crash between outbox commit and dispatch → retry reuses the identical key; partner sees one release |
| T-18 | Leg-1 dispatch succeeds, leg-2 fails → leg 1 is not rolled back; `DISPATCH_FAILURE` hold opens; zero financial state change |
| T-19 | `hypothesis` property test: phase is consistent with every reachable combination of leg states |
| T-20 | Reconciliation mismatch — on terminal and non-terminal settlements alike — changes zero financial state |
| T-21 | Post-completion dispute leaves the original settlement byte-identical; correction is a new compensating settlement |
| T-22 | Rematch cannot create a new settlement until the prior one is `CLOSED_UNWOUND` with escrow `RETURNED` |
| T-23 | Two concurrent holds both block progression; closing one does not unblock |
| T-24 | `UPDATE`/`DELETE` on `settlement_events` fails at the DB role level |
| T-25 | Both legs' funding webhooks arriving simultaneously produce exactly one `RELEASING` transition |
| T-26 | Leg with mismatched source/destination jurisdiction is rejected at creation |
| T-27 | Schema assertion: no wallet, balance, or cash-ledger table exists |
| T-28 | `Transaction.status` is not writable through any API path |

- **ADR-002 ledger tests (CI-blocking):**

| ID | Test |
|---|---|
| T-29 | Every configured posting rule produces an entry balanced per currency in exact integer minor units |
| T-30 | One event → N rule-driven entries, each posted exactly once; a bumped `posting_rule_version` posts **nothing** |
| T-31 | No real-book entry is produced against `EscrowFunded`, `PayoutConfirmed` or `EscrowReturned` for the principal — checked at rule-config load **and** in CI |
| T-32 | **The system operates correctly with an empty posting-rule set** — proof that no accounting treatment is hard-coded |
| T-33 | Full replay from genesis reproduces the ledger byte-identically under recorded rule versions and policy configuration |
| T-34 | `UPDATE`/`DELETE` on `settlement_events`, `webhook_receipts`, `ledger_entries`, `ledger_lines` fail at the DB role level |
| T-35 | A modified entry is detected by `entry_hash`; an inserted, deleted or reordered entry is detected by checkpoint verification |
| T-36 | Concurrent postings across settlements and currencies proceed with **no contention on a shared hash head** — regression test for the rejected global chain |
| T-37 | No network call occurs inside the financial transaction; posting rules are pure |
| T-38 | Crash at every step of both stages leaves no partial financial state, no duplicates and no gaps |
| T-39 | All five evidence classes route correctly; a signature-valid message is **never** discarded |
| T-40 | An early-arriving valid event is quarantined then promoted when its prerequisite arrives; every quarantined event promotes or escalates, none expires silently |
| T-41 | A contradictory partner event is retained but never promoted, and raises a reconciliation exception plus a hold |
| T-42 | Historical entries remain correctly interpretable after a currency-definition version change |
| T-43 | Schema assertion: no customer wallet, balance or cash-ledger table under **any** configuration, memorandum book present or absent; no memorandum account is scoped to an individual customer |
- Enforce a coverage floor on `domain/` and `core/money.py` specifically (e.g., 90%+) — coverage on route handlers matters less than coverage on the code that touches money.

---

## 15. ENVIRONMENT, CI/CD & DEPLOYMENT

```
Development → Staging → Production
```
Separate databases, API keys, provider credentials, storage buckets, and auth secrets per environment. Production deploys require explicit human approval — never auto-deployed by the agent.

CI pipeline (every PR): `ruff` → `mypy --strict` → `pytest` (with coverage floor) → `bandit` → `pip-audit`. A PR that fails any of these does not merge, regardless of how the feature looks in the browser.

---

## 16. CLAUDE CODE DEVELOPMENT RULES

Claude should:
- Inspect existing code before changing it
- Explain architectural decisions before major changes
- Work incrementally, one phase at a time
- Write tests alongside features, not after
- Run `ruff`, `mypy --strict`, `pytest`, `bandit`, `pip-audit` before declaring a phase complete
- Follow the layering rule in Section 5 without exception
- Never fabricate provider APIs or invent regulatory requirements
- Clearly flag assumptions that need human/legal verification

Claude must **not**:
- Access production financial secrets or real customer KYC documents
- Move real money or deploy financial infrastructure without human approval
- Disable security controls, bypass authentication, or bypass KYC/AML
- Modify audit logs to hide an action
- Use `float` for any money-related field, ever

Use development/sandbox credentials only during development.

---

## 17. VS CODE + CLAUDE CODE SETUP CHECKLIST

Same operational pattern as the CargoFlow build — adapted for Python:

1. Scaffold the repo yourself (Section 5 layout) with `pyproject.toml`, `pre-commit` config (`ruff`, `mypy`, `bandit`, `detect-secrets`), and `docker-compose.yml` for local Postgres + Redis before opening Claude Code.
2. Save this document as `AGENTS.md`; make `CLAUDE.md` point to it.
3. Install the Claude Code extension in VS Code (or use the CLI/desktop app — whichever you're already using).
4. Install skills relevant to this project:
   - A brainstorm/plan skill (the same one used for CargoFlow) so every phase goes through **brainstorm → spec → plan → implement**, not straight to code
   - A frontend/UI-UX skill for the Next.js admin dashboard and mobile app screens
   - If available in your skills marketplace: Python/FastAPI-specific and security-review skills — install and confirm in `.claude/skills` before Phase 0
5. Select **Opus, high effort** for brainstorming and planning; switch to **Sonnet** for implementation — same split that worked well on CargoFlow.
6. Per phase: paste `"Plan and implement Phase N. Ask any question when necessary."` Do not skip the clarifying-question step — the phases with the most rework in your CargoFlow build were the ones where you said "just build it."
7. One git branch per phase, PR into `main` after manual review — never merge directly to `main`.
8. Before merging any phase, manually re-verify: does the response follow the layering rule (Section 5)? Does money use `Decimal` everywhere? Do the five CI checks pass? Did the agent add tests for the critical financial cases in Section 14 that apply to this phase?

---

## 18. PHASED IMPLEMENTATION ROADMAP

```
Phase 0  — Project Foundation: repo, Python tooling, CI, DB, auth skeleton, design system, ARCHITECTURE.md
Phase 1  — Authentication & Profiles: sign up/in, email verification, MFA, sessions, security settings
Phase 2  — KYC: provider integration, onboarding, document upload, verification callbacks, compliance states
Phase 3  — Currency & FX Core: currencies, pairs, Money value object, rate model, fee model
Phase 4  — Marketplace: FX requests, offers, search/filter, rate display, expiry
Phase 5  — Matching Engine: exact/partial/split matching, concurrency protection, audit trail
Phase 6  — Transaction Engine: creation, state machine, timeline, cancellation
Phase 7  — Settlement: licensed provider integration, webhooks, reconciliation
Phase 8  — Risk & Compliance: AML, sanctions, risk scoring, monitoring, manual review
Phase 9  — Notifications: email, push, in-app, security alerts
Phase 10 — Admin Dashboard: users, KYC, transactions, settlement, disputes, risk, audit
Phase 11 — AI Rate Guide: market data, historical analysis, recommendations, explainability
Phase 12 — Debit Card: card issuer integration, eligibility, activation, lifecycle
Phase 13 — Business Accounts: organizations, KYB, approval workflows, reports
Phase 14 — Production Hardening: pen test, load test, disaster recovery, security/compliance review
Phase 15 — Launch: one legally approved corridor first; measure before expanding
```

Never build the entire roadmap at once. Never start Phase N+1 until Phase N is implemented, tested, and manually verified in the browser/Postman/httpx.

---

## 19. DOCUMENTATION TO MAINTAIN

```
README.md · PLAN.md · PROGRESS.md · ARCHITECTURE.md · SECURITY.md ·
COMPLIANCE.md · API.md · DATABASE.md · RUNBOOK.md · INCIDENT_RESPONSE.md
```

Major architectural decisions get an ADR: `/docs/adr/001-walletless-architecture.md`, `002-python-backend-choice.md`, `003-settlement-provider-abstraction.md`, `004-matching-engine.md`, etc. `PROGRESS.md` is updated after every phase — a feature is only "complete" when code exists, tests pass, `mypy --strict` passes, and behavior is manually verified.

---

## 20. FINAL ENGINEERING PRINCIPLE

Build Xspeeria as if it will eventually process real financial volume, while keeping each phase small enough that you personally understand every decision made inside it. Every implementation decision should answer: Is it secure? Is it auditable? Is it compliant with the applicable jurisdiction? Is it financially correct? Is it recoverable if something fails? Is it scalable? Is it testable? Can a provider be replaced without rewriting the platform? Can another corridor be added without redesigning the system?

**Never invent regulatory licenses, banking capabilities, payment-provider capabilities, or compliance approvals. Clearly label anything requiring human or legal verification.**

---

## KICKOFF TASK — paste this after the document above

Before writing any code:

1. Review this entire document.
2. Confirm the Python backend architecture and flag any section you'd change and why.
3. Propose the Phase 0 scope (project foundation) and ask any clarifying questions before proposing it.
4. Produce `PLAN.md`, `ARCHITECTURE.md`, `SECURITY.md`, `COMPLIANCE.md`, and `PROGRESS.md` inside `/docs`.
5. Do not implement Phase 0 until the plan above has been reviewed and approved.
