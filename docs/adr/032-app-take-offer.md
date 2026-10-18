# ADR-032 — Taking an Offer in the App

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — built for development builds; awaiting product-owner review |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-038 |
| **Authority** | `PENDING_ACTIONS.md` *Build* item "Connect the app's Buy button to taking an offer". Follows ADR-031, which the product owner authorized on 2026-10-18 and merged in #23. |
| **Builds on** | ADR-027 (server mode), ADR-030 (Market on the server), ADR-031 (acceptance and Match) |

## 1. What the app does (server builds only)

1. **Market › Buy › USD/GBP/EUR.** Tapping **Buy** on someone else's offer opens the new
   **Take offer** screen. Tapping your own offer still says "This is your offer".
2. The screen reads the offer **fresh from the server** (`GET /v1/offers/{id}`). The id in the
   route is untrusted: it is checked as a UUID and re-read.
3. The user enters how much to take. **Take all** fills in what is left. Asking for more than
   is available is blocked on the device, and the server checks again. "Works out to NGN …" is
   worked out exactly on the device: integer kobo, rounded half to even (ADR-002 §4.4). It is
   for display only.
4. The user enters a **fresh authenticator code**. The app calls `POST /v1/auth/step-up`
   (`trade.accept`), then `POST /v1/offers/{id}/accept` with that approval and an
   `Idempotency-Key`.
5. **Deal recorded** shows the amount, the fixed rate and the NGN total. It says that payout
   accounts and paying into the partner bank's escrow come next, and that Xspeeria never holds
   the money. **Done** returns to the Market, which re-reads the offers.

## 2. Retries

- One `Idempotency-Key` per take. It is kept across retries and replaced when the amount
  changes. A lost connection followed by **Take offer** again never makes a second Match;
  the server replays the first answer.
- An unused approval is reused on retry. It is dropped when the server answers `403`, and the
  code field is cleared after any server answer, because each code works once.

## 3. Evidence

- `mobile/__tests__/take-offer.test.tsx`:
  - the exact NGN maths;
  - the fresh read, one approval and one key;
  - the over-amount block and Take all;
  - a retry after a lost connection (same key, same approval);
  - a refused approval leading to a new code;
  - server refusals shown as written;
  - a new amount giving a new key;
  - the load error.
- `mobile/__tests__/market-server.test.tsx`: your own offer is not taken; others open Take
  offer.
- End-to-end run on 2026-10-18: a real local server and a web build with two accounts.
  1. The seller publishes 500 USD at ₦1,320.50.
  2. The buyer is told that 600 is more than is available.
  3. The buyer takes 200 with an authenticator code. The result is "200.00 USD, NGN
     264,100.00".
  4. The Market then lists 300 USD left.
  5. The seller's My Offers shows "Partly matched, Matched 200.00, Left 300.00".
