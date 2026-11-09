# ADR-100 — Canada Joins the MVP Corridors (Nigeria ⇄ Canada)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** — 2026-11-09; product support **IMPLEMENTED** 2026-11-09 (CAD offers wait for an official-rate ceiling) |
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

## Built (2026-11-09)

The owner chose the CAD payout form on 2026-11-09: "institution number (3 digits), transit number (5 digits) and account number any".

| Area | What changed |
|---|---|
| Identity checks per country (ADR-042) | Canada (`CA`, Didit issuing state `CAN`) in the server, the app and the admin console. Migration **0045** adds `'CA'` to `ck_kyc_cases_country_allowed`; downgrade fails on purpose while a Canadian check exists. |
| CAD currency | Scale 2, minimum 10 CAD, a foreign currency against NGN. Its `currency_definitions` row comes from `app.cli.currency_definitions` (insert-only, CD3). |
| **CAD offers** | ~~Refused until a ceiling is set.~~ **Superseded 2026-11-09 by ADR-101:** the ceiling is ₦944.70, worked out from the USD ceiling and the Bank of Canada USD/CAD rate. |
| Settlement | `JURISDICTION` CAD→CA; a pretend Canadian bank for development only. |
| Location rule (ADR-059) | Someone in Canada doesn't see listings selling CAD. Tests that used Canada as "a country whose currency isn't traded" now use Japan. |
| Payout accounts (ADR-022) | CAD: bank name, **institution number (3 digits)**, **transit number (5 digits)** and **account number (digits, any length up to 17)**. Institution and transit are stored together as the bank code (8 digits); the account number is sealed like every other. Other currencies refuse institution or transit numbers. |
| Fee quote (ADR-098) | Accepts CAD. |
| App | Canada in the country lists, the CAD account form (also EUR, which was missing from the add-account screen), and translations in all app languages. The demo destination list now shows the US and Canada as available. |

**Still open before Canadian go-live:**

- the official-rate ceiling for CAD (owner);
- a Canadian partner bank;
- Didit document coverage and a Didit workflow for Canada;
- Canadian legal review.
- Sign-up phone numbers are still Nigerian and UK only (+234, +44). Adding +1 for the US and Canada is a separate item.

## Evidence

- `backend/tests/unit/test_payout_rules.py::TestCanadianAccount`: valid form; short, long or non-digit numbers refused; nothing else accepted; institution and transit refused for other currencies.
- `backend/tests/unit/test_offer_rules.py`: no CAD ceiling, so every CAD rate is refused.
- `backend/tests/integration/test_payouts_api.py::test_cad_account`: added by API, last 4 only; missing institution or transit refused.
- `backend/tests/integration/test_offers_api.py::test_cad_is_known_but_has_no_official_rate_yet`: publishing is refused and the CAD/NGN listing is empty.
- `backend/tests/integration/test_kyc_api.py`: the regions list includes Canada.
- `backend/tests/integration/test_location_rule.py`: Canada maps to CAD.
- `backend/tests/integration/test_migrations.py`: head 0045, with an upgrade and downgrade round trip.
- App: `add-beneficiary.test.tsx` (CAD form checks), `payouts.test.tsx` (the CAD request), `select-country.test.tsx` (four countries).
- Admin console: tests pass, and Canada is translated.
