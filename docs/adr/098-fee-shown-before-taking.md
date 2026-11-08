# ADR-098 — The Fee Is Shown Before Taking an Offer

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-08 |
| **Decision ID** | DEC-110 |
| **Authority** | Owner, 2026-11-08. The fee stays a **flat 1%** of what each side sends (ADR-021; "Flat 1%, nothing else"; the banded Fair Fee of PR #121 was not adopted). Asked whether the take-offer screen should still show the exact fee before confirming, at 1%, the owner said **"yes"**. |
| **Changes** | Nothing about the fee amount. ADR-021 §1 already requires the fee to be "shown before confirming, on the trade screen"; in server builds the take-offer screen did not show it until the escrow opened. |

## Decision

- **Quote route:** `GET /api/v1/fees/quote?currency=&amount=` returns `{currency, amount, fee, total}` as decimal text, where `fee` is 1% of `amount` rounded half to even (`coordination_fee_minor`, ADR-019 §2). It is:
  - **signed-in only** (`CurrentPrincipal`) and **limited per customer** (`limit_by_account`);
  - **strict on input:** currency from a fixed list (NGN, USD, GBP, EUR); amount up to 13 digits with up to 2 decimals and above zero, otherwise 422;
  - **read-only:** it reads nothing about any account and writes nothing.
- **For showing only.** The fee that counts is still worked out on the server when the escrow opens (`SettlementService.create_for_match`), from the deal itself. A changed app cannot lower it.
- **Take-offer screen (server builds):** 300 ms after typing stops, the app asks for the quote on what the taker sends (naira for an offer, the foreign currency for a buy request) and shows *"Xspeeria fee: … You pay … into escrow."* No line is shown if the quote fails or the amount is more than is available; the escrow screen still shows the server's recorded fee.

## Evidence

- `backend/tests/integration/test_fee_quote.py`: 1% values, no minimum or maximum, half-to-even rounding, 401 without a session, 422 on bad input.
- `backend/tests/unit/test_route_access.py`: the route is not public.
- `mobile/__tests__/take-offer.test.tsx`: the line is shown from the server's quote, and absent when the quote fails or the amount is too much.
- Translations in all app languages.
