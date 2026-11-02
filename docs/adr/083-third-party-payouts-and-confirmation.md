# ADR-083 — Payouts to Anyone's Account, Confirmed Twice; New-Account Alert

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 |
| **Decision ID** | DEC-090 (resolves **DEC-007**) |
| **Authority** | Product owner, 2026-11-02: *"the customer can choose any payout account, it does not have to tally with customers name. the payout account can be to pay my sons school fee. so i will add the school account details not mine"*. Then: *"Only alert when the account is brand new and used straight away … when customer is inputting the payout, confirmation can be requested so we are sure the customers want the exact payout account."* |
| **Amends** | Banking spec v1.1 §3.3 (payout accounts no longer need to match the user's name; note added there). ADR-068 rule `payout_name_mismatch`. ADR-035/036 (app wording). |

## Decisions

1. **Third-party payouts are allowed (DEC-007).** A customer may be paid into any bank account: their own, a relative's or a school's.
   - The server never required the payout account to be in the user's name (the rule was in the app's wording only), so no server rule changes.
   - **Paying in is unchanged:** it must come from an account in the customer's own name (ADR-054 note).
2. **Two confirmations when adding an account** (`AddPayoutAccountScreen`):
   1. **Check the details** before anything is sent: currency, bank, the full account number as typed, and routing or sort code. The warning reads "a payment to a wrong account may not come back". The customer chooses *Yes, add this account* or *Edit the details*. Then "Confirm it's you" (ADR-054), as before.
   2. **Who is this account?** The holder's name the bank returned is shown, and the customer chooses *Yes, that's right* or *No, remove it*. *No* removes it at once (with "Confirm it's you") and asks them to check the number. If the bank hasn't confirmed the name yet, the app says so; the account can't be used until the name is confirmed (ADR-035).
3. **Before the final payout choice for a deal** (`ChoosePayoutScreen`):
   - each account shows its holder's name;
   - *Confirm payout accounts* opens **Check who will be paid**: each account's holder name, bank, last 4 digits and amount, with the same warning;
   - the customer chooses *Yes, pay these accounts* (then "Confirm it's you") or *Change*.
4. **The fraud alert `payout_name_mismatch` (ADR-068) now fires only for an account in another name that is brand new and used straight away.** That means it was chosen for a deal **within 24 hours of being added** (`NEW_ACCOUNT_WINDOW`).
   - A school's account added earlier and used later raises nothing. That is the normal case now.
   - A new account in someone else's name used at once is the pattern of a stolen account.
   - Deal choices from the last 7 days are scanned. One alert per account, as before.
   - The 24 hours is a starting value; changing it is an owner decision.

## Consequences

- **The 24-hour wait for new payout accounts** (fraud options paper, option 1) becomes the main protection against a stolen account paying out to a fraudster, because a different name is now normal. It is not built: the owner decides.
- **Still open:** whether third-party payouts are acceptable under the partner bank's and the law's AML rules. Some banks require screening of the receiving name or limits. Ask the lawyer and the bank (C-1, C-2).

## Evidence

- `backend/tests/integration/test_admin_fraud.py`: a school's account added 2 days before use raises nothing; the same account added 1 hour before use raises `payout_name_mismatch` for that customer; the existing rules test still passes.
- `mobile/__tests__/payouts.test.tsx` (14 tests):
  - the review shows exactly what was typed, before anything is sent;
  - *Edit* keeps the typed values;
  - the bank's name is shown after adding;
  - *No, remove it* removes the account with a confirmation;
  - "name not confirmed yet" is handled;
  - the deal review lists holder, account and amount, leaves out accounts with nothing assigned, and *Change* sends nothing.
- `mobile/__tests__/languages.test.tsx`: all new sentences in 5 languages; the old "must be in your own name" sentences removed.
- Full app suite: 711 passed. Full backend suite: see the PR.
