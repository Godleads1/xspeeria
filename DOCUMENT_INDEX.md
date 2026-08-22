# XSPEERIA DOCUMENT INDEX

## Purpose

This document defines the authoritative documentation map for the Xspeeria repository.

Claude Code must use this index to locate requirements, determine document authority, identify conflicts, and trace implementation decisions.

Documentation is not proof of implementation.

Implementation is not proof of correctness.

Verification requires evidence.

---

# 1. GLOBAL AUTHORITY ORDER

Unless a more specific authority rule is defined below, use the following order:

1. `CLAUDE.md`
2. Explicit human-approved architecture and engineering decisions
3. `DOCUMENT_INDEX.md`
4. `docs/00-source-of-truth/`
5. Domain-specific authoritative documents under `docs/`
6. Supporting documents under `docs/`
7. `reference/`
8. Existing implementation

Existing code is evidence of implementation, not proof of requirements.

If authoritative documents materially conflict and this index does not resolve the conflict:

`STOP — DOCUMENT CONFLICT REQUIRES HUMAN DECISION`

Never silently choose between conflicting authoritative requirements.

## 1.1 Primary-versus-Primary Conflict Rule

Several documents are designated PRIMARY, each for its own domain. The authority order above does not rank two primaries against each other. When two or more PRIMARY documents materially conflict on the same subject:

1. **Do not choose.** Rank 1 (`CLAUDE.md`) and rank 2 (human-approved decisions) are the only sources that can resolve it. If neither addresses the conflict, stop and report it.
2. **Check rank 2 first.** An approved architecture decision, recorded as an ADR under `docs/adr/`, resolves the conflict for every document it names. Approved ADRs sit at rank 2 and override all PRIMARY documents on the specific subject they decide, and only on that subject.
3. **Identify the safety-bearing document.** Where a conflict concerns money, custody, authorization, or personal data, the document that imposes the *stricter* constraint is the working assumption until a human decides — never the more permissive one. This is a holding position for reporting, not a licence to proceed.
4. **Domain adjacency does not confer authority.** A document being PRIMARY for its own domain does not make it authoritative for a neighbouring domain merely because it mentions it. A banking specification describing settlement states is not thereby authoritative over the financial specification's state model.
5. **Report the conflict with evidence:** each document, its designated authority, the exact section, the conflicting text, and the material consequence of choosing each side.

### Resolved primary-versus-primary conflicts

| Subject | Conflicting primaries | Resolution |
|---|---|---|
| Transaction/settlement state model | `docs/05-financial/Appendix_D_...v1.1.md` §5 · `docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md` §8 · `docs/06-banking/07_Banking_Integration_Specification_v1.1.md` §4.3 · `docs/04-api-data/05_API_Contract_Data_Dictionary.md` Settlement/Transaction entities · `docs/03-architecture/02_Technical_Design_Specification.md` §10 | **ADR-001 (DEC-003), approved 2026-08-18** — `docs/adr/001-transaction-state-machine.md` |
| Financial event and accounting-ledger model | `docs/05-financial/Appendix_D_...v1.1.md` §7/§14 · `docs/04-api-data/05_API_Contract_Data_Dictionary.md` entities · `docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md` §7 · `docs/03-architecture/02_Technical_Design_Specification.md` §6 | **ADR-002 (DEC-004), approved 2026-08-18** — `docs/adr/002-financial-event-ledger-architecture.md` |

---

# 1.2 ARCHITECTURE DECISION RECORDS

`docs/adr/`

Approved ADRs are human-approved architecture decisions and sit at **rank 2** of the global authority order — above `DOCUMENT_INDEX.md` and above every document under `docs/`.

An ADR is authoritative only for the subject it decides. It does not extend to adjacent subjects by implication, and it does not override `CLAUDE.md`.

An ADR marked `PROPOSED` carries no authority. Only `APPROVED` ADRs bind. Superseding an approved ADR requires a new ADR and explicit human approval.

**Citation convention — numbering collision.** `docs/03-architecture/02_Technical_Design_Specification.md` §15 contains its own TDS-internal ADR-001 … ADR-006, whose numbering is independent of and collides with this register. Cite **repository ADRs by path** (`docs/adr/001-…`) and **TDS-internal ADRs as `TDS ADR-00N`**. A bare `ADR-00N` is ambiguous and must not be used. Where the two conflict on the same subject, the repository ADR governs, per rank 2 of the authority order.

| ADR | Subject | Status |
|---|---|---|
| `001-transaction-state-machine.md` | Canonical transaction/settlement state machine (DEC-003) | **APPROVED** — 2026-08-18 |
| `002-financial-event-ledger-architecture.md` | Financial event acceptance and accounting-ledger architecture (DEC-004) | **APPROVED** — 2026-08-18 |

### Accounting policy is not architecture

ADR-002 establishes **architectural requirements** for the accounting ledger — double entry, append-only history, per-currency balancing, immutable source-event reference, exact money representation, compensating corrections, posting-rule versioning, reconciliation and suspense capability, deterministic replay.

It does **not** establish accounting policy. The chart of accounts, revenue recognition, exposure recognition, loss recognition, recovery accounting, receivable/payable treatment, memorandum escrow accounting, reporting currency and FX accounting treatment are **NOT APPROVED** and remain owned by Finance, Accounting, Legal, Compliance, Product and Banking Partner as applicable.

**No accounting-policy determination may become normative through examples, sample schemas, comments, tests, seed data or implementation defaults.** Where such a determination is required, state `HUMAN / LEGAL / COMPLIANCE VERIFICATION REQUIRED` and the owning function, and proceed no further on that path.

---

# 2. BUSINESS SOURCE OF TRUTH

## Primary

`docs/00-source-of-truth/00_5-Year_Business_Plan_SOURCE_OF_TRUTH.md`

Use for:

- company vision
- business model
- strategic objectives
- target markets
- corridor strategy
- commercial strategy
- partner strategy
- growth assumptions
- long-term business direction

Financial forecasts, targets, market assumptions, and projections must not be represented as verified actual performance unless evidence establishes that status.

---

# 3. BUSINESS REQUIREMENTS

## Primary

`docs/01-business/01_Business_Requirements_Specification.md`

Use for:

- business capabilities
- business rules
- functional objectives
- stakeholder requirements
- operating requirements
- business constraints

Business requirements do not override the approved technical architecture where the requirement itself is technology-independent.

---

# 4. PRODUCT

## Primary

`docs/02-product/04_Product_Design_Specification.md`

## Supporting

`docs/02-product/PRODUCT_REQUIREMENTS_DOCUMENT.md`

Use for:

- product capabilities
- personas
- journeys
- workflows
- feature requirements
- expected user behavior
- product states
- acceptance intent

If these documents materially disagree about product behavior, report the conflict.

---

# 5. AUTHORITATIVE BACKEND ARCHITECTURE

## Human-approved architecture decision

The authoritative Xspeeria backend stack is:

- Python
- FastAPI
- PostgreSQL
- SQLAlchemy
- Pydantic
- Redis where required
- Background workers/jobs where required
- Containerized deployment where required

## Primary backend engineering specification

`docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md`

## Supporting architecture specifications

`docs/03-architecture/02_Technical_Design_Specification.md`

`docs/03-architecture/ARCHITECTURE.md`

### Backend conflict rule

If a supporting, legacy, governance, product, or reference document proposes:

- Node.js as the Xspeeria backend
- Express
- NestJS
- Supabase as the authoritative application backend
- another conflicting backend framework

that technology choice is not authoritative.

Preserve technology-independent:

- business requirements
- product requirements
- API behavior
- data requirements
- security requirements
- financial invariants
- UX requirements
- operational requirements

Do not automatically carry the conflicting backend implementation choice into the Python/FastAPI architecture.

Frontend JavaScript/TypeScript is not prohibited.

Any future change to the authoritative backend stack requires explicit human approval.

---

# 6. API AND DATA

## Primary

`docs/04-api-data/05_API_Contract_Data_Dictionary.md`

## Supporting

`docs/04-api-data/API_DATA_DICTIONARY.md`

Use for:

- API contracts
- request structures
- response structures
- domain entities
- field definitions
- validation requirements
- data relationships
- API semantics

Implementation must conform to the approved Python/FastAPI backend architecture.

Never invent undocumented provider APIs.

---

# 7. FINANCIAL CORRECTNESS

## Primary

`docs/05-financial/Appendix_D_Financial_Correctness_Settlement_Specification_Xspeeria_v1.1.md`

This document is mandatory for implementation affecting:

- money
- currency
- rates
- fees
- transactions
- settlement
- reconciliation
- reversals
- retries
- transaction states
- financial audit trails

The canonical transaction/settlement state model is defined by **ADR-001** (`docs/adr/001-transaction-state-machine.md`), which supersedes the state vocabulary in this document's Section 5 and in every other document under `docs/`. Appendix D's financial *principles* remain authoritative and unchanged.

Non-negotiable engineering principles include:

- no binary floating point for authoritative monetary state
- use appropriate decimal/fixed precision
- server-side financial validation
- explicit transaction states
- controlled state transitions
- idempotency where applicable, keyed to include `leg_id` for any settlement-scoped operation
- duplicate/retry handling
- reconciliation, which never rewrites financial state
- auditability
- separation of financial facts, workflow state, compliance holds, disputes and reconciliation exceptions

Financial implementation must be independently reviewed before production readiness can be claimed.

---

# 8. BANKING AND PAYMENT INTEGRATIONS

## Primary

`docs/06-banking/07_Banking_Integration_Specification_v1.1.md`

Use for:

- banking integration architecture
- settlement provider interaction
- payment-provider interaction
- provider credentials
- outbound requests
- inbound webhooks
- signatures
- retries
- idempotency
- reconciliation
- provider downtime
- duplicate events
- out-of-order events
- failure handling

External providers must be treated as untrusted external systems.

Never invent provider behavior.

Production integration details require evidence from actual provider documentation and approved credentials/configuration.

---

# 9. SECURITY

## Mandatory Security Baseline

`docs/07-security/Xspeeria_Security_Master_Audit.md`

This document is mandatory for all security-sensitive implementation.

Use for:

- authentication
- authorization
- tenant/user isolation
- database security
- RLS where applicable
- API security
- input validation
- rate limiting
- CORS
- CSRF where applicable
- XSS
- secrets
- webhooks
- file uploads
- storage
- dependency security
- business-logic abuse
- financial security
- privileged operations
- infrastructure security
- privacy
- logging
- monitoring
- incident readiness
- AI/LLM security where applicable

Security requirements must be verified against actual implementation evidence.

Never claim a control exists merely because it is documented.

---

# 10. COMPLIANCE

## Primary

`docs/08-compliance/03_Compliance_Operations_Manual_v1.1.md`

Use for documented operational requirements involving:

- KYC
- AML/CFT
- sanctions controls
- transaction monitoring
- privacy
- records
- escalation
- compliance operations

Claude must not invent regulatory requirements, licence status, legal conclusions, or compliance certifications.

Where professional validation is required, state:

`HUMAN / LEGAL / COMPLIANCE VERIFICATION REQUIRED`

Xspeeria must not be represented as holding a financial licence unless authoritative evidence establishes that status.

Where required, use:

`Subject to applicable licensing and regulatory approval.`

---

# 11. UI / UX

## Primary visual source of truth — application UI/UX

The **Xspeeria Figma** (`docs/references/figma/Xspeeria.fig` — human-provided design source,
**untracked pending a versioning decision**). Human authority, 2026-08-22. Where a document in this
section disagrees with the Figma on a **visual** matter (colour, surface, spacing, visual
hierarchy), the Figma governs. The documents below remain authoritative for screen behaviour,
flows, states, interaction detail and accessibility requirements that the Figma does not settle.

Two limits on that authority:

- The Figma contains **painted swatches, not a bound token/variable system**. Xspeeria therefore has
  **no production design-token system**, and none may be claimed. Observed values are recorded as
  **FIGMA-OBSERVED COLOURS / CANDIDATE APPLICATION TOKENS** until human approval freezes them.
- The Figma is **not** the authority for **logo/brand-asset colours**, which remain open pending
  confirmation against the original vector — see `PRODUCT.md` “Brand Commitments”.

Observed palette, the Figma Success-swatch label defect, and measured WCAG contrast findings are
recorded in `docs/09-ui-ux/DESIGN_SYSTEM.md`.

## Application flow

`docs/09-ui-ux/Xspeeria_UIUX_AppFlow_Spec_v2.md`

## Screen specification

`docs/09-ui-ux/UI_UX_SCREEN_SPEC.md`

## Design system — normative token authority

`docs/09-ui-ux/DESIGN_SYSTEM.md`

Authoritative for the application colour direction, the semantic token architecture
(PRIMITIVE → SEMANTIC → COMPONENT), status-family roles, border roles, primary interaction
states, the gold restriction, and the legacy-name mapping. **HUMAN APPROVED, 2026-08-22.**
Where another UI/UX document states a colour value or token role that conflicts with it, this
document governs. Values are **candidate production tokens, not frozen**, and no application
code exists — **IMPLEMENTATION STATUS: NOT IMPLEMENTED**. Typography is a **PARTIAL FREEZE**:
**Inter is HUMAN APPROVED as the financial/numeric face**; brand/UI typography remains **OPEN**
with Satoshi the leading candidate and **not** production-approved; Nunito Sans is **not** an
Xspeeria production standard.

## Design bible

`docs/09-ui-ux/xspeeria-design-bible.md`

Use for:

- application flows
- navigation
- screen behavior
- component behavior
- loading states
- empty states
- error states
- success states
- accessibility
- responsive behavior
- visual consistency
- design tokens
- interaction patterns

Frontend controls must never be treated as authoritative security controls.

Authorization must be enforced server-side.

---

# 12. INFRASTRUCTURE AND DEVOPS

## Primary

`docs/10-infrastructure/06_Infrastructure_DevOps_Handbook.md`

Use for:

- environments
- infrastructure
- deployment
- CI/CD
- secrets management
- logging
- monitoring
- observability
- backups
- disaster recovery
- rollback
- operational readiness

Production deployment requires explicit human approval.

---

# 13. INVESTOR MATERIAL

## Reference

`docs/12-investor/08_Investor_Board_Strategy_Book_v1.1.md`

Use for:

- investor narrative
- board strategy
- strategic communication
- fundraising context

Investor material does not override engineering, financial, security, banking, or compliance specifications.

Claims in investor material must not automatically be treated as verified implementation facts.

---

# 14. GOVERNANCE AND EXECUTION

## Corrections

`docs/13-governance/CORRECTIONS_v3.md`

Corrections must be reviewed when older documentation appears inconsistent.

## Execution Manual

`docs/13-governance/EXECUTION_MANUAL.md`

Use for approved execution processes where they do not conflict with higher-authority requirements.

## Legacy Production Master Prompt

`docs/13-governance/MASTER PROMPT #U2014 BUILD XSPEERIA MVP (PRODUCTION).md`

This document is retained as governance/legacy implementation material.

It is NOT authoritative for backend technology selection where it conflicts with the human-approved Python/FastAPI architecture.

Valid technology-independent requirements may still be extracted from it.

Do not delete or silently ignore it.

Report material conflicts.

---

# 15. REFERENCE MATERIAL

`reference/`

Reference material exists for:

- archival sources
- converted source documents
- original documentation
- comparison
- traceability

Reference material does not automatically override authoritative documents under `docs/`.

If an authoritative Markdown document materially differs from its reference source:

1. identify the difference;
2. determine whether the difference is intentional;
3. report material conflicts;
4. do not silently rewrite either document;
5. request human approval where necessary.

---

# 16. IMPLEMENTATION EVIDENCE

Existing source code is evidence of what has been implemented.

It is not automatically evidence of what should have been implemented.

When code conflicts with authoritative requirements:

- identify the conflict
- determine affected execution paths
- assess security/financial impact
- propose remediation
- do not silently redefine the requirement to match the code

---

# 17. EVIDENCE STATES

Use these states consistently:

### DOCUMENTED

A requirement or control exists in authoritative documentation.

### IMPLEMENTED

Repository evidence shows implementation exists.

### VERIFIED

Implementation has been inspected and appropriate evidence/tests support the claim.

### UNKNOWN — NOT VERIFIED

Available evidence is insufficient.

### DOCUMENTED BUT NOT IMPLEMENTED

Documentation requires the capability but implementation evidence is absent.

### IMPLEMENTED BUT NOT DOCUMENTED

Implementation exists without corresponding authoritative documentation.

### CONTRADICTION

Two materially relevant sources disagree.

Documentation is not implementation.

Implementation is not verification.

---

# 18. DOCUMENT-NOT-FOUND PROTOCOL

Before declaring a required Xspeeria document missing:

1. Search `docs/` recursively.
2. Search `reference/` recursively.
3. Check filename variations.
4. Check capitalization differences.
5. Check Markdown conversions of source DOCX/PDF documents.
6. Check `DOCUMENT_INDEX.md`.

If still missing, report:

`DOCUMENT NOT FOUND`

Include:

- requested document/path
- locations searched
- similar files discovered
- impact of the missing document
- whether work can safely continue

Never fabricate missing content.

---

# 19. REQUIREMENT TRACEABILITY

Before implementing a material feature, Claude should be able to trace:

BUSINESS REQUIREMENT  
→ PRODUCT REQUIREMENT  
→ ARCHITECTURE  
→ DATA  
→ API  
→ SECURITY CONTROL  
→ FINANCIAL CONTROL, IF APPLICABLE  
→ UI/UX  
→ TEST  
→ OBSERVABILITY  
→ DOCUMENTATION

If a critical link cannot be established:

`UNKNOWN — NOT VERIFIED`

Do not invent the missing requirement.

---

# 20. RELEASE AUTHORITY

Documentation alone can never establish production readiness.

Production readiness requires evidence for:

- requirements
- implementation
- architecture
- security
- authorization
- financial integrity
- tests
- dependencies
- migrations
- monitoring
- logging
- backups
- recovery
- rollback
- documentation
- unresolved risks

The final release gate must use the Xspeeria production-readiness process.