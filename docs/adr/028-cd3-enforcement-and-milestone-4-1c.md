# ADR-028 — CD3 Enforcement Built; Milestone 4.1C Authorized

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-034 |
| **Authority** | Product owner, 2026-10-18, asked "Build the CD3 lock … Authorise Milestone 4.1C, the first records with amounts, starting with offers. Should I go ahead with both?": **"Yes"** — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Implements** | DECISION 4.1B-CD3 (HUMAN-APPROVED 2026-09-01, rulings H1–H9) — Stage 1 and Stage 2 |
| **Authorizes** | **Milestone 4.1C** (offers: publish, list, edit rate, withdraw). Acceptance and `Match` are the next milestone and need their own authorization. |
| **Numbering note** | The CD3 ruling said "ADR-003 must not be created under this ruling". ADR-003 was later used for the brand/navigation decision (2026-10-16), so this CD3 record is ADR-028. |

## 1. Product framing (product owner, 2026-10-18)

"Xspeeria does not hold money … the user pays the money to an escrow account and the partnering
bank settles the payout account." Records with amounts (offers, matches, trades) are
**information about deals**, not money. Funds exist only at the partner bank; a status such as
"paid into escrow" changes only on the bank's confirmation (Standing Standards §2, ADR-001/002).
The documents' term "money-bearing" means "carrying an amount", nothing more.

## 2. CD3 — what was built (migration 0005)

| Ruling | Built |
|---|---|
| H1 database-level | PostgreSQL triggers on `currency_definitions`; the application is not the control |
| H2 / H3 | Row trigger refuses every `UPDATE` and `DELETE`, referenced or not |
| H4 | Separate statement trigger refuses `TRUNCATE` |
| H5 whole-row | Any column, `created_at` included; even a no-op update is refused |
| H6 Stage 1 | The triggers above (refuse even the owner) |
| H6 Stage 2 | `NOLOGIN` role `xspeeria_app` for the running app: `SELECT, INSERT` only on `currency_definitions`; not owner, so it cannot disable or drop the triggers; explicit grants on the AUTH tables. Deployments create a login user in this role; migrations run as the owner. |
| H7 | Refusals raise SQLSTATE `XS001` with a message starting `CD3:` — written to the PostgreSQL server log, a fixed signature to alert on. Alert wiring needs the monitoring tool (`PENDING_ACTIONS.md`). |
| H8 | O3 — trigger + privilege separation, staged |
| H9 | `downgrade()` refuses unless `-x cd3_downgrade=authorized`; using it outside a developer database needs explicit human authorization |

INSERT stays permitted (version-only correction). Residual risk as stated in the ruling: a
superuser or the owner role can still drop the triggers.

Tests: `backend/tests/integration/test_cd3_enforcement.py` (19 tests on PostgreSQL 16), including
a guard that every table grants the runtime role explicitly. Step 9 stays pinned to revision 0002.
