# ADR-030 — Connecting the App's Market to the Server Offers

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — built for development builds; awaiting product-owner review |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-036 |
| **Authority** | Product owner listed "server marketplace" among the things to do now (2026-10-18). `PENDING_ACTIONS.md` records "Connect the app's Market screen to the server offers" as the next *Build* step after ADR-029. |
| **Builds on** | ADR-005 (Market screens), ADR-027 (server mode), ADR-029 (offers) |

An offer is a record of what someone is willing to exchange. It is information, not money,
and nothing on these screens moves funds.

## 1. What the app does in server mode

This applies only to development builds with `EXPO_PUBLIC_API_URL` set. Demo and release
builds are unchanged.

| Market action | Server mode |
|---|---|
| **Buy** › choose USD / GBP / EUR | Lists real offers from `GET /v1/marketplace/listings` (best rate first). Your own offers say "Your offer". Loading, error and retry states are shown. CAD/AUD show none, because they have no official rate. |
| **Sell** › Create Offer | Publishes with `POST /v1/offers`. One `Idempotency-Key` is used per offer being created and is kept across retries, so a retry never doubles an offer. A new key is used once the amount, rate or side changes. The server's message is shown as written (for example the minimum). |
| **Buy** › Create request | Shows "Buy requests are coming soon." Buy requests (FXRequest) are not built (R5-9 open). |
| **Sell** › list of requests | Shows "Buy requests are coming soon." |
| Tapping **Buy** on an offer | Shows "Taking an offer is coming soon." No trade is opened. Acceptance and `Match` need their own authorization. |
| ⋮ › **My Offers** | New screen: your offers with their status, rate, matched and left amounts. **Withdraw** needs a second tap to confirm. |

The list is fetched again each time the Market tab comes back into view, and each time a
currency is chosen.

Amounts and rates from the server are turned into the app's integer units only when exact.
A rate with more than two decimals is shown as its exact text. Nothing passes through
floating point.

## 2. Server change: no shared sign-in limit on offer routes

ADR-029 put the per-address sign-in limit (10 a minute, ADR-025) on the offer routes too.
That limit's counter is **shared** with sign-in. The end-to-end run showed the problem: after
signing up and browsing the Market, the app got "Too many attempts". A user browsing the
market could therefore lock themselves, and everyone behind the same mobile carrier address,
out of logging in.

The offer routes therefore no longer use it. They still need a signed-in, 2FA-verified
session. **Decided 2026-10-18:** 60 requests a minute per signed-in user (ADR-031).

## 3. Evidence

- `mobile/__tests__/market-server.test.tsx`: row conversion, listing, load error and retry,
  publish with one key across retries, server refusals, the rate ceiling, the coming-soon
  states, My Offers withdraw with confirmation, and the request format.
- `backend/tests/integration/test_offers_api.py::test_browsing_offers_does_not_use_up_the_sign_in_limit`.
- End-to-end run on 2026-10-18 against a real local server, using a web build of the app:
  1. Sign up with 2FA.
  2. A 5 USD offer is refused by the minimum.
  3. A 500 USD offer at ₦1,320.50 is published.
  4. It is listed as "Your offer, Best Offer".
  5. It is withdrawn under My Offers.
  6. The Market then shows no offers.
