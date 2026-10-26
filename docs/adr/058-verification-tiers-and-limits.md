# ADR-058 — Verification Tiers and Trade Limits; AI Rate Forecasting Scope

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (owner) — 2026-10-20; **limits built 2026-10-26** (Tiers 0–1); Tier 2–3 checks not built |
| **Decision ID** | DEC-065 |
| **Authority** | Product owner, 2026-10-20: shared OPay's tier model ("understand this and … suggest what should be for xspeeria"); then confirmed the proposed table and limits ("… is confirmed"). On forecasting: "AI Rate Forecasting based on the economy system of countries and policies". |

## Decision 1 — tiers limit trading, not balances

Xspeeria holds no money (no wallet, no balance), so tiers cap **how much a user may trade**, counted in **naira equivalent across all their deals** (a 1,000 USD deal at ₦1,330 counts ₦1,330,000).

| Tier | Requirements | Allowed | Limits |
|---|---|---|---|
| 0 — Signed up | Phone (SMS code) + email (email code) | View the market; no trading | — |
| 1 — Verified | Didit identity check: ID + selfie + face match + AML (built, ADR-039/041/042) | Create offers/requests, take deals | ₦500,000 per day · ₦2,000,000 per month |
| 2 — Verified + BVN | Tier 1 + BVN (Nigeria; database check) + home address | Higher limits | ₦5,000,000 per day · ₦20,000,000 per month |
| 3 — Full | Tier 2 + proof of address (from the last 3 months) + source-of-funds question for large amounts | Highest limits; staff review above a set amount | ₦20,000,000 per day · ₦100,000,000 per month |

Before building: the provider checks (Didit database validation for BVN/NIN, proof of address) must be confirmed against Didit's documentation and contract; the "set amount" for staff review is still to be chosen; compliance and the partner bank should confirm the limits (Decision 4). Other countries follow the same tiers with their own documents.

## Decision 2 — AI rate forecasting (scope only)

The Market ⋮ "AI Rate Forecasting" item should forecast NGN rates from **countries' economic data and policies** (e.g. central-bank rates and policy statements, inflation, reserves, oil prices, official rate history). **Not built**: it needs approved data sources (Decision 3 — reference-rate provider), a model choice, and wording that it is a forecast, not advice or a guarantee (no investment advice; Decision 4). Until then the menu item says it is coming.

## Build notes — limits (2026-10-26)

Owner decisions on 2026-10-26: count **both sides** (deals I take and deals on my offers) **from deal start**; an unpaid deal gives its amount back; **calendar day and month in Lagos time**; Tier 3 proof of address goes **through our server** to Didit; **use Didit's BVN check** (about $0.80 a conclusive check, per Didit's public page — to be confirmed against the contract).

- **Tier 0** (signed up, no approved identity check) may look at the market (`GET /marketplace/listings` no longer needs KYC) but not trade.
- **Tier 1** = an approved identity check (or the local development bypass). Tiers 2–3 need the BVN, address, proof-of-address and source-of-funds checks (built below).
- **Enforced in `accept`** under the offer lock, after locking both people's user rows in id order, so two deals at once can't both slip under a limit. The deal's size is its naira equivalent (foreign × agreed rate, half to even, integer kobo). A deal that would take the taker over answers `TRADE_403_DAILY_LIMIT` / `TRADE_403_MONTHLY_LIMIT` with how much is left; if it would take the offer's owner over, `TRADE_403_COUNTERPARTY_LIMIT` without revealing the owner's limits.
- Deals counted: accepted this Lagos month, not expired before payout accounts were chosen, and whose escrow isn't CANCELLED / UNWINDING / CLOSED_UNWOUND.
- `GET /api/v1/users/me/limits`: tier, limits, used and left (naira text). App: Profile › KYC and limits shows them, with the tier table; the limit refusals are translated with the amount left.
- **Local development:** the identity bypass counts as Tier 1, so local deals over NGN 500,000 a day are refused like anyone else's.
- Not built: offers bigger than the owner's limit are not refused at publish (they can be part-taken); staff review above a set amount for Tier 3 (amount still to be chosen).

## Build notes — Tier 2 and Tier 3 checks (2026-10-26)

- **Table `tier_checks`** (migration 0022): one row per try — kind (`bvn`, `address`, `proof_of_address`, `source_of_funds`), status (`approved`, `declined`, `in_review`), Didit's reason code and request id, and `detail` (only the address and the source-of-funds answer). A unique index allows one approved check per kind.
- **Tier 2** = Tier 1 + approved BVN + home address. `POST /api/v1/users/me/tier-checks/bvn` sends the 11 digits to Didit database validation (`nga_bank_verification_number`) with the first and last word of the name and the date of birth from the approved identity check; only a **MATCH** approves. `POST .../address` saves the address as given (Nigeria, UK or US); once proof of address is approved it can't be changed in the app.
- **Tier 3** = Tier 2 + approved proof of address + a source-of-funds answer. `POST .../proof-of-address` takes the photo or PDF (JPEG, PNG, WebP or PDF, at most 10 MB, base64) through our server to Didit's proof-of-address check, with the expected name, address and country. `POST .../source-of-funds` records one of salary, business, savings, investments, gift, other (and an optional note).
- **Never stored or logged:** the BVN and the document (tests check the table and the logs). No transaction is held open while Didit is called.
- **Cost control:** 3 paid tries per check per Lagos day (`AUTH_429_RATE_LIMITED`). Bad input is refused before Didit is called.
- **Fails closed:** a Didit error, a timeout or an answer we don't understand is recorded as `in_review` (never approved). Nothing yet moves an in-review check on — staff review is part of the admin console (not built).
- **Local development:** with the identity bypass, a fake provider answers (BVN `00000000000` is declined, anything else approved); Didit is never called locally unless an API key is set without the bypass.
- App: Profile › KYC and limits › "Raise my limits to Tier N" opens the checks screen (BVN, address, document photo from the gallery, source of funds).
- Not built: staff review of in-review checks and of large Tier 3 amounts; confirming the Didit request fields against the contract (built from the public API pages); other countries' equivalents of BVN.

Sources checked (Didit public pages, not the contract): [BVN validation](https://didit.me/blog/nigeria-bank-verification-number-database-validation/), [NIN validation](https://docs.didit.me/api-reference/database-validation/nigeria), [Proof of address](https://docs.didit.me/core-technology/proof-of-address/overview).
