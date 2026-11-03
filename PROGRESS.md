# XSPEERIA DEVELOPMENT PROGRESS

## Current Phase

**PHASE 1 — CONTROLLED IMPLEMENTATION GO** — human decision, 2026-08-22.

Supersedes *PHASE 0 — DOCUMENTATION & ARCHITECTURE READINESS* and its blanket
implementation prohibition.

| | |
|---|---|
| **Controlled implementation** | **GRANTED** — within explicitly approved milestones only |
| **Full implementation GO** | **NOT GRANTED** |
| **Production activation** | **NOT GRANTED** |

## Current Status

**Updated 2 Nov 2026 from the merged pull requests (#18–#97).** Phase 1 controlled implementation
continues. **Production activation is NOT GRANTED**, and the readiness review of 27 Oct 2026
classifies the product **DO NOT LAUNCH**
(`docs/13-governance/PRODUCTION_READINESS_REVIEW_2026-10-27.md`). Everything below runs in
development and testing only. Money moves only against the **pretend partner bank** (ADR-037).

| Area | State | Where |
|---|---|---|
| Sign-in: phone + email codes, 6-digit PIN, lockout, sessions | **Merged** | #18, #20; ADR-024/025 |
| Second checks: face check, email codes, fingerprint unlock; PIN reset | **Merged** | #42, #47; ADR-046/048/054 |
| Identity checks (Didit) per country, two-person review of held checks | **Merged** | #32, #33, #37, #48, #80, #85; ADR-039–043/055/069/071 |
| Tiers and trade limits (Tiers 0–3) | **Merged** | #62, #63; ADR-058 |
| Offers, buy requests (multi-currency), market search, location rule, editing | **Merged** | #21, #22, #49–#61; ADR-028–030/056/059 |
| Taking an offer (Match), waiting queue, one 5-minute extension | **Merged** | #23, #24, #60; ADR-031/059 |
| Payout accounts and the 30-minute preparation window | **Merged** | #27, #28; ADR-035/036 |
| Escrow steps — **pretend bank only**, immediate payout once both paid in | **Merged** | #29–#31; ADR-037/038, DEC-044 |
| My Deals, notifications (in-app + phone push code), disputes | **Merged** | #25, #40, #43, #52; ADR-033/044/052/057 |
| Admin console: staff sign-in, roles, audit, users, disputes, reversals, outages, adverts, fraud, dashboard, bell, 7 languages, dark mode | **Merged** | #64–#84; ADR-060–070 |
| API monitoring, customer activity log, deal timeline | **Merged** | #88, #89; ADR-072/073 |
| Security review: all 17 findings fixed | **Merged** | #90 |
| Operations alerts, Sentry (off), incident plan | **Merged** | #91; ADR-074 |
| Expo SDK 58 upgrade | **Merged** | #92 |
| SBOM in CI, `/health` status only, console nonce script policy | **Merged** | #93; ADR-077 |
| Emergency controls: pause all deals, sign everyone out (SEC-039) | **Merged** | #94; ADR-075 |
| Key rotation tools (payout-account and identity keys) | **Merged** | #95; ADR-076 |
| Row-level security, the database's second lock (readiness H-3) | **Merged** | #96; ADR-078 |
| No private data without a login; less fingerprinting; no throwaway emails | **Merged** | #97; ADR-079 |
| Resend email sender, off until the account exists | **Built 2 Nov 2026** | ADR-082 |
| Shared rate limits in the database (readiness H-1) | **Built 2 Nov 2026** | ADR-080 |
| Super Admin hardware security keys (readiness H-5) | **Built 2 Nov 2026** | ADR-081 |
| "Was this you?" email for every log-in and change, with a "this wasn't me" link that freezes the account | **Built 2 Nov 2026** | ADR-084 |
| One background worker; first load test (fixed: taking an offer was refused under the row rules) | **Built 3 Nov 2026** | ADR-085 |

### Not built yet (code)

- **Delete account** (the app screen says it isn't built; nothing is deleted).
- **Real wallet / ledger**: Home and Cards show Figma demo figures in development builds only
  (ADR-023). No ledger exists (P-1/P-2 open).
- **Real SMS sender** (no provider chosen). The Resend email sender is built and waits for the account (ADR-082).
- **Fraud checks replacing the 24-hour payout hold** (FX-03) before real payouts.

### Waiting on outside parties or owner decisions

Partner bank and licence (Decision 4); hosting, backups and a secret manager; SMS provider;
Resend account and domain; Expo/Firebase push accounts; Apple and Google developer accounts and
release builds; official-rate source (Decision 3); native-speaker review of languages;
independent penetration test; GitHub plan that can protect `main`. Details and owners:
`PENDING_ACTIONS.md`.

### Status history

The milestone table below was the status as of 18–19 Oct 2026. Every "awaiting merge" entry in
it has since merged (PRs #21–#33).

| Milestone | State (as of 19 Oct 2026) |
|---|---|
| **Milestone 1** — foundation, design system, app shell | **COMPLETE** — PR #5, `a3eb4c0`, 2026-08-25 |
| **Milestone 4.1A** — Stage 4 persistence foundation | **COMPLETE** — PR #6, `f5ebc12`, 2026-08-27 |
| **Milestone 4.1B** — money primitives and currency definitions | **COMPLETE AND MERGED** — PR #8, `70f8f664aacf9f6dad7c2749dc3d39633a87f70a`, 2026-08-30. PostgreSQL verification gate **DISCHARGED** by Step 9 |
| **Step 9** — PostgreSQL behavioural verification of `currency_definitions` | **COMPLETE — HUMAN EVIDENCE ACCEPTED AND CI REPRODUCED** — PR #10, `5445d6155746a5e6ae65ce9a438be41784a97860`, 2026-08-31 |
| **GATE 4.1B-CD3** — currency-definition immutability | **DISCHARGED 2026-10-18** — Stage 1 triggers + Stage 2 runtime role built and verified (migration 0005, ADR-028); decided 2026-09-01 |
| **Milestone 4.1C** — offers | **BUILT 2026-10-18, awaiting merge** (ADR-028/029, DEC-034/035) — publish, list, edit rate, withdraw; migration 0006; offers are records of intent, not money. Acceptance/Match is the next milestone and needs its own authorization |
| **Milestone 4.1D** — taking an offer (acceptance, Match) | **BUILT 2026-10-18, awaiting merge** (ADR-031, DEC-037) — Match only; Transaction, Settlement, payout accounts and escrow are later milestones |
| **Milestone 4.1E** — payout accounts and the 30-minute preparation window | **BUILT 2026-10-18, awaiting merge** (ADR-035, DEC-041) — up to `funding_ready`; escrow, funding and payouts need the partner bank |
| **Milestone 4.1F** — escrow steps, **simulation only** (pretend partner bank on a developer's computer) | **BUILT 2026-10-19, awaiting merge** (ADR-037, DEC-043) — settlement, legs, signed partner messages, outbox, holds, reconciliation exceptions; migration 0009. No real partner (ADR-001 §12 legal gate), no ledger (P-1/P-2) |
| **Milestone KYC-1** — identity checks with Didit | **BUILT 2026-10-19, awaiting merge** (ADR-039, DEC-046) — server only; app screens next; migration 0010 |
| **Milestone AUTH-2** — server 2FA (TOTP, recovery codes, trusted devices, step-up; no money tables) | **AUTHORIZED 2026-10-18** — `docs/adr/026-auth-2-two-factor.md` (DEC-032) |
| **Milestone AUTH-1** — server sign-in (users, sessions, phone verification; no money tables) | **COMPLETE** — PR #18; **AUTHORIZED 2026-10-18** — `docs/adr/025-auth-1-server-sign-in.md` (DEC-031). Decision 2 resolved by ADR-008/024/025. |

*Historical (August–September 2026), kept as written. The milestones it says are blocked were
later authorized (18–19 Oct 2026) and merged; see the table at the top of this section.*

Application implementation may begin **only** inside an approved milestone. Domain persistence is
limited to the Milestone 4.1B approved scope — the `currency_definitions` table and the reusable
money column primitives. **No money-bearing domain table, no authoritative money-bearing foreign
key, no partner integration and no live financial behaviour is authorized.**

Two governance gates block Milestone 4.1C — **GATE 4.1B-CD3** and **Decision 2** *(Decision 2 resolved 2026-10-18 by ADR-025; CD3 still blocks, and 4.1C still needs its own authorization)*. See
**Current Blockers**. CD3's **policy and architecture are HUMAN-APPROVED (2026-09-01)**, but its
enforcement mechanism is **not implemented and not authorized**, so the gate continues to block.
**Step 9 is COMPLETE — HUMAN EVIDENCE ACCEPTED AND CI REPRODUCED** and no longer blocks. Neither
Step 9's completion nor the CD3 policy ruling is an authorization to begin Milestone 4.1C.

## Approved Architecture Decisions

### Backend

Python + FastAPI

### Primary backend engineering authority

`docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md`

## Completed

- [x] Repository documentation structure created
- [x] Claude engineering system created
- [x] 10 domain skills installed
- [x] 6 command skills installed
- [x] 5 specialist agents installed
- [x] Security/QA hooks installed
- [x] Engineering workflows installed
- [x] Security Master Audit added
- [x] Python/FastAPI selected as authoritative backend
- [x] CLAUDE.md restored and populated
- [x] AGENTS.md restored
- [x] DOCUMENT_INDEX.md created
- [x] xspeeria-test skill repaired
- [x] xspeeria-security skill hardened
- [x] xspeeria-security-check skill hardened
- [x] .gitignore populated
- [x] .env.example populated
- [x] initial repository secret scan completed with no confirmed secrets
- [x] Phase 0 audit completed (`AUDIT_PHASE0_2026-08-18.md`)
- [x] Decision 1 approved — canonical transaction/settlement state machine (ADR-001 / DEC-003)
- [x] Decision 1 document reconciliation completed
- [x] Decision 5 approved — financial event and accounting-ledger architecture (ADR-002 / DEC-004)
- [x] Decision 5 document reconciliation completed
- [x] Documentation-integrity corrections — dangling `SECURITY.md` references repointed, primary canvas set to
      `#FFFFFF`, TDS KYC vocabulary corrected (`CORRECTIONS_v3.md` §7). Closes no decision.
- [x] Application UI palette reconciled to the Figma-observed colours (`CORRECTIONS_v3.md` §8). **Partial —
      documentation only.** Values are FIGMA-OBSERVED / CANDIDATE, **not frozen production tokens**; the Figma
      has painted swatches, not bound variables, so Xspeeria has no production design-token system.
- [x] Design-system freeze Phase 1 — human decisions converted to normative documentation
      (`CORRECTIONS_v3.md` §9): application colour direction, semantic token architecture, border
      roles, primary interaction states, gold restriction, Home account-readiness structure, bottom
      navigation, mobile/admin consistency. **Documentation only — IMPLEMENTATION STATUS: NOT
      IMPLEMENTED, VERIFICATION STATUS: NOT VERIFIED.**
- [x] Typography partial freeze — **Inter HUMAN APPROVED as the financial/numeric typeface**
      (`CORRECTIONS_v3.md` §10). Documentation only; no font files added.
- [x] Canonical domain model reconciliation — documentation only (`CORRECTIONS_v3.md` §11,
      ADR-001 Amendment A1). Glossary at `DOCUMENT_INDEX.md` §2A. **No code, no migration, no new
      ADR/DEC number.**
      *HISTORICAL: this entry predates the Phase 1 controlled-implementation GO of 2026-08-22.
      The blanket implementation prohibition it originally referenced is **SUPERSEDED** — see
      **Current Phase** above and **Milestone 1 boundary — approved scope** below, which now
      carry the standing constraints.*
- [ ] Design-system freeze Phase 2 — **NOT COMPLETE.** Open: **Satoshi** brand/UI typography, blocked
      on primary licence verification, mobile-app embedding, redistribution/bundling rights, the
      licence covering the Figma-used files, web self-hosting vs CDN, specimen review and React Native
      delivery strategy; admin headings/chrome; gold rating-glyph execution; logo/brand-asset colours
      pending vector confirmation; production token freeze. See `DESIGN_SYSTEM.md`, `CORRECTIONS_v3.md`
      §9.6 and §10.
- [ ] Versioning decision for `docs/references/figma/Xspeeria.fig` (~70.1 MB) — human-provided design source,
      untracked pending decision. Not staged, gitignored or LFS-tracked.
- [x] Decision 2 — security baseline authority — **RESOLVED 2026-10-18** (ADR-008, ADR-024, ADR-025)
- [ ] Decision 3 — corridor substrate (NGN⇄GBP pilot)
- [ ] Decision 4 — regulatory posture confirmation
- [x] Architecture approved for controlled implementation — Phase 1 GO, 2026-08-22
- [x] Implementation started — Milestone 1: foundation, design system, app shell
- [x] **Milestone 1 / Phase 1 engineering foundation COMPLETE** — PR #5 squash-merged to `main`
      as `a3eb4c0`, 2026-08-25
- [x] **DECISION S4-1 — authoritative money persistence, HUMAN-APPROVED 2026-08-25.** Every
      persisted authoritative transactional monetary amount is exact integer minor units:
      `amount_minor BIGINT` + `currency CHAR(3)` + `scale SMALLINT` + `currency_def_version
      VARCHAR(32)`, immutably bound. `NUMERIC(18,2)`, `NUMERIC(20,4)` and decimal-based money are
      **withdrawn** as authoritative semantics; `NUMERIC`/`DECIMAL` survives only as an explicitly
      derived, non-authoritative presentation value with justified need. **Rates are not monetary
      amounts** and remain `NUMERIC(12,6)`. `Money(minor, currency, scale)` is unchanged;
      `currency_def_version` is carried alongside it in persistence, not added to the value object.
      Reconciled in ADR-002, TDS §6.2/§6.4 and API dict §5.
- [x] **DECISION S4-2 — Match `server_order_key`, HUMAN-APPROVED 2026-08-25.** `server_order_key
      BIGINT NOT NULL UNIQUE` — server-generated, immutable, durable, orderable, never
      client-supplied. A PostgreSQL sequence/identity is acceptable and **the value need not be
      gapless**. Canonical acceptance ordering remains `accepted_at ASC, server_order_key ASC`;
      `accepted_at` is **not** replaced as the primary criterion. Added to the API dict Match
      schema and the TDS index strategy.
- [x] **DECISION S4-3 — Stage 4 persistence/CI engineering baseline, HUMAN-APPROVED 2026-08-25.**
      PostgreSQL 16, SQLAlchemy 2.x async, asyncpg, Alembic. **SQLite must not be used** as the
      authoritative integration/concurrency database for the money path — `SELECT … FOR UPDATE`,
      uniqueness races, transactional idempotency, constraints and concurrent acceptance are tested
      on PostgreSQL only. *This approval covers engineering baseline and CI only; it resolves no
      regulatory, hosting, cloud-provider or production-deployment decision.*
- [x] **DECISION S4-4 — KYC persistence authority, HUMAN-APPROVED 2026-08-25.** Canonical KYC case
      persistence/API authority is `KYCCases` / `KycCase`. `kyc_profiles` is **summary/projection
      only** and is never a second authoritative KYC workflow. Lifecycle remains
      `pending_documents → under_review → approved | rejected`; jurisdiction-specific document
      requirements stay configuration/legal-authority driven and are not invented.
- [x] **DECISION H-2 — CI integration/concurrency environment, HUMAN-APPROVED 2026-08-25.**
      PostgreSQL 16 runs as a **GitHub Actions service container**, and that is the primary
      integration/concurrency test environment. **Testcontainers is not required on the primary CI
      path.**
- [x] **DECISION H-3 — no Redis in Milestone 4.1, HUMAN-APPROVED 2026-08-25.** PostgreSQL remains
      the single consistency authority for **Offer row locking, transactional acceptance,
      idempotency uniqueness and concurrency control**. **Redis locks and Redis-held idempotency
      state must not be introduced into the money path.**
- [x] **DECISION H-5 — Alembic migration location, HUMAN-APPROVED 2026-08-25.** Migrations live at
      the repository root in **`migrations/`**, matching
      `Xspeeria_Master_Prompt_Python_Backend.md` §191. **`backend/migrations/` must not be used.**
- [ ] **Idempotency retention/TTL — NOT DECIDED.** No expiry duration is approved. Milestone 4.1
      persists `created_at` only, with **no `expires_at` and no automatic expiry semantics**. If
      retention becomes necessary it is a separate human decision plus a future migration.
- [x] **Milestone 4.1A — Stage 4 persistence foundation COMPLETE** — PR #6 squash-merged to `main`
      as `f5ebc12`, 2026-08-27. Exact-head CI green (run 33052004233) on the merged head
      `e12ef75`; all 18 review conversations resolved. **No domain tables, no ORM models and no
      domain migration** were introduced: `Base.metadata` is empty and `0001_baseline` performs no
      schema change. **Milestone 4.1B has NOT started.**
- [x] **DECISION G-1 — PostgreSQL money-path authority, HUMAN-APPROVED / REAFFIRMED 2026-08-27.**
      PostgreSQL is the **sole authoritative consistency mechanism** for the money path.
      `SELECT ... FOR UPDATE` on the authoritative `Offer` row is the serialization authority; one
      PostgreSQL transaction is the atomic acceptance boundary; authoritative remaining/matched
      capacity is maintained under that row lock; money-path idempotency is persisted in
      PostgreSQL. **Redis is not required for financial correctness** and must never be the primary
      acceptance lock, authoritative Offer-capacity/transaction/settlement state, money-path
      idempotency state, or an additional correctness authority. Any later Redis use is
      **non-authoritative only** (cache, rate limiting, queues/broker, performance). TDS §9.3 and
      **TDS ADR-004** Redis/Redlock-primary language is **SUPERSEDED** and reconciled.
- [x] **DECISION G-2 — standing standards document ratified, HUMAN-APPROVED 2026-08-27.**
      `docs/13-governance/XSPEERIA_STANDING_STANDARDS.md` is the canonical standing reference for
      product/custody truth, domain separation, the security master baseline, evidence
      classification, money-path authority, acceptance and settlement invariants, the vendor
      framework, and the human-approval gates. It sits at **rank 2** of the `DOCUMENT_INDEX.md`
      authority order (explicit human-approved decisions). The **"Xspeeria 43+ Security Standard"**
      name is preserved as the standing baseline concept; the current checklist of **112 control
      entries** extends it and **must not be reduced to match the historical count**.
- [x] **Governance documentation reconciliation performed, 2026-08-27.** Six human-decided
      conflicts carried forward from PR #6 review are reconciled in documentation only — Redis vs
      PostgreSQL authority; `Transaction` owns no authoritative monetary facts; `PayoutExecution`
      must persist `currency_def_version`; `ReconciliationException` strict `iff`; `KYC_DOCUMENTS`
      canonical naming; stale §4.4/§4.5 system-error references. **No runtime code, ORM model or
      domain migration was changed.**
- [x] **4.1B carried-forward engineering items — BOTH RESOLVED in PR #8, 2026-08-30.**
      (1) integration fixture cached-engine/session disposal — **RESOLVED** by commit
      `96b750919d62c0bdd9b9edba998ea5fb6d20a3d9` *(fix(tests): dispose the cached engine in the
      integration session fixture)*, squashed into `70f8f66`. The `session` fixture in
      `backend/tests/integration/conftest.py` now disposes the cached engine and sessionmaker on
      teardown in a `finally`, using the application's own `dispose_engine()` rather than mutating
      module globals; R1/R2 regression coverage added in
      `backend/tests/integration/test_session_lifecycle.py`. Test-only — production
      engine/session code unchanged. The commit's `UNKNOWN — NOT VERIFIED` evidence limitation
      (no local PostgreSQL available at the time) is **discharged**: PR #8 CI executed the
      integration suite against PostgreSQL 16 with `XSPEERIA_REQUIRE_DB=1` — **74 passed, 0
      skipped**, behind the workflow's false-green guard.
      (2) Alembic migration-template Ruff/F401 friction — **RESOLVED** by commit
      `4f1518c849fadee902137597b05e21be2464b3d3` *(chore(lint): scope Ruff F401 to generated
      Alembic revisions)*, squashed into `70f8f66`. `pyproject.toml` now carries
      `[tool.ruff.lint.per-file-ignores]` with `"migrations/versions/*.py" = ["F401"]` — one
      rule, one generated directory. `migrations/script.py.mako` is unchanged and
      `migrations/env.py` remains fully linted. The precondition *"must be addressed BEFORE the
      first real generated migration is accepted"* was satisfied **before**
      `0002_currency_definitions` landed in the same merge.
- [x] **Milestone 4.1B — money primitives and currency definitions COMPLETE** — PR #8
      *feat(db): add money primitives and currency definitions*, squash-merged to `main` as
      `70f8f664aacf9f6dad7c2749dc3d39633a87f70a`, 2026-08-30. Reviewed and merged head
      `4ce8386c98d31009d6c23bec9606cf70ffb3fc9f`; the merge commit tree is **identical** to that
      head. Exact-head CI green on all three required checks — *Python Quality & Security*,
      *Node & TypeScript Quality*, *Secret Scanning & Tracked-File Guard* (run 33324328790).
      Scope, 13 files, +2022 / −29:
      **(a)** reusable money schema primitives (`backend/app/db/money.py`) and the `PersistedMoney`
      persistence binding, implementing DECISION S4-1 integer minor units;
      **(b)** the `CurrencyDefinition` ORM model (`backend/app/models/currency_definition.py`),
      registered in `Base.metadata` and in Alembic `migrations/env.py`;
      **(c)** migration `migrations/versions/0002_currency_definitions.py`
      (`down_revision = "0001_baseline"`, single head);
      **(d)** PostgreSQL-backed integration verification (`test_money_columns.py`,
      `test_migrations.py`, `test_session_lifecycle.py`) plus unit coverage
      (`test_persisted_money.py`, `test_currency_definition.py`) — 394 tests passed overall,
      integration 74 passed / 0 skipped against PostgreSQL 16;
      **(e)** the two carried-forward cleanups recorded immediately above.
      **This is the repository's first domain table, first ORM model and first domain migration —
      `Base.metadata` is no longer empty, which supersedes that statement in the Milestone 4.1A
      entry above. No money-bearing foreign key was introduced. Milestone 4.1C has NOT started.**
- [x] **STEP 9 — PostgreSQL behavioural verification of `currency_definitions` COMPLETE — HUMAN
      EVIDENCE ACCEPTED AND CI REPRODUCED**, 2026-08-31. PR #10 *test(db): verify currency
      definitions schema on postgres*, squash-merged to `main` as
      `5445d6155746a5e6ae65ce9a438be41784a97860`; reviewed head
      `16668244e58fdf5f6585e75be40ca40e478a52ed`, merge-commit tree **identical** to that head.
      PR #10 introduced **exactly one file** —
      `backend/tests/integration/test_currency_definitions_schema.py` (+626 / −0). **No production
      code, no ORM model, no schema, no migration, no dependency file, no CI configuration and no
      governance document was changed.**
      Evidence:
      **(a)** local behavioural verification against **PostgreSQL 16.15**; dedicated Step 9 suite
      **60 passed / 0 failed / 0 skipped**;
      **(b)** GitHub CI independently reproduced the verification on **PostgreSQL 16** — exact-head
      CI green on all three required checks (*Python Quality & Security*, *Node & TypeScript
      Quality*, *Secret Scanning & Tracked-File Guard*);
      **(c)** full PR-head CI suite **454 passed / 0 failed / 0 skipped**; integration suite
      **134 passed / 0 failed / 0 skipped**;
      **(d)** clean Alembic upgrade `base → 0001_baseline → 0002` (head).
      **Scope of proof — Step 9 establishes the approved `currency_definitions` PostgreSQL schema
      contract and its relevant constraints and behaviour as observed in PostgreSQL. It does NOT
      establish production readiness for Milestone 4.1C, and it resolves neither GATE 4.1B-CD3 nor
      Decision 2.** This discharges the Milestone 4.1B PostgreSQL verification gate that was
      recorded as OUTSTANDING at the 2026-08-30 checkpoint.
- [x] **DECISION 4.1B-CD3 — currency-definition immutability contract, HUMAN-APPROVED 2026-09-01.**
      The **policy and architecture are decided; the enforcement mechanism is NOT implemented and
      its implementation is NOT authorized by this ruling.** Rulings CD3-H1 … CD3-H9:
      **H1** database-level enforcement required — application-only enforcement does not discharge
      CD3; **H2** `UPDATE` absolutely prohibited; **H3** `DELETE` absolutely prohibited, referenced
      and unreferenced rows alike; **H4** `TRUNCATE` prohibited, and the protection must cover it
      explicitly rather than assume row-level `UPDATE`/`DELETE` protection reaches it; **H5**
      whole-row immutability, `created_at` included; **H6** staged database-role separation —
      Stage 1 trigger enforcement, Stage 2 a non-owning runtime role separated from the
      migration/owner role; **H7** blocked mutation attempts must be logged and alertable — a
      **CD3-specific requirement** whose implementation mechanism is **not authorized by this
      documentation decision**, with wider privileged-session / DDL logging and retention left to
      separate infrastructure and security-governance work. **This requirement designates no
      normative Security Baseline**: it does not promote
      `docs/07-security/Xspeeria_Security_Master_Audit.md` or any other document to that role, and
      **Security Baseline authority remains unresolved under Decision 2**; **H8** architecture
      **O3 — PostgreSQL trigger + privilege separation, staged** (Stage 1 trigger, Stage 2
      privileges); **H9** no routine privileged override — **no standing break-glass mutation path
      is approved**, and a future technical operation such as a required historical backfill needs
      separate explicit authorization at that time.
      **Resulting contract for `currency_definitions`:** `UPDATE` **PROHIBITED**, `DELETE`
      **PROHIBITED**, `TRUNCATE` **PROHIBITED**, `INSERT` **PERMITTED** subject to the existing
      schema constraints; historical rows are **whole-row immutable**; the correction policy
      remains **VERSION-ONLY — NEVER IN-PLACE**; **no activation concept is introduced**; the
      runtime application role must ultimately be **non-owning**.
      **Residual risk, acknowledged and not claimed away — this is not tamper impossibility.** A
      PostgreSQL **superuser** can ultimately disable or drop any database protection.
      Infrastructure-level controls, privileged-session auditing, independent reconciliation and
      immutable logging/WAL strategies remain **outside this decision** unless already governed
      elsewhere; none is approved here.
      **NOT AUTHORIZED BY THIS CD3 HUMAN DECISION.** The following are outside what this ruling
      grants; **this is a statement of what this decision does not authorize, not a permanent or
      global prohibition**, and each may be authorized separately through its own governance
      process. **This ruling does not authorize any CD3-related implementation** — no CD3
      enforcement implementation, no CD3 migration, no trigger SQL, no `GRANT`/`REVOKE`, no
      database role creation, no Stage 2 role provisioning, no CI or fixture change for role
      separation, and no CD3 enforcement verification test. **It does not create ADR-003, which
      must not be created under this ruling.** **It resolves neither Decision 2, nor S-2, nor
      S-3**, whose statuses are unchanged and recorded under **Current Blockers** — Decision 2
      **AWAITING HUMAN DECISION**, S-2 and S-3 **UNRESOLVED**. **It does not authorize Milestone
      4.1C**, which remains **NOT STARTED — NOT AUTHORIZED**, or the first authoritative
      money-bearing foreign key. **CD3 is decided, not discharged.**

## Current Blockers

**Today (2 Nov 2026):** the blockers are outside parties and owner decisions, not engineering
gates. Partner bank and licence (Decision 4), official rate (Decision 3), hosting, SMS/email,
app-store accounts, and the items in `PENDING_ACTIONS.md` §2–§4. **GATE 4.1B-CD3 is discharged
(ADR-028) and Decision 2 is resolved (ADR-008/024/025)**; the subsections below are the
historical record of how those gates stood before 18 Oct 2026.

### Gates blocking Milestone 4.1C (historical — resolved)

- **STEP 9 — DISCHARGED — NO LONGER BLOCKING.** Behavioural verification of the real
  `currency_definitions` table in PostgreSQL is **COMPLETE — HUMAN EVIDENCE ACCEPTED AND CI
  REPRODUCED** (PR #10, `5445d61`, 2026-08-31); evidence is recorded under **Completed**.
  *Historical note, retained as accurate: PR #8's green PostgreSQL CI and its integration tests
  did not by themselves discharge Step 9 — the dedicated Step 9 suite added by PR #10 does.*
  Step 9 discharges only the PostgreSQL schema-contract verification; **it authorizes nothing
  further and resolves neither gate below.**
- **GATE 4.1B-CD3 — HUMAN DECISION APPROVED 2026-09-01 — IMPLEMENTATION NOT YET AUTHORIZED —
  STILL BLOCKS THE FIRST AUTHORITATIVE MONEY-BEARING FK.** The immutability contract and the
  target architecture are now decided — **O3, PostgreSQL trigger + privilege separation, staged**.
  Rulings CD3-H1 … CD3-H9 and the resulting contract are recorded under **Completed**.
  **CD3 is decided, NOT technically discharged.** No trigger, no privilege change, no database
  role and **no CD3 enforcement verification test** exists, and **none is authorized**;
  implementation requires separate explicit human authorization. *(This concerns CD3 enforcement
  only. It does not qualify the Step 9 PostgreSQL schema verification, which is **COMPLETE —
  HUMAN EVIDENCE ACCEPTED AND CI REPRODUCED**.)* Until Stage 1 enforcement exists,
  `currency_definitions` immutability remains a **documented contract rather than an enforced
  constraint**, so this gate continues to block the first authoritative money-bearing foreign key.
  *Historical, retained as accurate: CD3 stood as **AWAITING HUMAN DECISION** from 2026-08-27
  until the human ruling of 2026-09-01. The PR #8 merge resolved nothing here, and Step 9 / PR #10
  resolved nothing here.*
- **DECISION 2 — AWAITING HUMAN DECISION.** Security baseline authority, unresolved for the
  **S-2** authorization enforcement approach, the **S-3** tenant/organization model, and MFA
  scope / security-baseline parameters. See the decision table below. **No user-scoped table may
  be created** until the governing gates are resolved. The PR #8 merge resolved nothing here, and
  **Step 9 / PR #10 resolved nothing here.**

### Standing decision blockers

**Decisions 2, 3 and 4 remain OPEN.** They continue to block the specific areas they
govern — security parameters, corridor and rate configuration, and regulatory posture —
and they continue to block **production activation**. They **no longer block** the
approved Milestone 1 foundation work.

| Decision | Still blocks | Does not block |
|---|---|---|
| **2 — security baseline** | Every numeric security parameter: MFA qualification, timeouts, lockout, password policy, session expiry, rate limits, recovery. RLS-vs-application authorization (S-2), tenant model (S-3) | Deny-by-default structure, config handling, validation framework, logging foundations, trusted timestamps |
| **3 — corridor substrate** | Production corridors, currencies, reference-rate provider, cadence, staleness policy | Configuration interfaces and fixtures that name no production value |
| **4 — regulatory posture** | Production KYC/vendor behaviour, jurisdiction legal requirements | Generic KYC UI shells and jurisdiction-configured abstractions |

Decisions 1 and 5 are resolved and reconciled (DEC-003, DEC-004).

Governance-deferred parameters awaiting external owners: U-1, U-2, U-5, U-8, U-9, U-10
(ADR-001 §11, plus the preparation-window duration added by Amendment A1) and P-1 … P-11
(ADR-002 §9.2). None has been defaulted or assumed.

**Production financial-semantics blocker:** the `PayoutExecution` child-to-leg aggregate
derivation remains **OPEN** (ADR-001 §14.7). No implementation may derive leg state or a
phase transition from child payout records.

## Next Action

**As of 2 Nov 2026:**

1. **Owner tests the app and the console** on the development setup
   (`docs/RUN_APP_WITH_SERVER.md`, `docs/TEST_FROM_START_TO_FINISH.md`) before new building
   starts.
2. **Outside decisions and accounts** (owner): partner bank, hosting, SMS provider, Resend
   account and domain, Expo/Firebase push, Apple and Google developer accounts. Most remaining
   engineering waits on these.
3. **Buildable without outside parties** (once the owner says go): delete account; Super Admin
   hardware security key; shared rate limiter; real SMS/email senders behind the chosen
   providers; release-build configuration.
4. **Still open with Legal, Compliance and Finance:** Decisions 3 and 4, U-1/U-2, P-1 … P-11 and
   the `PayoutExecution` aggregate semantics (ADR-001 §14.7).

*Historical next actions (August–September 2026), kept as written:*

~~**NEXT HUMAN ACTION REQUIRED:**~~ *(superseded)*
Resolve the outstanding governance gates applicable before Milestone 4.1C, beginning with a
separately authorized human decision process.

Milestone 4.1C remains **NOT STARTED — NOT AUTHORIZED**. Step 9's completion is **not** an
authorization to begin it. The items below retain their previously recorded order; that order is
**not** a decision on precedence between GATE 4.1B-CD3 and Decision 2.

1. **GATE 4.1B-CD3** — the immutability contract and target architecture are **decided**
   (HUMAN-APPROVED 2026-09-01). What remains is a **separate explicit human authorization to
   implement Stage 1 enforcement**; the policy ruling alone authorizes no implementation,
   migration, trigger, grant, role or test, and the gate still blocks the first authoritative
   money-bearing foreign key.
2. Take Decision 2 (security baseline authority) — gates the admin-authorized phase
   transitions in ADR-001 §5.1 and the database-role model in ADR-002 §8. **S-3**
   (tenant/organization model) is worth resolving first: retrofitting tenant scoping
   after tables exist is expensive.
3. Open Decisions 3 and 4 with Legal/Compliance in parallel — longest lead time.
4. Open P-1 … P-11 with Finance and Accounting — none may be assumed by implementation.
5. Resolve the `PayoutExecution` aggregate semantics before any settlement work.

**Superseded instruction:** *"Do not begin implementation until Decisions 2, 3 and 4 are
resolved."* Replaced by the human decision of 2026-08-22 recorded above. Implementation
is permitted **only** within approved milestones; the open decisions still gate their own
areas and gate production activation.

## Milestone 1 boundary — approved scope

**Permitted:** backend application scaffolding, configuration, structured logging, error
envelope, money primitives, health endpoint, test harness; Expo/React Native shell with
the approved navigation and Home structure; Next.js admin shell; the shared semantic
token package; quality tooling and CI.

**Prohibited:** any domain persistence or migration (Offer, Match, Transaction,
Settlement, SettlementLeg, Beneficiary, KYC, MFA factor, PayoutExecution); production
partner calls; payment execution; live settlement instructions; real KYC vendor calls;
production corridor configuration; production reference-rate integration; production
ledger posting logic; Satoshi font files.

*SCOPE NOTE — this section governs **Milestone 1 only** and is retained as the historical
Milestone 1 boundary. It is **not** the current boundary. Milestone 4.1A introduced no domain
persistence or migration. Milestone 4.1B introduced `currency_definitions` and the reusable
money column primitives within its approved scope. Every entity named in **Prohibited**
above — Offer, Match, Transaction, Settlement, SettlementLeg, Beneficiary, KYC, MFA factor,
PayoutExecution — remains **prohibited today**, now under the Milestone 4.1C gates recorded in
**Current Blockers** rather than under this section.*

## Decision Log

### DEC-001 — Backend Architecture

**Decision:** Python + FastAPI

**Status:** APPROVED

**Impact:** Conflicting Node/TypeScript backend implementation choices are not authoritative. Frontend TypeScript remains permitted where documented.

### DEC-002 — Security Posture

**Decision:** Security is deny-by-default, least-privilege, server-authorized, evidence-verified.

**Status:** APPROVED

### DEC-003 — Canonical Transaction/Settlement State Machine

**Decision:** Adopt the hardened four-concern model recorded in `docs/adr/001-transaction-state-machine.md`.

- `SettlementLeg` (9 states) is authoritative for per-leg financial facts.
- `Settlement.phase` (10 phases, forward-only) holds workflow decisions only and contains no monetary vocabulary.
- Financial facts, workflow state, compliance holds, disputes, reconciliation exceptions and immutable events are separate concerns.
- `PAID_OUT` is irreversible. `COMPLETED` requires both legs `PAID_OUT`.
- No settlement may enter a terminal phase while customer funds remain unresolved.
- `RECOVERY_REQUIRED` is mandatory for asymmetric exposure and must remain operationally visible.
- Release authorization uses a transactional outbox; idempotency keys include `leg_id`.
- Reconciliation never rewrites financial state.
- Rematching must not reuse funds from the previous settlement.
- `CLOSED_WITH_LOSS` does not assign the loss to Xspeeria.

**Status:** APPROVED — 2026-08-18

**Supersedes:** the five conflicting state models recorded as contradiction C-1 in `AUDIT_PHASE0_2026-08-18.md`.

**Impact:** Reconciled across `Appendix_D`, `05_API_Contract_Data_Dictionary.md`, `Xspeeria_Master_Prompt_Python_Backend.md`, `02_Technical_Design_Specification.md`, `07_Banking_Integration_Specification_v1.1.md`, `DOCUMENT_INDEX.md`, `CORRECTIONS_v3.md`, plus consequential UI/UX and compliance references.

**Governance-deferred:** U-1, U-2, U-5, U-8, U-9, U-10 — see ADR-001 §11. These must be implemented as configurable policy values and must not be assumed.

### DEC-004 — Financial Event and Accounting-Ledger Architecture

**Decision:** Adopt the hardened model recorded in `docs/adr/002-financial-event-ledger-architecture.md`.

- `settlement_events` is the append-only **root of accepted internal truth**; `webhook_receipts` is append-only **evidence with no financial authority**; `pending_events` quarantines valid evidence awaiting a prerequisite.
- A partner message is accepted only after authentication, replay/idempotency check, schema validation, settlement/leg correlation, transition validation and financial invariant validation.
- Valid but premature or out-of-order evidence is quarantined and re-evaluated, **never silently discarded**. Contradictory evidence is retained but never promoted.
- A **separate append-only double-entry accounting ledger** records **Xspeeria's own economic activity only**. It is not a customer wallet ledger. Customer principal movements (`FUNDED`, `PAID_OUT`, `RETURNED`) never create real-book entries for the principal.
- No customer wallet, balance or cash-ledger table may exist. Any memorandum escrow book is optional (**P-7 TBD**), aggregate by partner/currency, never per customer.
- Append-only; corrections by compensating entry only; historical records never rewritten.
- Exact integer minor units with versioned, configurable currency definitions. No binary floating point in authoritative monetary state. Entries balance per currency.
- Posting identity `UNIQUE(source_event_id, posting_rule_id)`; `posting_rule_version` recorded but not in the key, so a version change can never silently repost history.
- Two-stage processing: fast ingress receipt and ack with no financial state, then one local atomic transaction writing events, projections, ledger entries and lines, audit and outbox rows. **No network call inside that transaction.**
- Tamper evidence by DB role restrictions, per-entry content hashes and periodic signed checkpoints — **not** a globally serialized hash chain.
- The chart of accounts is configuration, not code.

**Status:** APPROVED — 2026-08-18

**Supersedes:** contradiction C-4 in `AUDIT_PHASE0_2026-08-18.md`.

**Impact:** Reconciled across `Appendix_D`, `05_API_Contract_Data_Dictionary.md`, `Xspeeria_Master_Prompt_Python_Backend.md`, `02_Technical_Design_Specification.md`, `07_Banking_Integration_Specification_v1.1.md`, `DOCUMENT_INDEX.md`, `CORRECTIONS_v3.md`, plus compliance and infrastructure references.

**Governance-deferred:** P-1 … P-11 — see ADR-002 §9.2. **NOT APPROVED and must not be invented** through examples, sample schemas, comments, tests, seed data or implementation defaults.

**ADR-001 status:** UNCHANGED. No amendment required.

**Evidence state:** DOCUMENTED. No implementation exists.