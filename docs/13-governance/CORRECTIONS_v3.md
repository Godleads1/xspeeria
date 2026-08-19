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
