# ADR-056 — Buy Requests as Offers Paying Naira; Advert Placeholder and Demo Card Stay

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (owner) — 2026-10-20; Decision 1 **IMPLEMENTED** 2026-10-20 |
| **Decision ID** | DEC-063 |
| **Resolves** | R5-9 (FXRequest active-MVP status) for the app: buy requests are active in the MVP, built as Offers paying naira (no separate FXRequest record) |
| **Changes** | ADR-051 row 5 ("Hide both [Cards and Adverts] for MVP") for **adverts**: advert placement is managed from the web admin |
| **Authority** | Product owner, 2026-10-20: Q1 "How should a buy request work?" → **"A"** (same as an offer, saved as an offer paying naira); Q2 "Can a seller take only part of it?" → **"Yes"**. On adverts: "the place advert here is done from the web admin, and then everyone using the app sees it in that same location. the size must fit the advert placeholder. so let the advert placeholder still stay in the mvp until the web admin changes it." On cards: "users can request a card … a physical card … naira card spent in Nigeria, dollar card spent in USA … let the demo card still stay so user can understand what their card will look like." |

## Decision 1 — buy requests (built)

"I want to buy 1,000 USD at ₦1,330" is published as an **Offer** with `source_currency = NGN`, `target_currency = USD`, `source_amount = amount × rate` (₦1,330,000.00, half to even, ADR-019) and the same rate. Every Offer rule applies unchanged (ADR-029/031): ₦10,000 minimum, open until withdrawn, rate > 0 and ≤ the official rate, part-fills allowed with the same minimum rule, idempotent publishing, acceptance serialised on the Offer (Standing Standards §7.10). No buyer-side rate policy is invented: the buyer's rate is the Offer's `desired_rate`.

- **Buy** tab → "Create request" publishes it. **Sell** tab → lists requests for the currency (`NGN/USD`, best rate first) showing the foreign amount still wanted (naira left ÷ rate, half to even).
- A seller types the foreign amount; the app sends naira = amount × rate (or exactly the naira left for "take all"). The server computes the foreign side with the same rounding, so the shown amount and the deal agree.
- No server change: the server already supported Offers in both directions. The KYC rule per country (ADR-042) applies: the requester pays naira (Nigeria check), the seller pays the foreign currency (that country's check).

## Decision 2 — advert placeholder stays (advert upload built in ADR-067)

The "Place advert here" area stays on the Market screen in the MVP. Later, an admin uploads an advert in the web admin (sized to that placeholder) and every app user sees it there. Until then the placeholder shows. To build with the admin console: advert upload, size check, schedule, and an app endpoint that returns the active advert.

## Decision 3 — demo card stays (not built)

The Cards tab and its demo card stay so users can see what an Xspeeria card will look like. The owner's intent: users request a physical card per currency (naira card for Nigeria, dollar card for the USA) and spend from it locally. **Not built**: card issuing needs a licensed card-issuing partner, the partner's KYC and spending rules, and legal sign-off (Decision 4). Note: the no-balance rule (Xspeeria holds no money) means a card product must be designed with the partner holding the funds.
