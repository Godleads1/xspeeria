# XSPEERIA — PHASE 0 REPOSITORY & DOCUMENTATION AUDIT

**Date:** 2026-08-18
**Scope:** Full `/xspeeria-audit` per `.claude/skills/xspeeria-audit/SKILL.md`
**Mode:** Read-only. No production code, documentation, or configuration was modified.
**Authority applied:** `CLAUDE.md` → `DOCUMENT_INDEX.md` → `docs/00-source-of-truth/` → `docs/` → `reference/` → code.

---

# 1. EXECUTIVE SUMMARY

Xspeeria is a **documentation-only repository**. There is no application source code of any kind — no Python, TypeScript, SQL, Dockerfile, or dependency manifest. Every implementation-facing assessment below is therefore `DOCUMENTED BUT NOT IMPLEMENTED` or `UNKNOWN — NOT VERIFIED`.

The documentation set is unusually complete for a pre-implementation project, and its security and financial-correctness intent is strong. The blocking problem is **not missing documentation — it is unreconciled authority between documents that are each designated primary for their own domain**.

Five documents each define a transaction/settlement state machine. All five differ. Four of the five cannot represent the single most important financial invariant the platform has: that one escrow leg is funded and the other is not. That invariant is the only thing standing between the platform and a one-sided release of customer funds.

`DOCUMENT_INDEX.md` §1 requires: *"If authoritative documents materially conflict and this index does not resolve the conflict: `STOP — DOCUMENT CONFLICT REQUIRES HUMAN DECISION`."* That condition is met.

**Verdict: NO-GO for implementation.** Not because the work is unsafe to start, but because Phase 3 onward cannot be built without first choosing between contradictory authoritative specifications. Five decisions are required (§14).

---

# 2. REPOSITORY INVENTORY

**Verified by direct filesystem enumeration.**

| Extension | Count |
|---|---|
| `.md` | 74 |
| `.docx` | 11 |
| `.ps1` | 3 |
| `.example` | 2 |
| `.gitignore` | 2 |
| `.json` | 1 |

**Application source files: 0.**

| Path | State |
|---|---|
| `docs/` | 22 Markdown files across 13 numbered domains — populated |
| `reference/` | Archival source conversions — populated |
| `.claude/` | 16 skills, 5 agents, 4 workflows, hooks — populated |
| `tests/` | `e2e/`, `integration/`, `performance/`, `security/` — **all four directories empty** |
| `infrastructure/` | **empty** |
| `.github/workflows/` | **empty** |
| `scripts/` | 1 file: `install-xspeeria-claude.ps1` |
| `.backup-before-repair/` | Prior-state backups of `CLAUDE.md`, `AGENTS.md`, `DOCUMENT_INDEX.md` |

Not a git repository (`Is a git repository: false`). No version history is available to corroborate any claim about prior work.

---

# 3. SOURCE-OF-TRUTH ASSESSMENT

| Document | Designated role | State |
|---|---|---|
| `docs/00-source-of-truth/00_5-Year_Business_Plan_SOURCE_OF_TRUTH.md` | Business SOT | DOCUMENTED |
| `docs/13-governance/CORRECTIONS_v3.md` | Reconciliation record | DOCUMENTED — **self-declares 3 unresolved items** |

`CORRECTIONS_v3.md` is the most valuable document in the repository for audit purposes because it is honest about what it did not finish. It explicitly records (lines 24–29, 45–51, 53–62) three items as *"Not yet reconciled — needs follow-up"*. Those admissions are load-bearing inputs to Decisions 3 and 5 below.

**Structural weakness:** four documents designated as authoritative or supporting in `DOCUMENT_INDEX.md` are stubs of 11–32 lines:

| Document | Lines | Index role |
|---|---|---|
| `docs/03-architecture/ARCHITECTURE.md` | 12 | Supporting architecture (§5) |
| `docs/04-api-data/API_DATA_DICTIONARY.md` | 11 | Supporting API/data (§6) |
| `docs/09-ui-ux/DESIGN_SYSTEM.md` | 14 | Design system (§11) |
| `docs/02-product/PRODUCT_REQUIREMENTS_DOCUMENT.md` | 24 | Supporting product (§4) |
| `docs/13-governance/EXECUTION_MANUAL.md` | 16 | Approved execution process (§14) |

These cannot carry the authority the index assigns them. `ARCHITECTURE.md` (12 lines) is nominally a supporting architecture authority alongside a 981-line TDS.

---

# 4. REQUIREMENTS ASSESSMENT

Business, product, and UX requirements are `DOCUMENTED` and technology-independent, satisfying `CLAUDE.md`'s architecture-conflict rule.

Requirement traceability per `DOCUMENT_INDEX.md` §19 (BUSINESS → PRODUCT → ARCHITECTURE → DATA → API → SECURITY → FINANCIAL → UI/UX → TEST → OBSERVABILITY → DOCS) **breaks at the TEST link for every requirement** — the test directories are empty. It additionally breaks at ARCHITECTURE→DATA→API for any money-touching requirement, because those three layers disagree (§13, Contradiction C-1).

---

# 5. ARCHITECTURE ASSESSMENT

**Approved stack — Python + FastAPI + PostgreSQL + SQLAlchemy + Pydantic + Redis** — is consistently stated in `CLAUDE.md`, `DOCUMENT_INDEX.md` §5, `PROGRESS.md` DEC-001, `ARCHITECTURE.md`, and `Xspeeria_Master_Prompt_Python_Backend.md`. **No unresolved Node/Express/NestJS/Supabase conflict was found in the `docs/` tree.** The architecture-change-control rule in `CLAUDE.md` is being honored. `IMPLEMENTED: NO`.

The layering rule (`Xspeeria_Master_Prompt_Python_Backend.md` §5, TDS line 206 — domain layer has zero framework knowledge) is well specified and mutually consistent across both architecture documents.

**Scaffolding divergence.** `Xspeeria_Master_Prompt_Python_Backend.md` §5 instructs the human to scaffold `xspeeria-api/app/{api,core,domain,services,models,schemas,repositories,providers,workers,db}` with `tests/{unit,integration,e2e}` before handing the repo to Claude Code. None of it exists. The actual `tests/` tree is `{e2e,integration,performance,security}` — no `unit/`, despite §14 of that document making `domain/` unit tests the mandatory coverage floor.

**Governance inversion.** §HOW TO USE (lines 12–13) and §17 direct that this document be saved as `AGENTS.md` with `CLAUDE.md` reduced to a pointer (`"See AGENTS.md for all instructions."`). The repository does the opposite: `CLAUDE.md` is a 3.3 KB constitution and `AGENTS.md` is a 259-byte 9-step stub that references a `PRD`, `Architecture`, `Security`, and `Design System` by informal name. Not safety-critical, but it means the operational workflow the backend spec assumes is not the one in force.

---

# 6. SECURITY ASSESSMENT

**Zero controls implemented. Zero controls verifiable.** `UNKNOWN — NOT VERIFIED` across every category in the security baseline's scoring matrix.

Documented security intent is strong and specific: Argon2id, short-lived JWT + rotating hashed refresh tokens with Redis revocation, Pydantic `extra="forbid"`, centralized deny-by-default RBAC dependencies, HMAC webhook verification via `hmac.compare_digest`, timestamp replay windows, `(provider, event_id)` idempotency constraints, envelope encryption for PII, `bandit`/`pip-audit`/`detect-secrets` CI gating.

**Finding S-1 — the designated security baseline contains no normative controls.**
`CLAUDE.md` and `DOCUMENT_INDEX.md` §9 both designate `docs/07-security/Xspeeria_Security_Master_Audit.md` as *"the mandatory security baseline."* It is not a specification — it is a 1,752-line **audit prompt** addressed to an auditor ("You are conducting a comprehensive security audit", line 14; "Verify RLS is enabled on every relevant table", line 618). It defines what to check, never what to build. It also carries evidence of template reuse from a different product: line 16 scopes the target to *"property/infrastructure information"*, which is not an Xspeeria domain concept.

The actual normative security requirements live in `02_Technical_Design_Specification.md` §11, `Xspeeria_Master_Prompt_Python_Backend.md` §10, and `05_API_Contract_Data_Dictionary.md` §2 — **none of which `DOCUMENT_INDEX.md` designates as the security authority**, and which contradict each other (§13, C-2).

**Finding S-2 — RLS is demanded by the baseline and specified by nobody.**
`Xspeeria_Security_Master_Audit.md` §D1/§D2 require row-level security on every relevant table. Neither the TDS, the Python backend spec, nor the API/data dictionary specifies RLS policies; both architecture documents rely exclusively on application-layer FastAPI permission dependencies. No decision record explains the divergence.

**Finding S-3 — tenant model exists in one layer only.**
`Xspeeria_Master_Prompt_Python_Backend.md` §6/§7/§12 define `organizations`, `Organization`, `Membership`, `BUSINESS_USER`, `BUSINESS_ADMIN`, and Phase 13 Business Accounts. `05_API_Contract_Data_Dictionary.md` defines no organization entity and no tenant-scoping field. Tenant isolation — the baseline's highest-weighted category at 15 points — has no data-contract foundation.

**Positive:** `.env.example` is exemplary. It carries only `CHANGE_ME` placeholders, an explicit prohibition list (bank/PSP/KYC credentials, encryption master keys, customer data), and directs production secrets to a managed secrets manager. No secrets found in the repository.

---

# 7. FINANCIAL / BANKING ASSESSMENT

Financial *intent* is the strongest documentation in the repository. `Appendix_D_...v1.1.md` is unambiguous: non-custodial, two country-local escrow accounts per corridor, domestic-only legs, no border crossing, event-sourced ledger, balance tables strictly prohibited, atomic dual-escrow release, mandatory idempotency keys, 7-year audit retention, daily reconciliation.

The Decimal-only rule is stated consistently and without exception — `CLAUDE.md`, `AGENTS.md` line 16, `API_DATA_DICTIONARY.md` line 13, Python backend spec §2.9/§7 ("Money is never a `float`. Ever. Anywhere."), API contract `NUMERIC(12,6)` columns. **No contradiction found on money representation.** This is the one financial invariant the document set agrees on completely.

**Everything else about the financial state model is contested.** See §13 Contradiction C-1 and §14 Decision 1 — this is the audit's central finding.

Banking integration (`07_Banking_Integration_Specification_v1.1.md`) is well constructed and appropriately labeled: it names no partner, licence, or rail, and carries explicit `ASSUMPTION` blocks at line 39 (all mechanisms are reference architecture) and line 268 (all SLA figures are illustrative, not partner commitments). Its Appendix A regulatory disclaimer is notably candid and is itself a decision input (§14 Decision 4).

---

# 8. API / DATA ASSESSMENT

`05_API_Contract_Data_Dictionary.md` (743 lines) is detailed and internally coherent: versioned REST, `Idempotency-Key` on money-touching mutations, `filter[field]`/`sort` conventions, enumerated error codes (`RES_409_INVALID_SETTLEMENT_STATE`), 15-minute access tokens, per-entity field tables with types and constraints.

It conflicts with higher-authority documents on:

- **Settlement/transaction states** — see C-1.
- **MFA scope** — see C-2.
- **Ledger model** — its entities carry mutable `status` ENUM columns (lines 804, 816), which is a current-state model, not the event-sourced model Appendix D §7 mandates. The TDS reconciles this (line 950: `transactions.state` is a derived projection, `transaction_events` is the source of truth); the API contract does not state the relationship, so an implementer reading only the API contract would build the prohibited model.
- **Organization/tenant entity** — absent entirely (S-3).

---

# 9. UI / UX ASSESSMENT

Four UI/UX documents, two substantial (`Xspeeria_UIUX_AppFlow_Spec_v2.md` 429 lines, `xspeeria-design-bible.md` 167 lines) and two stubs (`UI_UX_SCREEN_SPEC.md` 32 lines, `DESIGN_SYSTEM.md` 14 lines). Accessibility is addressed concretely (live regions, `accessibilityRole="switch"`, focus and error states), which is better than typical at this stage.

Both substantial documents render MFA as user-optional ("Submit → MFA (**if enabled**) or Home" — AppFlow line 248, design bible line 145), contradicting the TDS and API contract (C-2). Per `DOCUMENT_INDEX.md` §11 this is not itself a security defect — frontend controls are never authoritative — but it means the designed user journey does not include a step the API contract will enforce, which is a product-behavior conflict, not a cosmetic one.

---

# 10. TESTING ASSESSMENT

`IMPLEMENTED: NO.` Four empty directories.

No test runner, no `pyproject.toml`, no coverage configuration, no fixtures. The `tests/unit/` directory required by the backend spec's coverage floor does not exist; `performance/` and `security/` exist but are specified by neither architecture document.

The documented strategy is sound where it exists — `Xspeeria_Master_Prompt_Python_Backend.md` §14 enumerates fifteen mandatory financial test cases (duplicate payment, duplicate webhook, partial settlement, provider timeout, concurrent matches on the same offer, two users accepting the same offer, partial multi-match failure, reversal, dispute, suspension mid-transaction) and requires `hypothesis` property-based tests on money edge cases with a 90%+ floor on `domain/` and `core/money.py`.

**Note:** those fifteen cases are written against a state machine that has not been chosen (Decision 1). Several — partial settlement in particular — have materially different expected outcomes under each candidate model.

---

# 11. INFRASTRUCTURE ASSESSMENT

`IMPLEMENTED: NO.` `infrastructure/` and `.github/workflows/` are both empty.

`06_Infrastructure_DevOps_Handbook.md` documents environments, AWS Secrets Manager, Celery Beat scheduling, Multi-AZ PostgreSQL with a 5-minute RPO and WAL archiving. The five-gate CI pipeline (`ruff` → `mypy --strict` → `pytest` → `bandit` → `pip-audit`) is specified in the backend spec §15 and §17 as a merge gate. **No workflow file implements it.** Every quality and security gate in the engineering process is currently documentation only.

Observability is documented (`structlog` JSON, OpenTelemetry, Sentry, `prometheus-fastapi-instrumentator`, log redaction enforced at the logging layer) and unimplemented.

---

# 12. DOCUMENTATION ASSESSMENT

Coverage is genuinely good: 13 domains, an authority order, evidence states, a document-not-found protocol, and a traceability chain. `DOCUMENT_INDEX.md` is a better governance artifact than most production repositories have.

Gaps:

- Five stub documents hold authority they cannot support (§3).
- Artifacts required by `Xspeeria_Master_Prompt_Python_Backend.md` §19 are absent: `PLAN.md`, `SECURITY.md`, `COMPLIANCE.md`, `API.md`, `DATABASE.md`, `RUNBOOK.md`, `INCIDENT_RESPONSE.md`, and `docs/adr/`. The ADR directory matters most — `001-walletless-architecture.md` is exactly where Decisions 1, 4, and 5 belong once made.
- Several documents cross-reference `SECURITY.md` and `ARCHITECTURE.md` as if they were substantial (banking spec line 177, design bible lines 145/153). `SECURITY.md` does not exist; `ARCHITECTURE.md` is 12 lines. These are **dangling normative references** — the banking spec grounds its HMAC verification requirement in a document that isn't there.
- Banking spec header says `Status: Draft — Pre-Development Blueprint` and `Document Version: v1.0 — Draft` while the filename and `DOCUMENT_INDEX.md` §8 treat it as v1.1 authoritative. Minor, but it means the primary banking authority self-identifies as a draft.
- `07_Banking_Integration_Specification_v1.1.md` line 9 reads "DOCUMENT 07 OF 05".

---

# 13. CONTRADICTIONS

## C-1 — **RESOLVED 2026-08-18 by ADR-001 (DEC-003)** — Five incompatible transaction/settlement state machines

> **Status: RESOLVED.** Approved by human decision and reconciled across all normative documents. See `docs/adr/001-transaction-state-machine.md`. The record below is retained as the audit evidence that produced the decision.


| # | Document | Index authority | States |
|---|---|---|---|
| 1 | `Appendix_D_...v1.1.md` §5 | **PRIMARY — financial** (§7) | `OPEN, MATCHED, INSTRUCTION_SENT, AWAITING_ESCROW_FUNDING, ESCROW_A_FUNDED, ESCROW_B_FUNDED, BOTH_ESCROWS_FUNDED, PROCESSING, VERIFIED, COMPLETED, CANCELLED, DISPUTED, REMATCH_REQUIRED` |
| 2 | `Xspeeria_Master_Prompt_Python_Backend.md` §8 | **PRIMARY — backend engineering** (§5) | `DRAFT → MATCHED → ACCEPTED → FUNDING_PENDING → FUNDS_CONFIRMED → ESCROW_CONFIRMED → SETTLEMENT_PENDING → SETTLED → COMPLETED` + `CANCELLED, EXPIRED, FAILED, DISPUTED, REVERSED` |
| 3 | `02_Technical_Design_Specification.md` §10.2 | Supporting architecture (§5) | `Proposed, Confirmed, AwaitingFunds, FundsReceived, SettlementInitiated, SettlementPending, Completed, SettlementFailed, ManualReview, Refunded, Cancelled, Disputed, Resolved` |
| 4 | `07_Banking_Integration_Specification_v1.1.md` §4.3 | **PRIMARY — banking** (§8) | `initiated, funds_pending_verification, verified, processing, completed, failed` |
| 5 | `05_API_Contract_Data_Dictionary.md` (lines 804, 816) | **PRIMARY — API/data** (§6) | Transaction: `initiated, settling, completed, failed, disputed`; Settlement: `initiated, funds_pending_verification, verified, processing, completed, failed` |

Three naming conventions (`SCREAMING_SNAKE`, `PascalCase`, `lowercase_snake`), state counts from 5 to 14, and no mapping table anywhere in the repository.

**The material defect, not the cosmetic one:** models 2–5 have **no state that distinguishes "escrow A funded, escrow B not funded."** Appendix D §5 and §15 make holding that distinction a hard prohibition — *"never release either leg of a settlement until both local escrow accounts are independently confirmed funded by their respective partner's webhook."* Banking spec §4.3 defines `funds_pending_verification` as *"**At least one party** has confirmed sending funds"* with a legal transition straight to `verified`. That single state collapses the funded/unfunded asymmetry the entire non-custodial design depends on.

Two further behavioral contradictions inside C-1:

- **Funding timeout.** Appendix D §5 requires the funded party's escrow be returned and the transaction re-opened for matching (`REMATCH_REQUIRED`), with repeated non-funding affecting risk score. TDS §10.2 transitions `AwaitingFunds → Cancelled`. Different customer outcome, different money movement.
- **Terminality of COMPLETED.** Appendix D §5 and §15: *"Completed transactions are immutable and may never be edited."* TDS §10.3: *"`Completed` is not fully terminal — a bounded dispute window allows transition to `Disputed`"*, and §10.2 permits `Completed → Disputed`. Python backend spec §8 lists `REVERSED` as a terminal alternate. Three different answers to whether a completed transaction can change.
- **Orphan state.** Appendix D §11 requires `RECONCILIATION_REQUIRED` on any reconciliation mismatch. It appears in no state machine, including Appendix D's own §5 list.

`DOCUMENT_INDEX.md` does not resolve conflicts between documents that are each primary for their own domain. → `STOP — DOCUMENT CONFLICT REQUIRES HUMAN DECISION`.

## C-2 — HIGH — MFA scope contradiction

| Source | Position |
|---|---|
| `Xspeeria_Master_Prompt_Python_Backend.md` §10 line 275 | Mandatory for `ADMIN`/`SUPER_ADMIN`/`COMPLIANCE`; **"optional but encouraged for users"** |
| `02_Technical_Design_Specification.md` §11.1 line 961 | **"mandatory for all users"**; SMS OTP fallback, flagged weaker |
| `05_API_Contract_Data_Dictionary.md` §2.2 line 95 | **"enforced at login for all users post-KYC-approval"**; SMS OTP, Email OTP, TOTP all supported |
| `Xspeeria_UIUX_AppFlow_Spec_v2.md` line 248, `xspeeria-design-bible.md` line 145 | **"MFA (if enabled)"** — user-optional |

Four positions on who must use MFA and three on which factors are acceptable. The API contract admits Email OTP, which neither architecture document lists; the TDS explicitly flags SMS as weaker while the API contract admits it without qualification.

## C-3 — HIGH — Corridor reconciliation is incomplete

`CORRECTIONS_v3.md` §1 establishes NGN⇄GBP as the Year 1 pilot and NGN⇄USD as Year 2, and **states in its own text (lines 24–29) that the underlying UK-specific compliance research does not exist in the suite** — only the labels were updated.

Residual unreconciled USD/US content in documents now nominally on a GBP pilot:

- Banking spec §3.1 line 93: `currency` field — *"NGN or USD at launch"*
- Banking spec §4.1: the fully worked settlement sequence is *"NGN → USD Corridor"*; GBP→NGN is handled in §4.2 by a single prose sentence asserting the inverse
- Banking spec §8 SLA table: *"Transfer completion time (USD domestic leg)"* — no GBP leg target exists
- Banking spec Appendix A: regulatory exposure assessed for *"Nigeria and the United States"* — the UK is not mentioned
- Compliance manual `ASSUMPTION-COM-01` (line 104) and `ASSUMPTION-COM-02` (line 208): thresholds and retention to be set against *"Nigerian and US jurisdictions"*
- Compliance manual line 196: NDPR only; no UK GDPR/ICO equivalent

## C-4 — **RESOLVED 2026-08-18 by ADR-002 (DEC-004)** — Ledger model stated three ways

> **Status: RESOLVED.** The document-level divergence was closed during ADR-001 reconciliation; the substantive ledger-architecture question — which this audit did not reach — was decided by ADR-002. See `docs/adr/002-financial-event-ledger-architecture.md`. The record below is retained as the audit evidence that produced the decision.


Event-sourced and balance-prohibited (Appendix D §7/§14; legacy master prompt lines 277, 307–309; TDS lines 407, 584, 950) vs. entity tables with mutable `status` columns and no stated projection relationship (API contract lines 804, 816) vs. *"append-only wherever practical"* with a `TransactionEvent` entity absent from the entity list (Python backend spec §7 line 229). Only the TDS states the projection relationship that makes these compatible.

## C-5 — LOW — Take Rate KPI definition

`CORRECTIONS_v3.md` §2 flagged this and it remains open. `08_Investor_Board_Strategy_Book_v1.1.md` line 269 defines Take Rate as *"Realized transaction-fee revenue as a percentage of Completed Settlement Volume"*. Lines 114/126/127 correctly describe the flat coordination fee with take rate as a derived, declining metric. Compatible in substance, unreworded in the KPI appendix. Documentation-clarity only; no engineering impact.

## C-6 — LOW — Governance inversion and dangling references

`AGENTS.md`/`CLAUDE.md` roles inverted relative to `Xspeeria_Master_Prompt_Python_Backend.md` §HOW TO USE and §17 (§5 above). Normative cross-references to a nonexistent `SECURITY.md` and a 12-line `ARCHITECTURE.md` (§12 above).

---

# 14. MISSING DECISIONS

Ordered by severity. Each requires explicit human approval before dependent implementation may begin.

### Decision 1 — **APPROVED AND RECONCILED 2026-08-18** — Which transaction/settlement state machine is canonical?

**Resolved by ADR-001 (DEC-003).** A four-concern model: `SettlementLeg` (9 states) authoritative for per-leg financial facts; `Settlement.phase` (10 forward-only phases) for workflow decisions only; and separate entities for compliance holds, disputes and reconciliation exceptions. Six governance parameters were explicitly deferred rather than assumed — see ADR-001 §11.


Five authoritative documents define five incompatible state models (C-1). Four of the five cannot represent a single-sided escrow funding condition, which Appendix D §15 makes the platform's hardest prohibition. Blocks Phases 5, 6, 7, 8 and every financial test case in backend spec §14. **No money-touching code can be written until this is decided.**

### Decision 2 — CRITICAL — What is the actual security baseline document?

The designated baseline (`Xspeeria_Security_Master_Audit.md`) is an audit prompt containing no normative controls, carrying scope language from another product (S-1). Real requirements are split across three documents that contradict each other (C-2) and that `DOCUMENT_INDEX.md` §9 does not designate. Sub-decisions: MFA scope and permitted factors; whether PostgreSQL RLS is required or application-layer authorization is sufficient (S-2); whether the organization/tenant model exists in MVP and how it is scoped in the data contract (S-3). Blocks Phases 1, 2, 13 and the §11 security architecture.

### Decision 3 — HIGH — Is the NGN⇄GBP pilot corridor real, and who sources the UK-side content?

The corridor decision is made; the substrate is not (C-3). No UK banking-partner requirements, no UK/FCA regulatory posture, no UK GDPR/ICO retention analysis, no GBP SLA targets exist. `CORRECTIONS_v3.md` states this openly. Either the UK-side research is commissioned, or the pilot corridor reverts, or the documents are explicitly marked corridor-agnostic pending Legal. Blocks Phases 7 and 15, and constrains Phase 2 (KYC provider must cover the chosen corridor).

### Decision 4 — HIGH — Is Xspeeria's regulatory posture confirmed by Legal before settlement work begins?

`07_Banking_Integration_Specification_v1.1.md` Appendix A states plainly that the domestic-only escrow model *"does not, by itself, remove Xspeeria's own likely need for money-transmission-equivalent registration as the orchestrating party."* The platform is described as "wallet-less" and "non-custodial" throughout, yet the design routes both legs through partner-held escrow accounts. Whether that distinction holds is a legal determination no document in this repository is competent to make. `DOCUMENT_INDEX.md` §10 requires `HUMAN / LEGAL / COMPLIANCE VERIFICATION REQUIRED` here. Blocks Phase 7 and all partner conversations.

### Decision 5 — **APPROVED AND RECONCILED 2026-08-18** — Event-sourced ledger or current-state entity model?

**Resolved by ADR-002 (DEC-004).** Three evidence/truth stores plus a separate append-only double-entry ledger scoped to Xspeeria's own economic activity. Customer principal movements never create real-book entries; no customer wallet or balance table exists under any configuration. Eleven accounting-policy determinations (P-1 … P-11) were explicitly deferred rather than assumed. ADR-001 unchanged.


C-4. The TDS resolves this (events are source of truth, `status` columns are projections); the API contract and backend spec do not state it. Without an explicit ruling, an implementer working from the API contract alone builds the model Appendix D §7 and §14 prohibit. Cheap to decide now, expensive to retrofit after Phase 6. Blocks Phase 3 database design.

---

# 15. RISKS

| ID | Risk | Severity | Basis |
|---|---|---|---|
| R-1 | One-sided escrow release — a party's funds released while the counterparty leg is unfunded | **CRITICAL** | C-1; four of five state models cannot represent the condition Appendix D §15 prohibits |
| R-2 | Implementation proceeds under whichever document the implementer happens to open first, silently choosing between conflicting authorities | **CRITICAL** | C-1, C-2, C-4; violates `CLAUDE.md` "never silently choose" |
| R-3 | Regulatory exposure from operating an unlicensed money-transmission-equivalent service | **CRITICAL** | Banking spec Appendix A, self-declared |
| R-4 | MFA gap — users transact without a second factor because the backend spec permits it and the UI assumes it | **HIGH** | C-2 |
| R-5 | Pilot corridor launched with no UK-side compliance, KYC, or banking-partner foundation | **HIGH** | C-3; `CORRECTIONS_v3.md` self-declared |
| R-6 | Cross-user data exposure — no tenant scoping in the data contract while the backend spec assumes organizations | **HIGH** | S-3 |
| R-7 | Every CI quality and security gate is documentation-only; first merge is ungated | **MEDIUM** | §11; empty `.github/workflows/` |
| R-8 | Prohibited balance/current-state model built from the API contract | **MEDIUM** | C-4 |
| R-9 | No version control — no audit trail, no rollback, no review gate on documentation changes | **MEDIUM** | Not a git repository |
| R-10 | Stub documents cited as authority produce under-specified implementation | **LOW** | §3 |

---

# 16. DEPENDENCY / IMPACT MAP

```
Decision 4 (Legal/regulatory posture)
   └─> gates all partner engagement, Phase 7 Settlement, Phase 15 Launch

Decision 3 (Corridor + UK substrate)
   ├─> Phase 2 KYC provider selection (corridor coverage)
   ├─> Phase 7 Settlement (which partners, which rails)
   └─> Compliance Manual, Banking Spec §3.1/§4/§8/App.A, TDS

Decision 1 (Canonical state machine)          <-- CRITICAL PATH
   ├─> Phase 5 Matching        ├─> Phase 6 Transaction Engine
   ├─> Phase 7 Settlement      ├─> Phase 8 Risk & Compliance
   ├─> API contract Settlement/Transaction ENUMs + RES_409 semantics
   ├─> DB CHECK constraints (TDS line 583)
   ├─> All 15 mandatory financial test cases (backend spec §14)
   └─> Decision 5 (event vs projection shape follows from state model)

Decision 2 (Security baseline)
   ├─> Phase 1 Auth (MFA scope, factors)
   ├─> Phase 2 KYC       ├─> Phase 13 Business Accounts (tenant model)
   ├─> DB design (RLS or not) --> also gated by Decision 5
   └─> Security review gate in every phase

Decision 5 (Ledger model)
   └─> Phase 3 Currency & FX Core --> Phase 6 --> all money persistence
```

**Critical path: Decision 1.** Decisions 1 and 5 are coupled and should be taken in that order. Decisions 3 and 4 are externally blocked (Legal/Compliance) and should be started in parallel *now*, since they have the longest lead time and gate the launch phases.

---

# 17. RECOMMENDED REMEDIATION

**Stage A — Decisions (no code).** Resolve Decisions 1–5 in the order 1 → 5 → 2 → 3 → 4, recording each as an ADR under `docs/adr/` per backend spec §19. Open 3 and 4 with Legal immediately in parallel — they are the long poles.

**Stage B — Reconciliation (documentation only).** Propagate each approved decision to every affected document; add a state-mapping table if any legacy vocabulary is retained; add an explicit `DOCUMENT_INDEX.md` clause resolving primary-vs-primary conflicts so C-1 cannot recur.

**Stage C — Governance repair.** Initialize git before any further documentation edits (R-9). Promote the five stub documents to real specifications or demote their authority in `DOCUMENT_INDEX.md`. Create `SECURITY.md` or repoint the dangling references. Resolve the `AGENTS.md`/`CLAUDE.md` inversion.

**Stage D — Phase 0 scaffold.** Only after A–C: scaffold per backend spec §5 including `tests/unit/`, land `pyproject.toml`, `pre-commit`, and the five-gate CI workflow **before** the first feature commit, so no code is ever merged ungated.

---

# 18. VERDICT

## NO-GO

Implementation must not begin.

This is a documentation-conflict blocker, not a quality judgment — the documentation set is strong, and the financial and security intent behind it is better than most pre-implementation fintech projects achieve. But five authoritative documents define five incompatible financial state machines, and four of them cannot express the invariant that prevents releasing one party's funds while the other leg is unfunded.

`CLAUDE.md` and `DOCUMENT_INDEX.md` §1 both require a stop here. Proceeding would mean silently choosing between conflicting authoritative requirements, which is the one thing the constitution prohibits without exception.

**Re-audit after Decisions 1–5 are approved and Stage B reconciliation is complete.**

---

**Evidence note.** Every claim above is grounded in a file path and, where applicable, a line number. No control is marked implemented or verified. All implementation-facing findings are `DOCUMENTED BUT NOT IMPLEMENTED` or `UNKNOWN — NOT VERIFIED`, because the repository contains no application code.
