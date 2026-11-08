# ADR-099 — Owner Answers, 8 Nov 2026: Corrected Accounts, Euro IBAN, Escrow Details

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** — 2026-11-08 (§2 IMPLEMENTED; §1 decided, built when the partner bank's account check exists) |
| **Decision ID** | DEC-111 |
| **Authority** | Owner, 2026-11-08, answering three open questions in `PENDING_ACTIONS.md`: "When a bank rejects a payout account and the customer corrects it, does the original deadline stand, or do they get a new one?" → **"new one"**; "Which form should euro payout accounts use (IBAN and BIC?)" → **"Iban"**; "Do you confirm the ADR-037 details (fee stored per side, 5 retries before a person is alerted)?" → **"yes"**. |
| **Resolves** | Standing Standards §15 open decision **row 10** (resume-vs-new deadline); ADR-001 §14.6 and the data dictionary's "OPEN / CONFIGURABLE" correction deadline; ADR-035 §4 open item; the EUR payout form left open by ADR-022 / ADR-035; all four ADR-037 §4 details. |

## 1. A corrected payout account gets a new deadline

- When the bank rejects or invalidates a payout account a customer chose for a deal, and the customer corrects it (chooses or adds a valid account), the window they were in **starts again**: a new deadline, rather than the rest of the old one.
- **Length (reading, to confirm):** the new deadline is as long as the window being restarted (for example 30 minutes to choose payout accounts, ADR-035). The owner said "new one" and gave no other length.
- **Unchanged (ADR-001 §14.6):** a confirmed payment stays confirmed, and payout stays blocked until the account is corrected. Neither side is paid to an account the bank has not confirmed.
- **Not built yet:** today the only bank account check is the local development one, which approves every account. An account that stops being usable before payout puts the deal on a RISK hold for a person (ADR-037). The correct-and-restart flow is built when the partner bank's account check (name check, rejection notices) is known, so that the rejection signal is not invented.

## 2. Euro payout accounts: the IBAN only

- **Form:** bank name + **IBAN**. No BIC, sort code, routing number or account type is asked for, and the server refuses one if it is sent.
- **Checks (server, `payout_rules.is_valid_iban`; same in the app):** spaces removed and letters capitalised; 2-letter country, 2 check digits, 11–30 letters/digits; ISO 13616 mod-97 checksum. This catches typos only; the partner bank confirms the account.
- **Storage as for every account (ADR-022):** the full IBAN is sealed; only the last four characters stay readable. An IBAN can end in a letter (e.g. Malta), so migration **0044** allows `[0-9A-Z]{4}` for `account_last4` (was digits only). Downgrade fails on purpose while such an account exists.
- **Still closed:** a euro **deal** still can't settle. `settlement_rules.JURISDICTION` has no EUR entry, because the euro covers many countries and no partner bank for it is chosen (F-8: each leg is domestic). Saving a euro payout account does not open euro deals.

## 3. ADR-037 §4 — confirmed

- **Fee stored per leg** (`settlement_legs.fee_minor`, 1%, half-even): **APPROVED**.
- **5 dispatch attempts** (backoff 2, 4, 8, 16 s) before a DISPATCH_FAILURE hold alerts a person (`DISPATCH_MAX_ATTEMPTS = 5`): **APPROVED**.
- **Escrow opened for a cancelled deal is left for the partner bank to close** (no "close escrow" command): **APPROVED** (owner, 2026-11-08: "yes").
- **Money that arrives after a deal is cancelled is never returned automatically.** It is kept as an exception for a staff member, who checks who sent it, whether the amount is right and whether anything looks suspicious, then has the bank return it: **APPROVED** (owner, 2026-11-08: "yes to this"). The reason is that automatic refunds are a laundering route and a payout to the wrong place can't be undone.

## Evidence

- `backend/tests/unit/test_payout_rules.py`: IBAN examples (DE, FR, NL, MT ending in a letter), typos and wrong formats refused, spaces accepted, nothing but the IBAN.
- `backend/tests/integration/test_payouts_api.py`: a euro account added by IBAN (last 4 `3000`, and `001S`), with no account number in the answer; a typo refused with 422.
- `backend/tests/integration/test_migrations.py`: head 0044, upgrade and downgrade round trip.
- `mobile/__tests__/add-beneficiary.test.tsx`: the euro form (bank name + IBAN) and the same checksum in the app.
