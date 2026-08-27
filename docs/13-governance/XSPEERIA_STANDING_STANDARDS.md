# XSPEERIA STANDING STANDARDS

**Status:** HUMAN-RATIFIED STANDING STANDARD
**Ratified:** 2026-08-27
**Applies to:** all Xspeeria work — backend, frontend, mobile, admin, infrastructure, documentation and governance.

---

# 1. Purpose and Authority

This document is the single standing reference for Xspeeria's non-negotiable product,
security, architecture, vendor, evidence and human-approval constraints. It exists so that
a constraint decided once by a human is not re-litigated, silently weakened, or lost
between batches.

## 1.1 Where this sits in the authority order

`DOCUMENT_INDEX.md` §1 defines the global authority order. A human-ratified standing
standard recorded in this document is an **explicit human-approved architecture and
engineering decision**, and therefore sits at **rank 2** — below `CLAUDE.md`, above
`DOCUMENT_INDEX.md` and above every document under `docs/`.

This document does **not** override `CLAUDE.md`, and it does not override an approved
repository ADR on the specific subject that ADR decides. Where this document records a
reconciliation that supersedes older text, the superseding decision is named inline with
its approval date.

## 1.2 Conflict rule

If any repository document conflicts with a human-ratified standing standard recorded
here:

`STOP — DOCUMENT CONFLICT REQUIRES HUMAN DECISION`

Surface the conflict with evidence — each document, its designated authority, the exact
section, the conflicting text, and the material consequence of choosing each side. Never
silently choose.

## 1.3 Citation convention

Per `DOCUMENT_INDEX.md` §1.2, repository ADRs are cited **by path** (`docs/adr/001-…`) and
TDS-internal ADRs as **`TDS ADR-00N`**. A bare `ADR-00N` is ambiguous and must not be used
in Xspeeria documentation.

## 1.4 What this document is not

It is not a status report, not a claim of completeness, and not evidence that any control
is implemented or verified. Section 5 governs how evidence is classified.

---

# 2. Product and Custody Truth

These statements are non-negotiable and may not be softened, reinterpreted, or worked
around by any implementation, document, vendor selection, or marketing surface.

## 2.1 Custody

**XSPEERIA CUSTOMER-FUND CUSTODY: NONE.**

Xspeeria:

- does **not** hold customer cash
- does **not** provide a customer wallet
- does **not** maintain stored customer balances
- is **not** a bank
- is **not** a custodian
- is **not** a crypto exchange

## 2.2 What Xspeeria is

Xspeeria is a **walletless peer-to-peer fiat currency exchange marketplace**. It connects
verified participants with complementary currency needs.

Settlement occurs through **applicable regulated banking/payment partners**.

Where product, regulatory, or partner capability is described, use where appropriate:

> *Subject to applicable licensing and regulatory approval.*

## 2.3 Prohibited redefinition

Xspeeria must not be rewritten into a stored-value, wallet, escrow-wallet, or custody
product. Any proposal that introduces stored customer balances or fund custody is a
product-identity change requiring explicit human approval and regulatory review — it is
never an implementation detail.

---

# 3. Domain Separation

The following concerns are distinct and **must not be conflated** in schema, API, service
code, events, or documentation:

1. Offer / marketplace intent
2. Match / accepted allocation
3. Regulated-partner settlement instructions / reference / account
4. Beneficiary / payout destination
5. Transaction coordination state
6. Settlement truth
7. Payout execution
8. Ledger / reconciliation truth

## 3.1 Canonical chain

```
Offer
  -> Match               0..n
    -> Transaction       1 per Match
      -> Settlement      1
        -> SettlementLeg     exactly 2
          -> PayoutExecution 0..n per leg
```

**`PayoutExecution` children are not additional `SettlementLeg`s.** A leg always has
exactly one counterpart leg; payout children distribute a single leg's payout across
validated destinations and never change the leg count.

---

# 4. Security Master Baseline

## 4.1 The standing baseline name

**"Xspeeria 43+ Security Standard"** is preserved as the standing baseline **name and
concept**. The `+` is load-bearing: it always meant *at least* that set, never *exactly*
that set.

## 4.2 The current checklist extends the baseline

The canonical security checklist is `docs/07-security/Xspeeria_Security_Master_Audit.md`.

**Counted at main `f5ebc12` (2026-08-27):** the document contains **112 checklist control
entries** across 25 control-family sections (A–Y).

> **EVIDENCE NOTE.** The literal string "43" does not appear in the current repository as a
> control count — a repository-wide search for `43+`, `43 Security`, `43-point` and
> `43 control` across all Markdown returns no match at `f5ebc12`. The 43+ baseline is
> therefore recorded here as a **standing governance concept inherited from Xspeeria's
> earlier security posture**, not as a currently enumerated in-repo list. It is preserved
> as the floor, not the ceiling.

## 4.3 Standing rules for the checklist

- The historical **43+ baseline remains the standing baseline name and concept**.
- The expanded current checklist **extends** that baseline.
- **Newer controls must not be deleted merely to match the historical count.** Reducing the
  checklist back toward 43 entries is a material security-control relaxation and requires
  explicit human approval under §12.
- **Unchecked controls are NOT proof that controls are absent.** An unchecked box means
  *unassessed or unrecorded*, not *missing*.
- **Checked controls are NOT automatically production-verified.** A checked box records a
  claim; §5 governs what turns a claim into verified evidence.
- **Evidence is required before calling a control verified.**

## 4.4 Control families that must remain covered

The standing standard covers the full current control families. None may be dropped:

| Family | Coverage |
|---|---|
| Secrets management | Hardcoded secrets, secret rotation, startup validation |
| Environment-variable safety | Environment files, public environment variables |
| Logging redaction | Secrets and sensitive payloads never logged |
| Authentication | Middleware, default-deny, JWT validation, OAuth, account enumeration |
| Session security | Session lifetime, invalidation, fixation |
| MFA | Qualification and enforcement |
| Authorization | Role enforcement, privilege escalation, IDOR/BOLA, horizontal and vertical access control, tenant isolation, ownership changes |
| Database security | RLS and RLS policies, `WITH CHECK`, identity source, service role, storage policies, SQL injection, `SECURITY DEFINER`, database functions |
| API validation | Server-side validation of all client input |
| API authentication | Per-endpoint authentication enforcement |
| API authorization | Per-endpoint server-side authorization |
| Rate limiting | Per-principal and per-endpoint limits |
| Output filtering | Response shaping; no over-disclosure |
| Resource limits | Request size, pagination, query cost |
| Business logic controls | Invariants, state machines, replay and race conditions |
| Payment / settlement controls | Financial correctness, idempotency, reconciliation, partner evidence |
| AI controls | Advisory-only posture, prompt-injection resistance, output trust boundaries |
| Supply-chain security | Dependency and provenance controls |
| Abuse / availability controls | Rate limiting, abuse detection, resilience |
| Browser / web security | CORS, CSRF, frontend security |
| File / storage security | Upload validation, storage access control |
| Infrastructure security | Deployment, SSRF, command/code/template injection, path traversal |
| Observability | Logging, monitoring, incident response |
| Privacy | Data protection, minimization, retention |
| Auditability | Audit logs, admin and internal function traceability |

## 4.5 Prohibited claim

**Never state "Xspeeria security is complete."** No document, commit message, PR
description, report, or status line may assert completed security. State the evidence class
instead (§5).

Do not invent evidence for controls that have not been verified.

---

# 5. Evidence Classification

Every security, architecture, or financial claim carries an explicit evidence state.

| State | Meaning |
|---|---|
| **HUMAN APPROVED SUBSTANCE** | A human approved the rule, behaviour, or semantics. The public identifier may still be unratified. |
| **HUMAN-RATIFIED IDENTIFIER** | A human ratified the exact public identifier. Ratified identifiers are introduced **verbatim**, alongside the code path that raises them. |
| **AI-IDENTIFIED OPEN ISSUE** | An automated or assistant review found a candidate issue. Not self-ratifying; carries no authority until a human rules. |
| **AI RECOMMENDATION** | A proposed course of action. Not a decision. |
| **IMPLEMENTED CONTROL** | Code exists in the repository. Implementation is not verification. |
| **VERIFIED CONTROL** | Direct evidence exists that the control works as specified — named test, named scan, named run, or named human verification. |
| **UNKNOWN — NOT VERIFIED** | No evidence available. Say this rather than guessing. |

## 5.1 Rules

- Approval of **semantics** and ratification of an **identifier** are two different
  approvals and must not be blurred.
- CI success is **IMPLEMENTED**-class evidence at best. It is never **VERIFIED CONTROL**
  for production security.
- An assistant's finding never promotes itself to a decision.
- If evidence is unavailable, write `UNKNOWN — NOT VERIFIED`.

---

# 6. PostgreSQL Money-Path Authority

**HUMAN-APPROVED / REAFFIRMED, 2026-08-27.**

**PostgreSQL is the sole authoritative consistency mechanism for Xspeeria's money path.**

## 6.1 Offer acceptance

- PostgreSQL `SELECT ... FOR UPDATE` on the authoritative `Offer` row is the
  **serialization authority**.
- **One PostgreSQL transaction** is the atomic acceptance boundary.
- Authoritative remaining/matched capacity is maintained **under the Offer row lock**.
- Idempotency is **persisted in PostgreSQL**.
- Uniqueness constraints participate in correctness.
- **Redis is not required for financial correctness.**

## 6.2 Redis prohibitions

Redis **MUST NOT** be:

- the primary acceptance lock
- authoritative Offer-capacity state
- authoritative transaction state
- authoritative settlement state
- authoritative money-path idempotency state
- an additional correctness authority

## 6.3 Permitted later, non-authoritative use

If Redis is adopted later it may be used **only** for non-authoritative purposes:

- cache
- rate limiting
- queues / broker where appropriate
- performance optimization

## 6.4 Failure rule

Redis failure must not:

- enable double allocation
- change authoritative capacity
- change settlement truth
- change transaction truth
- change financial correctness

## 6.5 Superseded documentation

TDS §9.3 and **TDS ADR-004** language making Redis/Redlock the primary concurrency
authority is **SUPERSEDED**. No alternative Redis architecture is introduced by this
supersession. See §9(A) for the reconciliation record.

---

# 7. Offer Acceptance Invariants

## 7.1 Canonical acceptance and idempotency order

The approved **Offer-only** acceptance boundary:

1. Authoritative Offer-capacity serialization
2. `Idempotency-Key` binding resolution / lookup
3. Replay / conflict decision
4. Authoritative `remaining_amount` read — **NEW request only**
5. `accepted_amount` validation — **NEW request only**
6. Establish original idempotency record
7. `accepted_at`
8. `server_order_key`
9. `Match` creation
10. Offer capacity update
11. Response binding
12. Commit

**Same valid retry** must:

- return the original result
- **not** consume capacity twice
- **not** create a second `Match`
- **not** revalidate capacity in a way that causes its own prior `Match` to make the retry
  fail

## 7.2 Rate rules

A seller rate must satisfy:

```
rate > 0  AND  rate <= applicable approved reference ceiling
```

| Condition | Outcome | Evidence state |
|---|---|---|
| Rate `<= 0` | **INVALID** — `VAL_422_RATE_NOT_POSITIVE` | HUMAN-RATIFIED IDENTIFIER |
| Positive rate above the applicable approved reference ceiling | **HARD BLOCK** | HUMAN APPROVED SUBSTANCE |

The two conditions are disjoint.

- Above-ceiling **semantics are approved**.
- The above-ceiling **public identifier remains formally tracked separately** and its
  ratification status must not be silently changed.
- **Do not reintroduce a symmetric ±15% band.** There is no approved reference-rate floor
  and no symmetric band.
- Reference provider, cadence, staleness policy and unavailable behaviour remain
  **OPEN/configurable** (§15).

## 7.3 Insufficient remaining

**HUMAN-RATIFIED IDENTIFIER: `RES_409_INSUFFICIENT_REMAINING`.**

Condition: `accepted_amount > authoritative remaining_amount`.

The system must **never**:

- clamp
- silently resize
- take whatever remains
- partially fill without explicit request

`accepted_amount` is **REQUIRED**.

## 7.4 Offer status enum

The canonical `Offer` status enum is exactly:

- `open`
- `partially_matched`
- `fully_matched`
- `withdrawn`
- `cancelled`
- `expired`

**Do not add `paused` as a persisted Offer status.**

### `withdrawn` semantics

`withdrawn` means the owner intentionally closes **only the still-unmatched remainder**.

It:

- prevents further acceptance
- **preserves existing Matches**
- **preserves Transaction/Settlement state**
- does **not** cascade-cancel matched allocations
- is **not** equivalent to `cancelled`
- is **not** equivalent to `expired`
- is **not** equivalent to `fully_matched`

## 7.5 `matched_amount` invariant

All amounts are **integer minor units**.

```
original_amount = matched_amount + remaining_amount
```

Canonical `matched_amount` consists of:

1. **Active committed allocations** that are currently valid and not expired, released, or
   otherwise terminated pre-funding

**PLUS**

2. **Successfully completed allocations**

Each allocation is counted **exactly once**.

- Expired/released pre-funding allocations **return capacity to the remainder**.
- Historical `Match` rows remain **audit history**.
- **Do not calculate `matched_amount` as `SUM(all historical matches)`.**

## 7.6 Server ordering

Acceptance priority within an Offer:

- **primary:** `accepted_at ASC`
- **tie-break:** `server_order_key ASC`

`server_order_key` is server-generated, unique, orderable, immutable, and **never client
supplied**. A PostgreSQL sequence/identity is acceptable and **gaps are acceptable**.

## 7.7 Two-window / funding readiness

```
TRANSACTION_ELIGIBLE
  = approved KYC
  + qualifying MFA
  + account permitted to participate

ALLOCATION_FUNDING_READY
  = TRANSACTION_ELIGIBLE
  + Match exists
  + required beneficiary destination(s) selected and validated
  + all requirements applicable to allocation satisfied
```

- Funding instructions must **NOT** be provisioned before `ALLOCATION_FUNDING_READY`.
- The funding window begins **only after partner instructions are activated**.
- Authoritative `FUNDED` state must come from **authenticated / signature-verified
  regulated-partner evidence**.
- A client "I paid" claim is **advisory only**.

## 7.8 Confirm-funds processing order

Canonical endpoint:

```
POST /v1/settlements/{settlement_id}/confirm-funds
```

`leg_id` is **required**.

Processing order:

1. Resource binding validation
2. Authorization
3. Idempotency evaluation
4. Advisory claim operation

| Situation | Outcome |
|---|---|
| Invalid `settlement_id`/`leg_id` relationship | `RES_404_NOT_FOUND` — **STOP** |
| Valid relationship, wrong funding party | `AUTH_403_FORBIDDEN` — **before idempotency** |

After an invalid resource binding, do **not** perform idempotency lookup or write,
authorization, or the claim.

> **Security rule.** Unauthorized callers must not learn whether an idempotency key exists
> or how it is bound.

## 7.9 `MatchConfirmed` compatibility rule

`MatchConfirmed` is currently retained as a **NAME / ROUTING compatibility alias only**. It
refers to the acceptance-time occurrence.

It does **NOT**:

- create a second bilateral confirmation step
- authorize funding
- authorize settlement provisioning
- authorize instructions

`ALLOCATION_FUNDING_READY` remains the funding-readiness gate. The
`MatchConfirmed` → `MatchCreated` rename remains **OPEN** (§15) and must not be silently
performed.

## 7.10 FXRequest

- **Canonical:** `POST /v1/fx-requests`
- **Historical/compatibility alias:** `POST /v1/requests`

**FXRequest must never be the capacity serialization authority.** Acceptance serializes on
the Offer. Do not invent buyer-side desired-rate/reference policy. R5-9 (active MVP flow vs
compatibility-only) remains **OPEN** (§15).

---

# 8. Settlement and Payout Invariants

## 8.1 Leg count

A `Settlement` has **exactly 2 `SettlementLeg`s**.

## 8.2 SettlementLeg authoritative money binding

Every `SettlementLeg` carries a complete, immutable monetary interpretation:

- exact integer minor amount
- `currency`
- `scale`
- `currency_def_version`

## 8.3 PayoutExecution

`PayoutExecution` is **0..n per `SettlementLeg`**, and is an **authoritative persisted
monetary child**.

All `PayoutExecution` children of a leg share:

- the same currency semantics
- the same applicable scale
- the same applicable currency definition

**No hidden FX inside the payout child.**

## 8.4 Aggregate state gates

- **Release authorization requires BOTH legs `FUNDED`.**
- **`SettlementCompleted` requires BOTH legs `PAID_OUT`.**

## 8.5 Mixed irreversible payout aggregate-state semantics — OPEN

These semantics are **not redefined here**. They remain **OPEN** and are a **production
blocker for the affected recovery semantics**. No implementation may derive leg state or a
phase transition from child payout records until they are resolved.

## 8.6 Recovery / exposure

`RecoveryRequired` remains an **event**.

**Keep:** `settlement_id`, `leg_id`.

**Do NOT require:** `outstanding_exposure_amount`, `outstanding_exposure_amount_minor`.

**Do not invent:** exposure calculation, exposure currency, leg-selection rule, netting
rule, conversion rule, or mixed-payout recovery semantics.

`docs/adr/002-financial-event-ledger-architecture.md` exposure wording remains a
**reconciliation issue** until properly aligned. It is **not** resolved by this document.

## 8.7 KYC authoritative model

- **Canonical:** `KycCase` (conceptual) → `KYCCases` (persisted/API authority)
- `KYC_PROFILES`, if retained, is **summary/projection only** — never a second
  authoritative KYC workflow.
- **Canonical Data Dictionary field spelling is authoritative.** Align TDS naming to the
  canonical dictionary.
- Do not invent new KYC schema semantics.

---

# 9. Human-Approved Documentation Reconciliations

The following reconciliations were human-decided during PR #6 review (merged as `f5ebc12`,
2026-08-27) and are recorded here as standing rulings.

## A. Redis/Redlock vs PostgreSQL authority

**Ruling:** PostgreSQL is the sole money-path consistency authority (§6). TDS §9.3 and
**TDS ADR-004** Redis/Redlock-primary language is **SUPERSEDED**. PostgreSQL row locking is
the authoritative mechanism; Redlock is not required for correctness; Redis is not a hard
dependency for matching correctness; Redis is not the primary money-path serialization
mechanism.

**Required completion:** **before Batch 4.1E.**

## B. Transaction monetary fields

**Ruling:** `Transaction` does **NOT** own authoritative monetary facts.

Canonical `Transaction` persistence shape remains conceptually:

- `id`
- `match_id`
- `status`
- `created_at`

The following must **not** be added to `Transaction` merely because an older TDS ERD
contained them: `amount_minor`, `fee_amount_minor`, `currency`, `scale`,
`currency_def_version`.

Those monetary fields are reconciled out of the Transaction ERD. **Fee ownership is not
invented.** Fee semantics remain a separate future design decision if required (§15).

## C. PayoutExecution `currency_def_version`

**Ruling:** `PayoutExecution` is an authoritative persisted monetary child. Its money
binding must contain `amount_minor`, `currency`, `scale`, **and `currency_def_version`**.

`currency_def_version` **must be explicitly persisted on `PayoutExecution`**, not left as
recoverable parent prose. The binding must remain consistent with the parent
`SettlementLeg`.

**The precise enforcement mechanism is deliberately not decided here.** CHECK constraint vs
composite foreign key vs service/database enforcement is for the affected persistence batch
to design, consistent with this contract.

## D. ReconciliationException strict `iff`

**Ruling:** the **strict `iff`** rule applies.

- If **BOTH** monetary amounts are NULL → `currency`, `scale` and `currency_def_version`
  **MUST all be NULL**.
- If **EITHER** monetary amount is non-null → `currency`, `scale` and
  `currency_def_version` **MUST all be non-null**.

Wording stating these binding fields *"may"* be null when both amounts are null is
**superseded**. No `ReconciliationException` persistence implementation is required by this
ruling.

## E. KYC_DOCUMENTS canonical naming

**Ruling:** canonical Data Dictionary spelling — `document_type`, `storage_uri` — is
authoritative. TDS ERD naming is aligned to it. No new KYC schema semantics are introduced.

## F. Stale §4.4 / §4.5 references

**Ruling:** editorial only. `SYS_*` catalogue references must point to the **System-error**
section (§4.5), not Resource State (§4.4). Identifier semantics are unchanged.

---

# 10. Vendor / Architecture Framework

## 10.1 Classification

| Tier | Vendors |
|---|---|
| **CURRENT / STRONG FIT** | GitHub · Cloudflare · Vercel · PostgreSQL · Sentry · Resend · Claude |
| **CONDITIONAL — REQUIRES DECISION OR APPROVAL** | Clerk · Supabase · Stripe |
| **USEFUL LATER WITH STRICT LIMITS** | PostHog · Upstash |
| **NOT NEEDED FOR CURRENT MVP** | Pinecone |

## 10.2 Per-vendor rules

### GitHub — current / strong fit

Source control, PRs, CI, security scans, audit trail.

> **CI success does not equal production or security verification.**

### Cloudflare — current / strong fit

Strongly recommended for DNS, CDN, WAF, DDoS protection, bot controls, and edge rate
limiting.

It does **not** replace application authentication, backend authorization, transaction
controls, or business invariants.

### Vercel — current / strong fit

Strong fit for the marketing site and the admin Next.js surface.

**Never:**

- store authoritative financial state in frontend logic
- expose secrets through public environment variables

### PostgreSQL — current / strong fit

**Mandatory authoritative database and money-path consistency authority** (§6).

### Sentry — current / strong fit

Strongly recommended, with **strict scrubbing**.

**Never send:** passwords, tokens, partner credentials, bank credentials, KYC documents,
full sensitive financial payloads, secrets.

### Resend — current / strong fit

Candidate for transactional email. Never expose API keys or sensitive payloads.

### Claude — current / strong fit

**Engineering assistant only.**

Claude must **never**:

- authorize settlement
- move funds
- approve high-impact financial actions autonomously
- override human governance decisions
- become a financial truth authority

### Clerk — conditional

Strong authentication candidate, but **NOT approved for implementation until Decision 2 is
formally resolved**.

> An authentication provider does not replace backend authorization.

### Supabase — conditional

May host managed PostgreSQL. However:

**Mobile/web must NOT directly mutate authoritative financial/domain tables.**

The desired architecture remains:

```
Client -> FastAPI -> domain/service layer -> SQLAlchemy -> PostgreSQL
```

Do not blindly combine Supabase Auth with Clerk or another primary identity provider.

### Stripe — conditional

Candidate regulated payment/settlement infrastructure partner **only after** commercial
approval, corridor approval, regulatory/legal review, and technical approval.

**Do not state Stripe is an approved Xspeeria partner unless it actually is.**
Provider-neutral abstraction must be preserved.

### PostHog — useful later, strict limits

Later only, privacy constrained.

**Do not send:** KYC data, BVN/NIN/passport information, bank/payment credentials, partner
secrets, sensitive financial payloads.

### Upstash — useful later, strict limits

Later, **non-authoritative only**. May serve cache, rate limits, queue/broker roles, and
performance.

**Must NOT hold:** Offer capacity, authoritative financial idempotency, settlement truth,
transaction truth, or the authoritative acceptance lock.

### Pinecone — not needed for current MVP

Future AI/search only, after security and privacy review.

---

# 11. Vendor Evidence Principle

**No vendor feature automatically satisfies an Xspeeria security control.**

For example:

> "Cloudflare WAF enabled"

does **NOT** automatically mean:

> "application security verified."

**Each control requires direct evidence** under §5. A vendor capability is at most
`IMPLEMENTED CONTROL`-class evidence for the specific control it actually covers, and only
once its configuration has been observed.

---

# 12. High-Impact Human Approval Gate

**Standing rule.** Explicit human approval is required before:

- destructive operations
- irreversible operations
- financial-state changes
- settlement-state changes
- credential changes
- permission changes
- production deployment
- secrets rotation
- regulatory/compliance assertions
- vendor adoption that changes architecture
- material security-control relaxation
- destructive database migration
- merge where human review is required

**AI recommendations are not self-ratifying.**

---

# 13. Per-PR Governance Gate

For every material PR:

1. Define scope.
2. Identify affected trust boundaries.
3. Identify security controls touched.
4. Identify product invariants touched.
5. Identify open decisions.
6. Run required tests/scans.
7. Record **actual** evidence.
8. Review CodeRabbit / automated findings.
9. Classify each finding as exactly one of:
   - true blocker
   - non-blocking finding
   - pre-existing issue
   - future-batch issue
   - human-decision item
10. Require **exact-head CI** for merge where applicable.
11. **Do not treat earlier-SHA CI as exact-head evidence.**
12. **Do not claim production verification from CI alone.**

---

# 14. New-Vendor / Dependency Gate

Before adding a new vendor or major dependency, record:

- purpose
- exact data handled
- whether authoritative state is involved
- security/privacy implications
- regulatory implications
- failure mode
- lock-in considerations
- replacement/fallback path
- secrets model
- observability impact
- cost/operational implications
- **human approval**

> **No vendor may silently become a correctness authority.**

---

# 15. Open Decisions

The following remain **OPEN**. None may be silently resolved, defaulted, or assumed by any
implementation, document, or assistant.

| # | Open decision |
|---|---|
| 1 | **Decision 2** — auth/session/MFA/password/rate-limit specifics |
| 2 | **Decision 3** — reference-rate provider, cadence, staleness, unavailable behaviour |
| 3 | **Decision 4** — regulatory/legal posture |
| 4 | Idempotency retention / TTL |
| 5 | **R5-9** — FXRequest active-MVP status |
| 6 | Buyer desired-rate/reference policy, if still unresolved |
| 7 | `MatchConfirmed` → `MatchCreated` rename |
| 8 | Mixed irreversible payout aggregate-state semantics *(production blocker)* |
| 9 | Preparation-window duration |
| 10 | Resume-vs-new preparation deadline behaviour |
| 11 | Any unratified public identifier not explicitly ratified |
| 12 | Fee ownership / fee semantics |

Governance-deferred parameters awaiting external owners (U-1, U-2, U-5, U-8, U-9, U-10 per
`docs/adr/001-transaction-state-machine.md` §11; P-1 … P-11 per
`docs/adr/002-financial-event-ledger-architecture.md` §9.2) remain open and undefaulted.

`docs/adr/002-financial-event-ledger-architecture.md` exposure wording remains an open
reconciliation issue (§8.6).

---

# 16. Change-Control Rule

## 16.1 Amending this document

A human-ratified standing standard recorded here may be changed **only** by explicit human
approval, recorded inline with its approval date and the decision it supersedes.

An assistant may **propose** an amendment. It may not ratify one.

## 16.2 Supersession

Superseded text is **marked as superseded and retained**, not deleted, so that the reason a
constraint exists survives the change. Deleting the history of a financial or security
constraint is itself a material change requiring approval.

## 16.3 Silent drift is prohibited

Do not:

- weaken a standing constraint as a side effect of an unrelated change
- reinterpret a constraint to fit an implementation
- treat an assistant's reasoning as ratification
- treat CI green as verification of a control
- resolve an open decision by choosing a default

If a standing standard blocks necessary work, **surface it and request a decision.**
