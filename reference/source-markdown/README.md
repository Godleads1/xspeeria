# XSPEERIA — COMPLETE DOCUMENT SUITE (Combined, v2 — fixes applied)

This folder merges everything from your three uploads. There are **three
distinct sets** inside — read this before using them, because two of them
cover the same ground from different angles and were likely produced in
different sessions. They are not guaranteed to agree with each other on
every detail (tech stack, phasing, terminology). Pick one as your source of
truth per project, don't blend both into the same Claude Code run.

## Fixes applied in this version

1. **Wallet/balance contradiction removed.** `01_Master_Prompt_Kit_MD/docs/UI_UX_SCREEN_SPEC.md`
   previously specified a Home Screen "Balance Card" with a stored balance
   and a "Wallet ID," and a "Deposit" quick action — directly contradicting
   the wallet-less/non-custodial principle stated throughout this suite.
   Rewritten as a "Status Overview Card" showing marketplace/transaction
   status instead, with no balance or wallet ID anywhere. Same fix applied
   to the matching "Balance Card" component name in `DESIGN_SYSTEM.md`.
2. **Fabricated authority removed.** `02_Full_Document_Book_DOCX/07_Banking_Integration_Specification.docx`
   listed its Document Owner as "Payments Lead / Deloitte Banking & Risk
   Partner" — there is no actual Deloitte relationship. Changed to "Payments
   Lead (Internal) — external banking/risk advisor TBD, pending Legal
   engagement," which is honest about what's actually confirmed.
3. **Wallet/balance contradiction removed (second location).** The same
   "Balance Card" contradiction fixed in item 1 above was also still present,
   unfixed, in `02_Full_Document_Book_DOCX/04_Product_Design_Specification.docx`
   — a stored balance, a "Wallet ID," a "Deposit" quick action, and a
   "hide the balance" accessibility recommendation, all across its layout
   spec, component tree, navigation, states, and token-usage tables (13
   occurrences). Rewritten to "Status Overview Card" throughout, matching
   `UI_UX_SCREEN_SPEC.md` and `DESIGN_SYSTEM.md` exactly: active FX request
   count, pending settlement count, preferred currency-pair shortcut — no
   balance or wallet ID anywhere. Validated by XML structure check
   (paragraph count unchanged) and visual PDF render.

Everything else is unchanged from the original uploads.

---

## 01_Master_Prompt_Kit_MD/
A lean, repo-ready kit: `MASTER_PROMPT.md` is the first message you paste into
Claude Code. `AGENTS.md` (with `CLAUDE.md` pointing to it) is what actually
governs the agent's behavior in-repo — read PRD → Architecture → Security →
Design System → propose plan → wait for approval → implement → test → update
PROGRESS.md. `docs/` holds the seven supporting specs (PRD, Architecture,
Security, Design System, UI/UX Screen Spec, API Data Dictionary, Execution
Manual). These are intentionally short stubs (10–30 lines each) — treat them
as a checklist, not a complete spec; the DOCX book below covers the same
ground in far more depth.

**Use this when:** you want the shortest path to opening VS Code and starting
Phase 0 today.

## 02_Full_Document_Book_DOCX/
The longer, more formal 8-document series, renumbered into one sequence:

1. Business Requirements Specification (BRS)
2. Technical Design Specification (TDS)
3. Compliance & Operations Manual (COM)
4. Product Design Specification (PDS)
5. API Contract & Data Dictionary (API-DD)
6. Infrastructure & DevOps Handbook (INFRA)
7. Banking Integration Specification (BANK-INT) — *fixed, see above*
8. Investor & Board Strategy Book (STRATEGY)

This set is genuinely strong: consistent Python/FastAPI + Decimal-only money
across every document, disciplined about flagging assumptions instead of
inventing banking partners or licenses, real idempotency/ADR/reconciliation
detail. It has needed real fixes too — see items 2 and 3 above — so skim
before treating any single doc as final, not just for the batch-consistency
reason noted below. **Use this when:** you need something to hand to a
co-founder, investor, compliance advisor, or bank/PSP partner, or as the
deeper reference behind whichever master prompt you run Claude Code against.

⚠️ Note: docs 01–03 came from one batch and 04–08 from another. Renumbered
into a single sequence by content — skim each table of contents before
treating it as one continuous, contradiction-free book.

## 03_Python_Backend_Master_Prompt/
The Python/FastAPI-backend master prompt built earlier in this conversation —
same product scope, backend language set to Python, with a concrete
security-control section (Argon2id, Pydantic v2 strict validation, SQLAlchemy
parameterized queries, Decimal-only money, HMAC-verified webhooks, mypy/
bandit/pip-audit in CI, etc.) and the Claude Code + VS Code phase-by-phase
workflow used on CargoFlow.

**Use this when:** you've decided on Python for the backend — designed to be
pasted directly into Claude Code as your opening message.

---

## Recommended path if you're starting today

1. Decide backend language first (Node/TS vs Python) — don't run both prompt
   styles against the same repo.
2. If Python: start from **03**, it's the most Claude-Code-ready.
3. If Node/TS: start from **01**'s `MASTER_PROMPT.md`.
4. Keep **02** on hand as reference material and for anything you need to
   share outside the coding agent (investors, compliance, banking partners).
5. Whichever you pick, scaffold the repo yourself first, save the chosen
   master prompt as `AGENTS.md`, and only then open Claude Code.
