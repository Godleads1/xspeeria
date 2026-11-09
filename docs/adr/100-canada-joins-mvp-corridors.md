# ADR-100 — Canada Joins the MVP Corridors (Nigeria ⇄ Canada)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** — 2026-11-09 (decision recorded; not built) |
| **Decision ID** | DEC-112 |
| **Authority** | Owner, 2026-11-09: "The first corridors are Nigeria ⇄ UK and Nigeria ⇄ US we are starting with both and canada", then "do this" to recording Canada as a third first corridor. |
| **Amends** | `043-mvp-corridors-uk-and-us.md` (DEC-050): the MVP corridors are now **Nigeria ⇄ UK, Nigeria ⇄ US and Nigeria ⇄ Canada**. The 5-Year Business Plan §8 had Nigeria ⇄ Canada in Year 2; it now carries a pointer here. |

## Consequences

- **MVP currencies:** NGN, GBP, USD and **CAD**. **Countries:** NG, GB, US and **CA**.
- **Same model as the other corridors:**
  - Xspeeria never holds money.
  - Each side pays into an escrow at a partner bank in its own country, so the Canadian leg needs a **Canadian partner bank** (F-8, ADR-001).
  - The fee is 1% per side, in CAD on the Canadian side (ADR-021).
- **Before Canadian go-live (owner and lawyer):**
  - Canadian legal review, including money-services-business registration and provincial rules;
  - a Canadian partner bank;
  - Didit document coverage for Canada;
  - privacy-law review (PIPEDA).
- **The plan is not recalculated here.** Business Plan Tables 8.1 and 10.1 still show one corridor in Year 1. The re-model already pending at 1% (PENDING_ACTIONS) now also covers three launch corridors.

## Not built yet: what Canada needs in the product

| Area | Today | Needed |
|---|---|---|
| Currency definitions | No CAD row (the `currency_definitions` table is immutable, CD3) | A migration adding CAD |
| Identity checks per country (ADR-042) | NG, GB, US (database rule, server, app) | Add CA |
| Settlement jurisdiction | `JURISDICTION` = NGN→NG, USD→US, GBP→GB | CAD→CA |
| Payout account form (ADR-022) | NGN, USD, GBP, EUR | A CAD form. *Owner to choose the fields*, e.g. institution number, transit number and account number. |
| Fee quote, limits and app country lists | NG, GB, US | Add Canada |

## Evidence

Decision recorded only; no code changed. Linked documents updated: ADR-043 status, Business Plan §8 note, the PRD line 22 note, ADR-042, the store listing and PENDING_ACTIONS.
