# ADR-043 — MVP Corridors: Nigeria ⇄ UK and Nigeria ⇄ US

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** — 2026-10-19 |
| **Decision ID** | DEC-050 |
| **Authority** | Product owner, 2026-10-19: "we are launching us and uk at the mvp stage"; confirmed **"Yes, UK and US at MVP"** when shown the conflict below. |

## Conflict resolved

The 5-Year Business Plan (source of truth, §8) and the PRD (line 22) set the pilot/MVP corridor to **Nigeria ⇄ UK only**, with **Nigeria ⇄ US in Year 2**. The product owner moved Nigeria ⇄ US into the MVP. Those documents carry a note pointing here; their other content is unchanged.

## Consequences

- MVP currencies: NGN, GBP, USD. Identity checks per country (ADR-042).
- **Before go-live:** a US partner bank (escrow leg in the US) and US legal review (money-transmission licensing, SSN and privacy law, OFAC) — in addition to the UK equivalents. Xspeeria still never holds money (ADR-001); the escrow simulation remains simulation only (ADR-037).
- Financial projections in the Business Plan assume one pilot corridor in Year 1; they are **not** recalculated here.
