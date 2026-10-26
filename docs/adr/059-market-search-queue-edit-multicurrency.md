# ADR-059 — Market Search, Location Rule, Editing Offers, Waiting Queue, Multi-Currency Buy Requests

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (owner) — 2026-10-21; corrected 2026-10-26; **Decision 1 built 2026-10-26**, Decisions 2–5 not built |
| **Decision ID** | DEC-066 |
| **Authority** | Product owner, 2026-10-21, in a design session (answers to direct questions quoted below). Owner said "build it" after reviewing the design. |
| **Design** | Claude Design canvas "Xspeeria Home — Search" (6 artboards: Home with search, Search results, Sort & filter, No results, Request in several currencies, Success) |
| **Builds on** | ADR-029 (offers; §4 marked amount filters and sort "not built"), ADR-030, ADR-056 (buy requests), ADR-057 (disputes), ADR-058 (tiers) |

Build as **five separate PRs**, in the order below. Each needs its own tests (normal, failure, abuse), server-side checks, translations and a SECURITY_EVIDENCE_REGISTER update where a requirement is touched.

## Decision 1 — Search on Home (market search)

Owner: "add a search bar for user to be able to search for all buy request or seller request from the home page … the search will include ability to sort by different things"; then "users should be able to filter by currency, sort by rate range, sort by time"; "rate range" = **filter between two rates**; time = **newest and oldest**; amount options **kept**.

- Home: a search box under the header ("Search USD, GBP, EUR offers"), a sort-and-filter button beside it, quick currency chips (USD, GBP, EUR — only currencies with an official rate; CAD left out, owner 2026-10-21), and one line saying what the user sees and why (Decision 2).
- **Sort:** best rate (default; today's order), newest first, oldest first, largest amount, smallest amount.
- **Filters:** currency; rate range (lowest–highest, NGN per unit); amount range (from–to, in the foreign currency); status — **Available now** / **Success** (Decision 4).
- Results show rate ("NGN 1,320.50 / USD"), amount, part-fill or whole-amount, age, and a Buy / Sell / Join queue action (no action on Success cards). Active filters show as chips above the list. Empty state: "No offers match" with "Post a buy request" (primary) and "Clear filters".
- **Server:** extend the existing `GET /api/v1/marketplace/listings` (correction, owner 2026-10-21: no `GET /api/v1/offers` list exists; one list endpoint, no duplicate) with validated `sort` (allow-list), `filter[min_rate]`, `filter[max_rate]`, `filter[min_amount]`, `filter[max_amount]`, `filter[status]`. Rates and amounts are decimal strings / integer minor units — never floats. Reject unknown sort keys and min > max with 422. Keep pagination limits. The part-fill switch shown in an early draft was **removed** (not requested).
- **Best-rate card:** keep the existing Home hero (dark texture, chip, contactless, "1 USD = 1,320.50 NGN"); owner asked that its **height match a typical bank-app card** (about 342 × 195 instead of 342 × 135; content spread top-to-bottom).

## Decision 2 — Location rule (who sees what)

Owner: "if i am in nigeria, i can't see request to sell naira, like if another person in other country can't see request to sell currency of that country"; country from **phone location ("google location")**; applies **everywhere** (Market and search).

- **Rule A, every country** (owner 2026-10-21: "this is what it should be. even for other users in our countries"): nobody sees listings that sell their own country's currency. A user in Nigeria does **not** see listings that sell naira (buy requests); a user in country X does **not** see listings that sell X's currency. Nothing else is hidden by location.
- Country comes from the device location (permission asked; the phone's own reverse geocoder turns it into a country — no paid API key). Store/send **only the country code**, never coordinates.
- If location is refused or unavailable: fall back to the country on the user's approved ID check; with neither, show "Turn on location to see deals".
- This is a **visibility** rule only. Location can be spoofed, so it must never decide money, limits or permissions — those stay with KYC and the server (CLAUDE.md: never trust client-supplied values for authorisation). The server applies the filter from the country the app sends, validated against an allow-list of ISO codes.
- **Changes existing behaviour:** today a Nigeria user can sell USD to a buy request from the Market Sell side (ADR-056). Under this rule those requests are hidden from Nigeria users and shown to users in every other country (taking one still needs the usual checks).

## Decision 3 — Withdraw and edit offers

Owner: "user should be able to withdraw the offer and edit the offer. if the users withdraw the offer, the offer should be removed from the market"; edit **rate and amount**; **no** editing after any part is taken.

- Withdraw is already built (`DELETE /api/v1/offers/{id}`; withdrawn offers leave the market at once).
- Add **Edit** in My Offers and My Requests, shown only while `matched_amount_minor == 0`. Extend `PATCH /api/v1/offers/{id}` to accept amount as well as rate; re-run every create-time check (ownership, limits, rate band, currency rules) server-side; refuse with 409 if a deal started meanwhile: "Someone has started a deal on this offer, so it can't be changed now. You can still withdraw what's left." Edits are audited.

## Decision 4 — Offer status, payment extension and waiting queue

Owner: status means "accepted" (taker has paid into escrow) or "available"; "we can show queue of offers based on time so if the offer person to proceed to taking offer but later failed to fund the next inline can be notified to take up the offer". Answers: filters on **market search**; accepted offers **hidden** from the market; next in line is **notified and confirms**; **one extra 5 minutes** to pay; next person has **5 minutes** to tap take; **up to 3** in a queue; a person can wait in **only one queue** at a time.

- Today: taking an offer holds that amount for 5 minutes (`FUNDING_WINDOW`); unpaid holds return to the market automatically.
- Status filter (changed by owner 2026-10-26, replacing "Waiting for payment"): **Available now** / **Success**.
  - **Available now** (default): every offer that can still be acted on. Offers someone is paying for stay in this list with an orange "Waiting for payment · N of 3 in queue" note and a **Join queue** button; they have no filter of their own.
  - **Success**: recent offers that were paid into escrow and completed, as a record of real recent rates. Green "Success" label, rate, amount and completion time only ("Completed 12 min ago"); **no button** — they cannot be taken. **Never show who traded** (no names, IDs or account details). The location rule (Decision 2) still applies.
  - Accepted (funded) offers leave the Available list; the owner still sees them in My Offers.
- The taker may ask **once** for 5 more minutes (10 minutes total).
- Queue: max 3 people per offer, one queue per person, ordered by join time. When the taker's time runs out, the first in queue is notified and has 5 minutes to take; otherwise it passes on; if nobody is left, the offer is simply available again. Leaving the queue is always allowed.
- Escrow remains a simulation; Xspeeria holds no money.

## Decision 5 — Buy requests in up to 5 currencies

Owner: "a user who want to sell nigeria can choose another other currencies make 5 desired currencies. if any one is picked and completed, the other is deleted". Answers: others **paused when a deal starts, deleted when it completes, restored if it fails**; **a rate for each currency**; **whole amount only**; **naira sellers only**.

- A buy request has one naira amount and 1–5 currencies, each with its own rate; the app shows "You get X" per currency (half-even, as `foreignMinorFor`).
- The same naira cannot fund two deals: when a deal starts in one currency, the others are hidden immediately (atomically, in the same transaction that creates the match); deleted when that deal completes; restored if it expires unpaid.
- Whole amount only — no part-fills — **for requests with 2–5 currencies**. A buy request with one currency keeps part-fills as in ADR-056 (owner 2026-10-21). Offers selling foreign currency still list one currency.
- Only currencies with an official rate can be chosen (USD, GBP, EUR today), so the practical maximum is 3 until more are added; the rule stays "up to 5".
- The location rule applies per currency: a GBP option is hidden only from users in the UK, a USD option only from users in the US (Rule A).

## Open points (decide while building, report back)

- How the multi-currency group is stored (a parent request with child offers is the likely shape) — needs a migration and an architecture review.
- Whether the queue and extension need new notification event types (add to `EVENTS` and translations).

## Corrections log

- 2026-10-21 (owner, answering questions from the build): CAD chip left out; search extends `marketplace/listings`; Rule A applies in every country; whole-amount-only only for 2+ currency requests.
- 2026-10-26 (owner): status filter is **Available now / Success**; Success lists completed trades (rate, amount, time; no names; no action); waiting offers stay in Available with their queue note.

## Build notes — Decision 1 (2026-10-26)

Choices made while building, for the owner to confirm or change:

- **Success window: 7 days.** "Recent" completed trades = settlements in the COMPLETED phase whose last update is within 7 days (`SUCCESS_WINDOW` in `backend/app/services/offers.py`).
- **Buy / Sell switch on the results screen.** Until Decision 2 (location rule) is built, the search shows a "Buy USD / Sell USD" switch, the same choice the Market tab gives today. Decision 2 will hide the side a user's country may not see.
- **The search box** reads a currency (code, word or symbol: "usd", "pounds", "€") and an amount; the amount becomes "at least this much". Other words are ignored.
- **API:** `GET /api/v1/marketplace/listings` gains `sort` (best_rate, newest, oldest, largest, smallest), `filter[status]` (available, success), `filter[min_rate]`, `filter[max_rate]`, `filter[min_amount]`, `filter[max_amount]`. With `filter[status]=success` the answer's `trades` list holds `{currency, amount, rate, completed_at}` and `items` is empty. Amount filters and sorts are in the foreign currency for both sides (a buy request's size is naira ÷ rate).
- **Waiting for payment** labels and **Join queue** are part of Decision 4 and not built yet.
