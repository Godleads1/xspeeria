# ADR-029 — Milestone 4.1C: Offers on the Server

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-035 |
| **Authority** | Product owner, 2026-10-18 (authorized 4.1C in ADR-028), then answered: KYC **"Local/dev only bypass"**; minimum **"₦10,000 or 10 USD/GBP/EUR"**; expiry **"Stay open until withdrawn"**; repeat guard **"24 hours"**; error name **"Approve VAL_422_RATE_ABOVE_CEILING"** — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Resolves** | Standing Standards §15 row 4 (idempotency retention: **24 hours**); ratifies the identifier `VAL_422_RATE_ABOVE_CEILING` (API contract §4.2) |
| **Scope** | Publish, list, view, edit the rate of, and withdraw an Offer. **Not** acceptance or `Match` (next milestone). |

An Offer is a **record of what a user is willing to exchange** — information, not money
(ADR-028 §1). No funds move when an Offer is created, edited or withdrawn.

## 1. Decisions

| Item | Decision |
|---|---|
| KYC | The contract requires a KYC-approved user. No KYC provider exists, so: **refused everywhere (`AUTH_403_KYC_REQUIRED`) except on a developer's computer**, where `KYC_DEV_BYPASS=true` lets signed-in, 2FA-verified users create offers. The server refuses to start with that setting unless `APP_ENV=local`. |
| Minimum | **₦10,000.00**, or **10.00** USD / GBP / EUR (`VAL_422_AMOUNT_BELOW_MINIMUM`). |
| Expiry | **None.** An Offer stays open until withdrawn or fully matched. (`expired` remains in the enum for compatibility, unused.) |
| Repeat guard | `Idempotency-Key` on publish; the server remembers each key for **24 hours** per user. Same key + same request → same answer; same key + different request → `SYS_409_IDEMPOTENCY_KEY_REUSED`. |
| Rate ceiling | ADR-020: `0 < rate ≤ official rate` (NGN per 1 unit of the foreign currency), the 17 Oct 2026 CBN snapshot (USD 1,333.26 · GBP 1,765.11 · EUR 1,491.20). Positivity first (`VAL_422_RATE_NOT_POSITIVE`), then the ceiling (`VAL_422_RATE_ABOVE_CEILING`, ratified). Checked at publish and edit; listings above the current ceiling are hidden (ineligible). |
| Corridors | NGN with USD, GBP or EUR, either direction. CAD/AUD have no official rate: refused (fail closed, ADR-020). |

## 2. Rules built (from the API contract and data dictionary)

- Amounts are exact integer minor units bound to `currency` + `scale` + `currency_def_version`
  (S4-1), with a composite foreign key to the permanent currency definitions (CD3). Input with
  more decimals than the currency allows is refused, never rounded.
- Status: `open`, `partially_matched`, `fully_matched`, `withdrawn`, `cancelled`, `expired`.
  `0 ≤ matched ≤ original` is a database CHECK.
- Edit: owner only (`AUTH_403_NOT_OWNER`), only while `open` with nothing matched
  (`RES_409_OFFER_ALREADY_MATCHED`); only the rate can change. Row lock; every change bumps
  `version`.
- Withdraw (`DELETE`): owner only; closes the remainder to matching (`withdrawn`); never cascades.
  Repeating it is harmless.
- Listing (`GET /v1/marketplace/listings`): marketplace-active offers only — `open` /
  `partially_matched` **and** within the current ceiling — for one currency pair, best rate first
  (lowest NGN rate when foreign currency is offered, highest when naira is offered), then oldest.
  Own offers are included and flagged `is_own`; other users' identities are never shown.
- The running app uses the non-owning role (`xspeeria_app`); the new tables grant it exactly
  what the service needs.

## 3. Not in scope

Acceptance and `Match`, fees (charged per trade, ADR-021), funding windows, settlement, the
mobile Market screen talking to the server, KYC itself, Decision 3 (live rate feed).

## 4. Interface details the contract leaves open — PROPOSED, need confirmation

Built so the feature works, recorded here so nothing passes as ratified:

| Item | Built as |
|---|---|
| `filter[currency_pair]` format | `USD/NGN` (source/target) |
| Page shape | `{"items": [...], "limit", "offset", "next_offset"}`; `limit` 1–50 (default 20) |
| `filter[type]` | `offer` only; `request` is refused until FXRequest exists (R5-9 open) |
| `filter[min_amount]`, `filter[max_amount]`, `sort` | Not built |
| Extra routes | `GET /v1/offers/mine` (own offers, open first) and `GET /v1/offers/{id}` (owner always; others only while marketplace-active, else `RES_404_NOT_FOUND`) |
| Missing currency definition | `SYS_503_SERVICE_UNAVAILABLE` (run `python -m app.cli.currency_definitions`) |

## 5. Evidence

`backend/tests/unit/test_offer_rules.py`, `backend/tests/integration/test_offers_api.py`
(publish, minimum, ceiling, idempotency replay/reuse/expiry/per-user, KYC, ownership, listing
order and paging, edit, withdraw, database CHECK and grants), `test_cd3_enforcement.py`
(CD3 still holds with offers referencing definitions). Full backend suite: 711 passed locally
against PostgreSQL 16 on 2026-10-18.
