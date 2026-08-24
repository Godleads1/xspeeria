# XSPEERIA — CORRECTIONS APPLIED (v3)

This pass makes **`00_5-Year_Business_Plan_SOURCE_OF_TRUTH.docx`** the authoritative
document for the two items below, and updates every other document in this
suite to match it. Where a document previously stated something different,
the old text is not silently deleted — most edits leave a short inline note
("supersedes...", "corrects...") so a reader who remembers the old version
isn't confused, consistent with how `README.md`'s v2 fixes were documented.

## 1. Launch corridor: NGN⇄USD → NGN⇄GBP (pilot), NGN⇄USD now Year 2

Every document previously stated the platform launches on **NGN⇄USD** as its
one and only Year 1 corridor. The 5-Year Business Plan instead specifies:

- **Year 1 (pilot):** NGN ⇄ United Kingdom (GBP)
- **Year 2:** NGN ⇄ United States (USD) added, alongside NGN⇄Canada and
  Ghana⇄UK, as part of a parallel (not sequential) corridor rollout.

Updated: `PRODUCT_REQUIREMENTS_DOCUMENT.md`, `01_Business_Requirements_Specification.docx`,
`02_Technical_Design_Specification.docx`, `03_Compliance_Operations_Manual_v1.1.docx`,
`04_Product_Design_Specification.docx`, `05_API_Contract_Data_Dictionary.docx`,
`07_Banking_Integration_Specification_v1.1.docx`, `08_Investor_Board_Strategy_Book_v1.1.docx`.

**Not yet reconciled — needs follow-up:** anywhere these documents assumed
NGN⇄USD-specific regulatory, banking-partner, or KYC detail (e.g. "Nigerian
and US jurisdictions" language in the Compliance Manual, US-side bank-partner
assumptions in the TDS), a GBP/UK-side equivalent still needs to be sourced
and reviewed by Legal — this pass updates the *labels*, not the underlying
UK-specific compliance research, which doesn't yet exist in this suite.

## 2. Revenue model: percentage transaction fee → flat coordination fee

The Investor & Board Strategy Book and BRS previously modeled Xspeeria's own
revenue as a **percentage fee** (illustrative 0.5–1.5% of transaction value,
~1.0% take rate, ~$7.50 per $750 transaction). The 5-Year Business Plan
instead specifies a **flat coordination fee**: a fixed multiple (illustratively
7.5x) of the local instant-transfer cost on each side of the transaction —
explicitly *not* a percentage of transaction size, and positioned as the
structural pricing advantage over percentage-margin competitors like LemFi.

Updated: `01_Business_Requirements_Specification.docx` (Section 11, ASSUMPTION-BRS-04),
`08_Investor_Board_Strategy_Book_v1.1.docx` (Section 7.1 revenue-streams table,
Section 7.2 unit-economics table).

**Not yet reconciled — needs follow-up:** the Investor Strategy Book's
Section 14 KPI Appendix still defines "Take Rate" as a percentage-of-GMV
metric. That's compatible with a flat fee (take rate becomes a *derived*,
declining metric rather than a *set* rate — see 5-Year Business Plan Section
10.1), but the KPI definition itself hasn't been reworded to say so
explicitly; worth a follow-up pass so a reader doesn't assume Xspeeria charges
a percentage.

## 3. Noted but not changed: roadmap horizon (3-year vs 5-year vs "original 10-year")

The Investor Strategy Book's Section title "a three-year roadmap" has been
flagged inline and pointed to the 5-Year Business Plan as the current
roadmap. The 5-Year Business Plan itself repeatedly refers to compressing
"the original ten-year plan" into five years — no ten-year plan exists
anywhere in this suite. This reference is left as-is pending clarification
of what that ten-year plan actually is (a document not included here, or a
verbal/earlier plan not written down). Flagging this so it isn't mistaken for
a resolved contradiction.

## 4. Transaction/settlement state model: five conflicting models → one canonical model

*(Added 2026-08-18 following the Phase 0 audit. This pass differs from those above:
it is not a business-content correction but an architecture decision, recorded as
`docs/adr/001-transaction-state-machine.md` and approved as DEC-003.)*

The Phase 0 audit (`AUDIT_PHASE0_2026-08-18.md`, contradiction C-1) found **five
materially incompatible transaction/settlement state machines**, in documents each
designated PRIMARY for its own domain by `DOCUMENT_INDEX.md`:

| Document | Section | States |
|---|---|---|
| `Appendix_D_Financial_Correctness_Settlement_Specification_Xspeeria_v1.1.md` | §5 | 13 |
| `Xspeeria_Master_Prompt_Python_Backend.md` | §8 | 14 |
| `02_Technical_Design_Specification.md` | §10.2 | 13 |
| `07_Banking_Integration_Specification_v1.1.md` | §4.3 | 6 |
| `05_API_Contract_Data_Dictionary.md` | Transaction / Settlement entities | 5 / 6 |

**The material defect** was not naming. Four of the five had no state distinguishing
"escrow A funded, escrow B not funded" — the distinction that gates release, and the
one Appendix D §15 makes a hard prohibition. The banking spec's
`funds_pending_verification` meant *"at least one party has confirmed sending funds"*
and transitioned directly to `verified`, collapsing the asymmetry the entire
non-custodial design depends on.

Two further hazards: `verified` meant **money in** in the banking spec and **money out**
in Appendix D; and the two documents ordered `processing` and `verified` in opposite
sequences.

**Resolved by ADR-001 (DEC-003):** a four-concern model — `SettlementLeg` (9 states)
authoritative for per-leg financial facts, `Settlement.phase` (10 forward-only phases)
for workflow decisions only, and separate entities for compliance holds, disputes and
reconciliation exceptions. Appendix D remains the financial authority; thirteen defects
identified in its own text were corrected and are recorded in its new Section 17.

Updated: `Appendix_D_...v1.1.md` (Sections 3, 5, 7, 8, 11, 15, 16, new 17),
`05_API_Contract_Data_Dictionary.md` (entities, error codes, confirm-funds endpoint,
event catalogue), `Xspeeria_Master_Prompt_Python_Backend.md` (Sections 7, 8, 14),
`02_Technical_Design_Specification.md` (Sections 6.2, 6.3, 8.6, 10),
`07_Banking_Integration_Specification_v1.1.md` (Sections 1, 4.1, 4.3, 5.5, 7),
`DOCUMENT_INDEX.md` (new Sections 1.1 and 1.2), `PROGRESS.md` (DEC-003).

As with the passes above, old text was not silently deleted — each reconciled section
carries an inline `RECONCILED — ADR-001 (DEC-003)` note explaining what changed and why,
so a reader who remembers the earlier model is not confused.

**Not yet reconciled — needs follow-up:** six governance-deferred parameters have been
marked `TBD` rather than assumed, and must be settled by their named owners before
implementation of the affected paths — coordination-fee treatment on timeout/rematch
(Product/Legal), funding-window duration and extension policy (Product/Risk/Partner SLA),
dispute-window duration (Compliance/Legal), loss-bearing responsibility on
`CLOSED_WITH_LOSS` (Legal/Partner Contracting/Insurance), conditional two-phase partner
release capability (Partner Selection), and `RECOVERY_REQUIRED` ageing and regulatory
escalation thresholds (Compliance/Legal). See ADR-001 §11. **No default has been encoded
for any of them**, and in particular nothing assumes Xspeeria bears a recovery loss.

**Also not reconciled by this pass:** the corridor residue recorded in Section 1 above
remains open, and the banking specification still carries NGN⇄USD-specific field values,
sequence labels, SLA rows and jurisdictional language. That is Decision 3 in the Phase 0
audit and was deliberately left untouched here, to keep this pass to the state model only.

## 5. Financial event acceptance and accounting ledger: three-way divergence → one canonical architecture

*(Added 2026-08-18. Like Section 4, an architecture decision rather than a
business-content correction — recorded as `docs/adr/002-financial-event-ledger-architecture.md`
and approved as DEC-004.)*

The Phase 0 audit (`AUDIT_PHASE0_2026-08-18.md`, contradiction C-4) found the ledger
model stated three ways: event-sourced and balance-prohibited (`Appendix_D` §7/§14, TDS),
entity tables with mutable status columns and no stated projection relationship (API
contract), and *"append-only wherever practical"* with the event entity missing from the
entity list (Python backend spec). That document-level divergence was closed during the
Section 4 reconciliation.

**The substantive question the audit did not reach** — and which DEC-004 decides — was
whether an immutable domain-event journal is the same thing as a financial ledger, and
whether a non-custodial platform needs double-entry accounting at all.

`Appendix_D` §7/§14 prohibits *"wallet balance tables and internal customer cash ledgers"*
and *"customer balance tables"*, which reads as prohibiting a ledger outright. It in fact
prohibits something specific: **customer cash balances**. Meanwhile ADR-001 creates
financial positions that are unambiguously Xspeeria's own — recognized losses, quantified
exposures carried over time, recoveries, fee receivables and reconciliation differences —
none of which had anywhere to live.

**Resolved by ADR-002:** three stores with different authority (`webhook_receipts` as
evidence, `pending_events` as quarantine, `settlement_events` as accepted truth), and a
**separate** append-only double-entry ledger for **Xspeeria's own economic activity only**.
Customer principal movements never create real-book entries. No customer wallet or balance
table exists under any configuration.

Updated: `Appendix_D_...v1.1.md` (Sections 7, 7.1, 7.2, 14, 15),
`05_API_Contract_Data_Dictionary.md` (WebhookReceipt, PendingEvent, Account, LedgerEntry,
LedgerLine entities), `Xspeeria_Master_Prompt_Python_Backend.md` (Sections 7, 14),
`02_Technical_Design_Specification.md` (Sections 6.2, 6.3, 6.4, 10.6),
`07_Banking_Integration_Specification_v1.1.md` (Sections 5.1.1, 6.1),
`DOCUMENT_INDEX.md` (Sections 1.1, 1.2), `PROGRESS.md` (DEC-004),
`03_Compliance_Operations_Manual_v1.1.md`, `06_Infrastructure_DevOps_Handbook.md`.

**Deliberately NOT decided — and explicitly not invented:** eleven accounting-policy
determinations remain open and are owned outside engineering — chart of accounts (P-1),
revenue recognition (P-2), exposure recognition (P-3), loss recognition (P-4), recovery
accounting (P-5), partner receivable/payable treatment (P-6), memorandum escrow accounting
(P-7), reporting currency (P-8), FX accounting treatment (P-9), suspense ageing and
quarantine thresholds (P-10), and checkpoint frequency and external anchoring (P-11).
U-1 and U-8 carry forward from Section 4 unchanged.

During review, four accounting-policy assumptions had leaked into the proposal through
illustrative examples and were removed before approval. The architecture asserts only what
must **not** be posted — which follows from non-custody — and never what **must** be posted,
which is Finance's to determine.

**Also not reconciled by this pass:** the corridor residue in Section 1 remains open
(Decision 3), as does the security-baseline authority question (Decision 2).

## 6. Not touched

Non-corridor, non-pricing content (KYC flows, dispute operations, security
architecture, matching-engine logic, org chart/advisor detail, market-sizing
methodology) was left as-is by the v3 pass. *(Dispute representation and settlement
state have since been changed by Section 4 above; the rest stands.)* The 5-Year Business Plan introduces a named
leadership team and advisor list not present elsewhere in the suite — no
other document names individuals, so there was nothing to reconcile there.

## 7. Dangling normative references, background-colour roles, and KYC vocabulary

Applied 2026-08-21/22. Three unrelated document-integrity defects, none of which
resolves an open decision.

**7.1 — `SECURITY.md` dangling normative references.** `AUDIT_PHASE0_2026-08-18.md`
§12 / C-6 recorded that several documents grounded normative requirements in a
repository document named `SECURITY.md` that **does not exist**. Every such
citation in `docs/` now reads *"the applicable approved security policy"*, and each
affected document carries an `UNKNOWN — NOT VERIFIED` banner stating that this
policy **is not yet determined** — it is the subject of open **Decision 2**
(security-baseline authority). Affected: `04_Product_Design_Specification.md`,
`05_API_Contract_Data_Dictionary.md`, `07_Banking_Integration_Specification_v1.1.md`,
`xspeeria-design-bible.md`, `Xspeeria_UIUX_AppFlow_Spec_v2.md`,
`06_Infrastructure_DevOps_Handbook.md`. The requirements themselves (HMAC-SHA256
webhook verification, AES-256 at rest, rotation-on-refresh, RBAC, lockout
thresholds) are unchanged — only their grounding is now stated as unresolved.
Version-History rows citing `SECURITY.md` are left intact as historical record.
Occurrences in `Xspeeria_Master_Prompt_Python_Backend.md` are **not** dangling:
that document *requires* `SECURITY.md` to be produced as a deliverable.
`reference/` is archival source material and was not edited.
**This does not close C-6 and does not pre-empt Decision 2.**

**7.2 — Background-colour roles.** `PRODUCT.md` "Brand Commitments" records the
human decision of 2026-08-20 that `#FFFFFF` is the **required default background**
across Xspeeria mobile and web, with `#F8FAFC` permitted for secondary surfaces
only. Four documents contradicted it by defining `color.bg.base` = `#F8FAFC` as
"App background". `color.bg.base` is now `#FFFFFF` in
`04_Product_Design_Specification.md`, `Xspeeria_UIUX_AppFlow_Spec_v2.md` and
`xspeeria-design-bible.md` (palette table and Tailwind handoff block), and
`DESIGN_SYSTEM.md` states both roles. No token name was assigned to the supporting
`#F8FAFC` surface — the design bible fixes the palette at six tokens, so naming a
seventh requires design-system approval. Consequence recorded in each document:
`surface.card` (`#FFFFFF`) no longer differs in colour from the canvas and must be
separated by border, elevation or spacing, never by fill.

**Not reconciled here — subsequently superseded, see §8.** This section previously
concluded that the application palette mismatch between `PRODUCT.md`
(≈`#001A6E` / `#208B3B` / `#F90A09` / `#FEB700`) and the design documents
(`#001B68` / `#179A43` / `#E52421` / `#F4C21F`) could not be resolved until the original
vector asset was available. **That conclusion is withdrawn.** It conflated logo/brand-asset
colours with the application UI palette. The application UI palette is settled by the
Xspeeria Figma (§8); only the **logo artwork** colours still await vector confirmation.

**7.3 — KYC vocabulary in the TDS.** `02_Technical_Design_Specification.md` §5.3.1
stated that a `User` "cannot transition to `verified` status" without an approved
KYC profile. `verified` is not a value of `Users.status`, whose enumeration in
`05_API_Contract_Data_Dictionary.md` is `pending_verification, active, suspended,
closed`. The invariant now names the authoritative field (`KycCases.status =
approved`) and flags "verified" as descriptive vocabulary only. No behavioural change.

## 8. Application UI palette reconciled to the Xspeeria Figma

Applied 2026-08-22. Human authority: the Xspeeria Figma is the **primary visual source of
truth for application UI/UX**. This section records a **documentation reconciliation only** —
no product logic, settlement semantics or security decision was touched, and no ADR or DEC
identifier was created.

**8.1 — The distinction this pass enforces.** **(A) Logo / brand-asset colours** — the
approximate values in `PRODUCT.md` (`#001A6E`, `#208B3B`, `#F90A09`, `#FEB700`) still require
confirmation against the original vector. **(B) Application UI colours** — governed by the
Figma. The two were previously conflated, including by §7.2 of this document, which is
corrected above. Logo values are **not** application tokens.

**8.2 — Figma-observed application palette.** Primary `#1F3A8A`; Secondary `#3B82F6`;
canvas / pure white `#FFFFFF`; supporting soft surface `#F8F9FD`; border/divider `#E5E7EB`;
headline text `#111827`; body text `#4B5563`; disabled text `#9CA3AF`; success `#10B981`;
warning `#F59E0B`; error `#EF4444`.

**8.3 — Not production tokens.** The Figma contains **painted swatches, not a bound
token/variable system**. Xspeeria has **no production design-token system**, and this
repository must not claim one. All values above are recorded as **FIGMA-OBSERVED COLOURS /
CANDIDATE APPLICATION TOKENS** until human approval freezes them. No Figma variable migration
was designed or implied by this pass.

**8.4 — Figma defect recorded, not corrected.** The Figma Success swatch has fill `#10B981`
while its visible text label reads `#FFFFFF`. The observed **fill governs**; the label is a
defect to be fixed at source. This repository does not modify the Figma.

**8.5 — Corrections applied.** `color.primary.blue` `#001B68` → `#1F3A8A`,
`color.success.green` `#179A43` → `#10B981`, `color.alert.red` `#E52421` → `#EF4444` in
`04_Product_Design_Specification.md`, `Xspeeria_UIUX_AppFlow_Spec_v2.md` and
`xspeeria-design-bible.md` (palette tables, and the bible's Tailwind handoff block).
`DESIGN_SYSTEM.md` now carries the full observed palette. `PRODUCT.md` separates (A) from (B).
`DOCUMENT_INDEX.md` §11 records the Figma as the primary visual source of truth for
application UI/UX, with both limits stated. The design bible's claim to be "the single visual
source of truth for Xspeeria" and its "six tokens, no more" statement are marked superseded;
it remains authoritative for behaviour, flows, states and interaction detail.

**8.6 — Supporting surface.** `#F8FAFC` was the pre-Figma supporting neutral; the Figma-observed
value is `#F8F9FD`. `#F8FAFC` was **not** globally replaced. Each occurrence was classified:
`PRODUCT.md` "Supporting neutral surface" and `DESIGN_SYSTEM.md` were the only live
supporting-surface declarations and were repointed to `#F8F9FD`. All remaining occurrences are
**historical references inside supersession notes** (in this document and in the three design
documents) and were deliberately left intact. `#FFFFFF` remains the primary canvas everywhere —
unchanged by this pass, and consistent with both the Figma and the 2026-08-20 human decision.

**8.7 — Derived and adjacent tokens (`04_Product_Design_Specification.md`).** The three `.10`
tints are definitionally their base colour at 10% alpha and moved with their bases
(`#1F3A8A1A`, `#10B9811A`, `#EF44441A`). `color.gray.100` was repointed `#F3F4F6` → `#E5E7EB`
because its stated role — card borders, dividers — is exactly the role the Figma names.
`color.gray.400` `#9CA3AF` already matches the Figma disabled-text value exactly.

**8.8 — Left unresolved, flagged in place as `UNKNOWN — NOT VERIFIED`.**

- **No accent/gold in the observed Figma palette.** `color.accent.gold` `#F4C21F` (premium
  accents, badges, KYC-verified marker) has no Figma counterpart. Retained, not Figma-confirmed.
  Whether the logo's gold carries into the application UI at all is open.
- **Body-text role collision.** *(Closed by human decision 2026-08-22 — see §9.6a.)* The Figma observes body text `#4B5563`; the design documents use
  `#111827` for body copy and `color.gray.600` `#6B7280` for secondary text. Whether `#4B5563`
  replaces one, the other, or introduces a third role is not determinable from the swatches. No
  value was changed.
- **`color.primary.blue.hover` `#002885` and `.pressed` `#001350`** were hand-derived from the
  superseded `#001B68`. They were **not** re-derived — that is a design decision, not a
  mechanical one.
- **Accessibility.** Measured WCAG contrast for the observed palette is recorded in
  `DESIGN_SYSTEM.md`. Secondary `#3B82F6` (3.68:1), error `#EF4444` (3.76:1), success `#10B981`
  (2.54:1) and warning `#F59E0B` (2.15:1) all fail AA 4.5:1 for normal-size text on the white
  canvas; success and warning also fail the 3:1 non-text threshold, and border `#E5E7EB` (1.24:1)
  fails it for meaningful boundaries. These are **findings for human design review** — no colour
  was altered to fix them. The incorrect claim in `04_Product_Design_Specification.md` that white
  text on `#001B68` measured 12.6:1 was corrected: it measures 15.48:1, and white on the new
  primary `#1F3A8A` measures 10.34:1.

**8.9 — Design source file.** `docs/references/figma/Xspeeria.fig` (~70.1 MB) is classified
**HUMAN-PROVIDED DESIGN SOURCE — UNTRACKED PENDING VERSIONING DECISION**. Not staged, not
committed, not deleted, not moved, not gitignored, not placed in Git LFS. `.gitignore` was not
modified and `docs/references/` was not blanket-ignored. How this file is versioned is a human
decision that has not been taken.

## 9. Design-system freeze — Phase 1

Applied 2026-08-22. **HUMAN APPROVED.** This section converts approved human design decisions into
normative documentation. **IMPLEMENTATION STATUS: NOT IMPLEMENTED. VERIFICATION STATUS: NOT
VERIFIED** — no application code exists, none consumes these tokens, and none of the Home or
navigation changes is built. No ADR or DEC identifier was created. No settlement, security, legal
or regulatory decision was touched, and Decisions 2, 3 and 4 remain open and untouched.

**9.1 — Application colour direction, frozen.** Primary `#1F3A8A`; Secondary `#3B82F6`; canvas
`#FFFFFF`; supporting soft surface `#F8F9FD`; headline `#111827`; body `#4B5563`; disabled
`#9CA3AF`; success base `#10B981`; warning base `#F59E0B`; error base `#EF4444`; subtle border
`#E5E7EB`. `#1F3A8A` is **deliberately retained** and must not be normalised to `#1E3A8A`. The
palette's resemblance to framework defaults does not invalidate it. The approximate logo-derived
values remain **brand-asset** colours pending vector confirmation and are **not** application UI
tokens.

**9.2 — Semantic architecture, frozen in principle.** One status colour does not perform every
role. Status families split into `.fill` / `.surface` / `.border` / `.text`. The Figma base is
preserved in every family and the darker values are **additions, not replacements**:

| Family | fill | surface | border | text |
|---|---|---|---|---|
| success | `#10B981` | `#ECFDF5` | `#059669` | `#047857` |
| warning | `#F59E0B` | `#FFFBEB` | `#D97706` | `#B45309` |
| error | `#EF4444` | `#FEF2F2` | `#EF4444` | `#B91C1C` |

`error.text` is `#B91C1C`, not `#DC2626`: `#DC2626` measures 4.41:1 on `#FEF2F2`, below AA for
normal-size text. Full role-by-role permitted use, with measurements, is in `DESIGN_SYSTEM.md`.

**9.3 — Border and surface roles, frozen.** `#FFFFFF` is the primary canvas; `#F8F9FD` is a
supporting/sunken surface only; `#E5E7EB` is a **decorative boundary only** (1.24:1); `#6B7280` is
the **strong boundary** (4.83:1) for text inputs, selectable rows and interactive form fields.
`#E5E7EB` must never be the sole boundary of a control. Visual hierarchy is built in the order
spacing/grouping → typography → subtle borders → supporting surface → restrained elevation. No
card-on-card layouts and no shadow-heavy interfaces.

**9.4 — Primary interaction states, frozen as candidates.** default `#1F3A8A` · hover `#1E40AF` ·
pressed `#172554` · focus ring `#1D4ED8` · on-primary `#FFFFFF` · disabled fill `#F3F4F6` with
label `#6B7280`. States move bidirectionally because the base is a dark navy with little
darkening headroom. The focus ring is deliberately **not** `#3B82F6`, which measures 2.81:1
against the primary fill. Disabled is a fill swap, not reduced opacity. **`#002885` and `#001350`
are withdrawn** — both were derived from the obsolete `#001B68`.

**9.5 — Gold, restricted.** Gold is **not** a financial or status semantic colour. It must not
represent KYC approval, verified identity, success, funding confirmation, settlement completion or
warning. A narrowly scoped decorative role for **rating indicators only** is permitted, always
accompanied by the numeric rating. **`04_Product_Design_Specification.md` previously specified the
KYC verification badge in gold; that is corrected** — identity verification uses the brand-primary
family, not gold and not success-green, because verification is an **identity fact**, not a
financial success state. The `feedback.premium` semantic alias is withdrawn.

**9.6 — Left open, not frozen.** *(Typography partially resolved 2026-08-22 — see §10: Inter is
approved as the financial/numeric face; Satoshi remains open; Nunito Sans is not selected.)*
Typography, including Satoshi as leading mobile candidate and the admin question, blocked on
licence, embedding rights, tabular/lining figures and React Native asset strategy — **neither
Satoshi nor Nunito Sans is production-standard**. The gold
rating-glyph execution, which may remain an implementation/design-detail item. Logo/brand-asset
colours pending vector confirmation. The production token freeze itself.

**9.6a — Text roles, resolved.** The body-text role collision recorded in §8.8 is **closed by
human decision, 2026-08-22**: `color.text.primary` `#111827` for headings, high-emphasis labels
and primary content; `color.text.secondary` `#4B5563` for **body copy**, descriptions, supporting
text and metadata — directly FIGMA OBSERVED, 7.56:1 on canvas, and semantically distinct from
primary; `color.text.disabled` `#9CA3AF` for genuinely disabled/inactive text only.
`color.border.strong` `#6B7280` is a **boundary value, not a text token** — where it appears as
readable text it is scoped to the disabled-control treatment (fill `#F3F4F6`, label `#6B7280`)
and must not be generalised into `color.text.secondary`.

**9.7 — Home, semantic correction.** Xspeeria has **no Available Balance, wallet balance, stored
balance, custodial balance or withdrawable balance, and no aggregate balance hero.** The concept is
**removed, not renamed** — the previously documented "net position across pending settlements" was
the same prohibited affordance under another label, and a large single currency figure in the hero
position reads as a balance regardless of its label.

The former balance region becomes **Account Readiness**, carrying exactly three dimensions:
Identity / KYC, Security / qualifying MFA, Eligible to transact. It collapses to a compact
confirmation state once all three are satisfied. **Beneficiary, payout and funding readiness are
allocation-specific and must never become Home account-readiness dimensions.**

Approved Home hierarchy: greeting/identity header → notification bell → Account Readiness →
primary action (create/browse offer) → Active activity → Recent activity. Active activity carries
open Offers, MatchAllocations requiring attention and in-flight settlement activity as **discrete
items**; amounts stay attached to the individual Offer or allocation and are **never summed into
one figure**. The show/hide balance privacy toggle is removed — the shoulder-surfing concern is
resolved at source by having no balance, not by hiding one.

Reconciled in `04_Product_Design_Specification.md` (Balance Card component → Account Readiness
Region, Home screen specification, Appendix A open decisions), `Xspeeria_UIUX_AppFlow_Spec_v2.md`,
`xspeeria-design-bible.md`, `UI_UX_SCREEN_SPEC.md` and `PRODUCT.md`.

**9.8 — Bottom navigation.** **Home, Marketplace, Track, Cards, Profile.** Cards is **COMING
SOON** and must open a real destination — never a dead or disabled tab. That destination may
explain the future feature and may later carry a notify-me/waitlist CTA if separately approved. It
must expose **no active card functionality, no card balances, and nothing implying stored-value
wallet or card functionality** — `PRODUCT.md` "Brand Commitments" forbids implying card balances,
so the Coming Soon copy is a compliance-relevant surface, not decoration.

**This reverses a documented prior correction and the reversal is recorded rather than silent.**
The original specification listed *Home, Cards, Scan, Analytics, Profile*; a prior pass corrected
it to *Home, Marketplace, Track, Notifications, Profile* on the grounds that Cards matched no MVP
feature. The human decision restores Cards as Coming Soon and moves Notifications out of the bar.
Both prior states are retained in the affected documents as supersession history. **Scan** still
does not exist in the product and **Analytics** remains out of MVP scope — that part of the prior
correction stands.

Notifications are reached through the bell, the notification centre, and push notifications for
time-sensitive events — conceptually match available, replacement match, preparation deadline,
funding deadline, partner confirmation, settlement/payout progress, and dispute/support events.
**Exact push/SMS policy is not frozen by this pass.**

**9.9 — Mobile / admin consistency.** One Xspeeria brand, different density for the customer app
and the operator admin. Shared: brand colours, semantic status colours **and their meanings**,
logo/wordmark treatment, core spacing logic, form and error semantics, financial number formatting
principles, and state vocabulary. Admin may differ in density, table structures, sidebar
navigation, keyboard interactions, information volume, reduced motion and compact forms. Mobile
card layouts are not forced into admin, and admin dashboard density is not forced into mobile.
**No new settlement state may be invented for UI presentation** — the state vocabulary is owned by
`docs/adr/001-transaction-state-machine.md`.

**9.10 — Token architecture.** PRIMITIVE → SEMANTIC → COMPONENT. Application components consume
**semantic** tokens only. Names are role-based, not hue-based (`color.brand.primary`, not
`color.primary.blue`). No 50–950 ramp is exposed to product code. No component-specific tokens
without a demonstrated exception. Alpha derivations are computed, not tokenised. **No `info`
status family** until an actual product need exists. A legacy-name mapping table in
`DESIGN_SYSTEM.md` carries the hue-based names in the existing documents across to the semantic
set, so the older tables remain readable without being authoritative.

**9.11 — Design source file, unchanged.** `docs/references/figma/Xspeeria.fig` remains
**HUMAN-PROVIDED DESIGN SOURCE · UNTRACKED · VERSIONING DECISION OPEN**. Not staged, committed,
ignored, moved, deleted or LFS-tracked. `.gitignore` was not modified and `docs/references/` was
not blanket-ignored. The Figma itself was not modified.

## 10. Typography — partial freeze

Applied 2026-08-22. **HUMAN APPROVED.** Documentation only. No font files were downloaded, added
or embedded; none exist in this repository. No ADR or DEC identifier was created. No product,
settlement, security, legal or architecture content was altered.

**10.1 — Inter, approved.** **Inter is the Xspeeria financial/numeric typeface** across applicable
surfaces: currency amounts, exchange rates, fees, percentages, financial totals, transaction,
settlement and allocation amounts, numeric table columns, admin operational data, right-aligned
monetary values, and any other numeric data requiring tabular alignment.

**10.2 — What is normative is the outcome, not the method.**

> Financial numerics must support tabular/lining figures wherever alignment requires it.

How that outcome is produced is an **implementation decision and is not frozen**. A pre-built Inter
instance carrying `tnum` as its default is recorded as an **implementation recommendation only**,
because `fontVariant: ['tabular-nums']` is not reliably applied to custom fonts on iOS
(expo/expo issue #20048) while Android supports it (React Native PR #27006) — so a runtime feature
call cannot be assumed sufficient on its own. No font build pipeline is frozen in normative
product documentation. **Inter is not required on non-numeric text**; two typefaces must not be
forced into every screen.

**10.3 — Satoshi, still open.** Satoshi remains the **leading mobile/brand UI candidate** and is
**not production-approved**. It must not be described as approved anywhere. Blocking items:
primary licence verification; mobile-app embedding rights; redistribution and bundling rights; the
licence applicable to the Satoshi files actually used in the Figma; the web self-hosting versus CDN
decision; a production specimen review; and a React Native delivery strategy. **No font files may
be downloaded, added or embedded** while these remain open.

**10.4 — Nunito Sans, not selected.** Nunito Sans is **not** adopted as an Xspeeria production
typography standard. Its admin usage appears **inherited from imported or adapted design
material** rather than deliberately chosen; the provenance and licence of that material are
**`UNKNOWN — NOT VERIFIED`**; and its numeric suitability for financial data is not sufficiently
established. **This is not a mandate to redesign the admin** — admin structure, layout and
operational UI architecture are preserved, and typography may be harmonised later without
replacing them.

**10.5 — Status by surface.** Mobile brand/UI: **OPEN**, Satoshi leading. Mobile financial/numeric:
**Inter, approved**. Admin headings/chrome: **OPEN** — Satoshi may become the shared brand face if
licence verification succeeds, and Inter across admin is an acceptable fallback if it does not.
Admin financial/data/tables: **Inter, approved**.

**10.6 — Fallbacks are guidance, not authority.** No assumption is frozen about proprietary or
locally installed font availability. System-face fallback stacks are recorded in `DESIGN_SYSTEM.md`
as implementation guidance only. Where the platform supports it, **financial numerics must retain
tabular alignment in fallback**.

**10.7 — Superseded statements.** `04_Product_Design_Specification.md` stated a frozen typeface
pairing of "SF Pro (iOS) / Inter (Android, Web, Admin)"; that is superseded as a frozen statement
by this partial freeze. Its Display type-style row still read *"Balance amount on Home"* — a
surviving contradiction with the Phase 1 balance removal, corrected here to activity count
numerals and KPI figures. The design bible and AppFlow spec had already corrected the equivalent
row in an earlier pass.

**10.8 — Evidence.** The Figma was read, not modified. Font usage counts taken from the decoded
`canvas.fig` payload: `SatoshiVariable-*` 1,589 uses; `NunitoSans-*` 1,172; `RobotoRoman-Regular`
and `Roboto-Regular` 606; `SFPro*` ~147; with `Poppins`, `Inter`, `IBMPlexSans`, `Mulish` and
`Lato` also present. Eight or more unrelated families in one file, an external placeholder-image
host belonging to another project, and a stray third-party comment string are the basis for the
finding that the admin typography is inherited rather than chosen. Licence and OpenType findings
for Satoshi came from **secondary sources only** — the Fontshare licence page could not be
retrieved as text — and are recorded as such, not as verified fact.

**10.9 — Figma versioning, unchanged.** `docs/references/figma/Xspeeria.fig` remains
**HUMAN-PROVIDED DESIGN SOURCE · UNTRACKED · VERSIONING DECISION OPEN**. Not staged, committed,
ignored, moved, deleted or LFS-tracked.

## 11. Canonical domain model reconciliation

Applied 2026-08-22. **HUMAN APPROVED.** Documentation only — no application code, no database
migration, no new ADR or DEC number. ADR-001 is amended in place as **Amendment A1** under the
existing DEC-003 governance record. ADR-002 is **unchanged**. Decisions 2, 3 and 4 remain open and
untouched. *HISTORICAL: this pass also recorded that the implementation NO-GO standing
instruction in `PROGRESS.md` was unchanged. That blanket prohibition is **SUPERSEDED** by the
Phase 1 controlled-implementation GO of 2026-08-22; the standing constraints are now the
Milestone 1 boundary in `PROGRESS.md`. Nothing else in this section changes.*

**11.1 — Authority ranking applied.** ADR-001/ADR-002 are human-ratified. The human-approved
product substance in this pass ranks above `02_Technical_Design_Specification.md`
(PRIMARY-designated, no ratification record) and above `05_API_Contract_Data_Dictionary.md`
(**self-declared derived and NOT RATIFIED**). No lower-ranked source was allowed to override a
higher-ranked rule, and reconciling the API contract to approved semantics does **not** make its
endpoint or error-code naming backend-ratified.

**11.2 — MatchAllocation ↔ Match.** Conceptual **`MatchAllocation`** maps to the existing persisted
entity **`Match`**, which is **extended, not renamed**. **No second table or entity is created**,
and no table, route or contract field is renamed for terminology. One Offer carries **0..n**
Matches, each one accepted partial or full allocation by one counterparty, each an independent
settlement failure domain guaranteed by `Match → one Transaction (match_id UNIQUE) → one
Settlement → exactly two SettlementLegs`.

**11.3 — Match attributes.** Added conceptually: `allocated_amount` (reconciling the TDS
`matched_amount` on Match — **one amount concept, not two**), server-set trusted `accepted_at`,
`preparation_state` / `preparation_deadline`, `funding_state` / `funding_deadline`,
`allocation_requirements`, and beneficiary selection linkage. `agreed_rate` already existed and is
locked at acceptance. **Partner provisioning state stays on `SettlementLeg`** per ADR-001 and is
not duplicated onto `Match`. `fx_request_id` becomes **optional/nullable**.

**11.4 — Origination model.** Canonical behaviour is **publish and accept**. The TDS §9.2 automated
two-sided matcher is **superseded**, together with **price-time allocation priority**, best-rate
allocation priority among competing accepters, and all central-limit-order-book semantics.
Acceptance priority within one Offer is **first eligible acceptance by trusted server timestamp**.
Marketplace discovery and ranking remain separate and permitted. TDS §9.3 concurrency protection is
**retained** and now guards concurrent acceptances of one Offer.

**11.5 — Transaction layer kept.** Not collapsed into Match or Settlement, preserving the
allocation/settlement boundary and avoiding changes adjacent to ADR-001.

**11.6 — FXRequest.** Retained: table, `/fx-requests` route and all historical references stand.
Classified **legacy/API-compatibility plus optional demand-side product concept**. It is **not** a
required canonical matching primitive and must not drive the matching algorithm or create a second
allocation model. Whether the demand-side capability remains user-facing in MVP is flagged in the
BRS as an **open product decision**.

**11.7 — Offer model.** `original_amount = matched_amount + remaining_amount`, where
`matched_amount` is the sum of two **disjoint** sets: allocations that are **active and
committed** (currently valid, non-expired and not yet completed) and allocations that
**completed successfully**. No allocation belongs to both, so every allocation is counted
**exactly once**. Expired or pre-funding-released allocations belong to neither set: they
cease contributing and their amount returns to remaining capacity; terminated allocation
records remain immutable audit history.
**`remaining_amount` is DERIVED**, not persisted as an independently mutable source of truth.
Lifecycle must express **open, partially matched, fully matched, cancelled, expired** — the former
binary `active → matched` is insufficient; persisted enum literals may keep existing names for
compatibility. A partially matched Offer **remains available for its remaining amount**.

**11.8 — Partial acceptance.** The accept endpoint now conceptually carries an amount. The previous
rule *"acceptance locks the offer (status → matched)"* is **withdrawn** — whole-Offer locking is
replaced by row-level locking on the Offer's amount fields, enforcing that the **sum of valid
allocations never exceeds the original amount**. *"Cannot cancel an offer once matched"* is revised.

**11.8b — `accepted_amount` is required, human decision 2026-08-24.** The accepting client **must** supply `accepted_amount`. Omission is a request-validation failure (`VAL_422_MISSING_FIELD`, existing catalogue entry) and **never** means "accept the full remaining amount": the previously **PROPOSED, not ratified** take-remaining default is **WITHDRAWN**, and no server-side implicit default replaces it. The value must be **> 0** and **≤ the authoritative `remaining_amount` read inside the acceptance serialization boundary**; a value the client displayed earlier is advisory and may be stale. Where the authoritative remaining amount is insufficient at processing time the acceptance is **rejected** — the server never silently reduces, resizes, clamps or partially fills the requested amount. Rationale: the allocated amount must record explicit user intent; missing or truncated client input must fail closed rather than escalate to a maximum allocation; a concurrent change to the Offer must not silently alter the amount the user intended; and audit or dispute records must carry an explicit accepted amount. Monetary representation is unchanged and continues to follow §11.9. **No new error identifier was introduced and no persisted enum was added.**

**11.8a — Withdrawal semantics, clarified by human decision 2026-08-22.** A seller **withdraws the
Offer's remaining availability**, **closing the Offer to further matching**. This is **not** a
cancellation cascading from Offer to Match. It must not cancel or invalidate an existing Match, alter
its `allocated_amount`, unwind a Transaction, terminate a Settlement, return capacity already
committed to a valid allocation, or affect any other Match under the same Offer. Existing
Match/Transaction/Settlement history remains intact and each allocation stays an **independent
failure domain**; only the uncommitted remainder becomes unavailable to new acceptances. Committed
allocations are unwound only through the per-allocation dispute / cancellation-with-counterparty-consent
flow. **No persisted enum was introduced for this clarification.**

**11.9 — Monetary arithmetic.** Offer and allocation arithmetic uses **exact integer minor units**
with explicit currency exponent/scale; never binary floating point. This **marketplace/allocation
arithmetic** is documented as distinct from **ledger posting representation**, which remains
governed by ADR-002 (`amount_minor` BIGINT + `scale` + `currency_def_version`, `ROUND_HALF_EVEN` at
exactly one conversion point). **ADR-002 semantics are not rewritten.** The `NUMERIC(18,2)` column
types in the contract are marked as proposed shape, not approved semantics.

**11.10 — Rate rule.** All ±15% symmetric-band language is superseded. Canonical:
`seller_rate ≤ applicable approved reference ceiling`, **hard block** above, **no approved floor**.
Validated at publication, re-checked at acceptance, **locked** on the resulting Match; never
silently re-priced. If a changed ceiling invalidates an unmatched remaining Offer, the Offer is
**paused/revalidated** — the seller-selected rate is never silently modified. Reference-rate
provider, update cadence, staleness policy and provider-unavailable behaviour remain **OPEN /
configurable**. `VAL_422_RATE_OUT_OF_BAND` is superseded by a ceiling-specific semantic error whose
**identifier is proposed, not frozen**.

**11.11 — Bilateral confirmation removed.** `POST /v1/matches/{match_id}/confirm`, both-party
confirmation and the 30-minute confirmation expiry are **superseded**, with no replacement value.
Acceptance alone establishes the allocation, fixed by the server-set trusted `accepted_at`.
**Tie-break added 2026-08-24:** `accepted_at` remains the primary ordering key, and equal
timestamps are resolved by a unique server-generated ordering key assigned within the same
acceptance serialization boundary — total order `(accepted_at ASC, server_order_key ASC)`,
server-authoritative, deterministic and replayable. This adds determinism to the existing rule;
it does not change who wins under distinct timestamps, and it introduces no rate-based or
ranking-based priority. The persistence mechanism for the ordering key is
implementation-dependent and is not fixed here.

**11.12 — Two-window lifecycle and ADR-001 Amendment A1.** Preparation window → derived
`ALLOCATION_FUNDING_READY` → funding window. Partner provisioning must not become actionable before
readiness. Recorded as **ADR-001 Amendment A1** (§14), approved 2026-08-22, under DEC-003 — **no new
ADR or DEC number**. The amendment adds a precondition only: exactly-two-legs, the 9 leg states, the
10 phases, all 13 transitions, irreversible `PAID_OUT`, and authenticated-partner-webhook funding
truth are **all unchanged and explicitly protected**. Hard-coded values withdrawn: the 30-minute
match expiry and `Offer.settlement_window_hours 1–72`. **No replacement durations invented** —
preparation duration joins the governance-deferred set; funding duration remains **U-2 TBD**.

**11.13 — Pre-funding replacement matching.** Preparation failure terminates the allocation with
attributable cause, returns its amount to the Offer's remaining capacity, leaves other allocations
unaffected, and permits a fresh eligible acceptance — the same participant returning receives a
**new** trusted timestamp. Recorded in ADR-001 §14.5 as **distinct from** post-funding rematching,
recovery and unwind, which concern legs holding or having moved customer funds.

**11.14 — BeneficiaryAccount.** Added to the API/data documentation as the canonical model for the
**existing `BENEFICIARIES` concept** — extended, not duplicated, not renamed. Profile-level,
`User → 0..n`, with validation states expressing pending, validated, failed/rejected and
invalidated. **Only an eligible validated beneficiary satisfies `ALLOCATION_FUNDING_READY`.**
Selection is **per allocation**; different allocations under one Offer may use different
destinations. Invalidation semantics across the funding boundary are recorded in ADR-001 §14.6, with
resume-versus-new-deadline behaviour left **OPEN / CONFIGURABLE**. No raw bank-detail storage or
tokenisation guarantee beyond existing approved guidance was invented.

**11.15 — PayoutExecution.** Added as **structure only**: `SettlementLeg → PayoutExecution 0..n`,
integer minor units, exact-total invariant against the amount due for that leg. **Children are not
additional SettlementLegs**; the exactly-two-leg rule and `UNIQUE(settlement_id, party_role)` are
unchanged.

> **OPEN — REQUIRES CANONICAL RECONCILIATION.** Aggregate child-to-leg derivation where some
> children succeed irreversibly and others fail or pause is **not resolved**. `PAID_OUT` is **not**
> redefined; the aggregate meaning of **T-7, T-8 and T-9 is unchanged**; no implementation may
> derive leg state or a phase transition from child records. **This remains a production
> financial-semantics blocker.**

**11.16 — KYC and MFA.** Conceptual `KycCase` maps to existing **`KYCCases`**, which is canonical
for onboarding and review history; nothing is renamed. The TDS `KYC_PROFILES` concept, if retained,
is recorded as a **summary/projection/current-profile representation**, not a competing case
lifecycle. `MfaFactor` is documented conceptually as `User → MfaFactor 0..n` with persistence and
policy marked **OPEN — Decision 2**; no qualifying factors, enrolment policy, factor hierarchy,
timeout or recovery rules were invented.

**11.17 — Corridor and jurisdiction.** `CorridorConfig` and `JurisdictionProfile` are recorded as
**versioned configuration schemas and policy interfaces** — **not** runtime-editable persisted
entities. No production corridors, currencies, providers or legal requirements were populated.
Decision 3 remains open/configurable; Decision 4 remains external Legal/Compliance authority.

**11.18 — Authoritative funding, unchanged.** A user or client action **must not** create
authoritative `FUNDED` state. The ratified authenticated, signature-verified regulated-partner
webhook mechanism stands, and ADR-001 was **not** broadened for any hypothetical alternative.

**11.19 — Canonical glossary.** Added at `DOCUMENT_INDEX.md` §2A, covering MatchAllocation ↔ Match,
KycCase ↔ KYCCases, BeneficiaryAccount ↔ BENEFICIARIES, plus Offer, Settlement/SettlementLeg,
PayoutExecution, CorridorConfig/JurisdictionProfile and MfaFactor. UI documents may use the
conceptual terms as product language without implying separate persisted entities; short mapping
notes were added where those terms appear.
