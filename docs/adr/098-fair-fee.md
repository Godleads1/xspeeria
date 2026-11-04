# ADR-098 — The Xspeeria Fair Fee (Bands, Minimum, Maximum, Maker Discount)

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-04 (step 1 of 2) |
| **Decision ID** | DEC-110 |
| **Authority** | Owner, 2026-11-04. Asked whether the 1% fee should have a minimum or maximum (open item of ADR-021 §1, `PENDING_ACTIONS.md`), the owner reviewed the proposed "Xspeeria Fair Fee" pricing model (Claude Docs, "Xspeeria Fair Fee Pricing Model") and said: **"lets use this model"**, then **"use the fee model"**. |
| **Supersedes** | The fee **amount** of `021-percentage-fee-and-split-payouts.md` §1 (flat 1% with no minimum or maximum). Everything else in ADR-021 stands: each side pays on the money it sends, in that currency, on top, into the partner bank's escrow; per trade; shown before confirming. |

## Decision

Per side, on the money that side **sends**, in that currency:

| Part of the amount sent | USD / GBP / EUR | NGN | Rate |
|---|---|---|---|
| First band | up to 1,000 | up to ₦1,600,000 | 1.0% |
| Second band | 1,000 – 5,000 | ₦1,600,000 – ₦8,000,000 | 0.6% |
| Above | over 5,000 | over ₦8,000,000 | 0.3% |
| **Minimum** per side | 0.50 | ₦800 | |
| **Maximum** per side | 30 | ₦48,000 | |

- **Maker discount:** the side that posted the offer (settlement `REQUESTER`) pays **25% less**, never below the minimum. So a maker pays at most 22.50 / ₦36,000. The side that accepts (`ACCEPTER`) pays the full fee.
- **Naira figures are fixed in naira**, never converted from dollars at today's rate.
- **GBP and EUR** use the dollar figures until the owner sets their own.
- **Exact money:** integer minor units; each band's rate applies only to the part inside that band; the sum is rounded half to even (ADR-019 §2), then held between the minimum and the maximum; the maker discount is rounded half to even again.

Worked examples (server tests): $100 → taker $1.00, maker $0.75; $2,000 → $16.00; $5,000 → $30.00 (cap); ₦1,600,000 → ₦16,000 (maker ₦12,000); ₦5,000 → ₦800 (minimum); ₦8,000,000 → ₦48,000 (cap).

## How it is built

- **Server, the only authority:** `backend/app/domain/fee_rules.py` (`SCHEDULES`, `MAKER_DISCOUNT_BPS`, `side_fee_minor`). `SettlementService.create_for_match` stores each leg's `fee_minor` from it when the escrow opens: `REQUESTER` → maker, `ACCEPTER` → taker. The old `coordination_fee_minor` / `COORDINATION_FEE_BPS` are removed. Figures live in code, not settings: changing them is an owner decision and a reviewed change, pinned by `tests/unit/test_fee_rules.py`.
- **Quote before confirming:** `GET /api/v1/fees/quote?currency=&amount=&side=` — signed-in customers only (`CurrentPrincipal`), limited per customer (`limit_by_account`), currency from a fixed list, amount as decimal text (max 13 digits, 2 decimals, > 0) or 422. It reads nothing about any account and writes nothing; the escrow works the fee out again on the server, so a quote is for showing only and a changed client cannot lower the fee.
- **App (server builds):** the take-offer screen asks for the taker's quote (300 ms after typing stops) and shows *"Xspeeria fee: … You pay … into escrow."* If the quote fails, no fee line is shown (the escrow screen still shows the server's recorded fee). The escrow screen label is now "Xspeeria fee" (was "Xspeeria fee (1%)").
- **App (demo build only):** `xspeeriaFeeMinor` in `mobile/src/features/history/data.ts` mirrors the same figures so the demo matches; demo-only currencies the service doesn't offer (CAD, AUD) use the dollar figures. The "(1%)" labels are gone.
- **Wording:** Welcome screen and FAQ updated; the FAQ answer is the only place with fee figures, pinned by `faq.test.tsx`. Translations in all app languages.

## Not in this step (step 2, waiting for the owner)

1. **Regular-trader discounts** (10% over $5k a month, 20% over $25k a month): monthly volume across currencies needs one conversion rate, and the official rate source is still open (ADR-020). Owner to choose.
2. **Welcome credit** ("first fee back after the 2nd deal"): a stored credit could be a customer balance, which `CORRECTIONS_v3.md` §9.7 / Appendix D forbid. A compliant form is a computed discount on the 2nd deal's fee, with no stored value. Owner to choose.
3. **Referral discount (ADR-009, 10% off):** still not built on the server; how it combines with the maker discount is to be decided with step 2.
4. **Legal/marketing:** Terms of Service draft §4 and the Business Plan / investor materials must state the new figures before launch.

## Evidence

- `backend/tests/unit/test_fee_rules.py` — 13 tests: the decided figures, dollar and naira sides, band edges and rounding, refusal of unknown currencies and negative amounts.
- `backend/tests/integration/test_escrow_api.py` — maker leg $200 → fee 1.50, total 201.50 (35 tests).
- `backend/tests/integration/test_fee_quote.py` — quote values, 401 without a session, 422 on bad input.
- `backend/tests/unit/test_route_access.py` — the quote route is not public.
- `mobile/__tests__/take-offer.test.tsx` — fee line shown from the server's quote; none when the quote fails or the amount is too much.
- `mobile/__tests__/fee-and-payouts.test.tsx` — demo mirror matches the server's worked examples.
