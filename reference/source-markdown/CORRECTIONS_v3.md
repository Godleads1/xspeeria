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

## 4. Not touched

Non-corridor, non-pricing content (KYC flows, dispute operations, security
architecture, matching-engine logic, org chart/advisor detail, market-sizing
methodology) was left as-is. The 5-Year Business Plan introduces a named
leadership team and advisor list not present elsewhere in the suite — no
other document names individuals, so there was nothing to reconcile there.
