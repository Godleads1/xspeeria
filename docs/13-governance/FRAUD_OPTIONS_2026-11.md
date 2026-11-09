# Fraud Checks to Replace the 24-Hour Payout Hold: Options (November 2026)

**For the owner to decide** (FX-03; readiness H-6). The owner removed the 24-hour payout hold on 19 Oct 2026 (DEC-044): payouts go out as soon as both sides have paid in. The readiness review asks for compensating checks before real payouts. Nothing here is built or decided.

## What already protects deals

- **Identity checks** with Didit, including AML screening; one person, one verified account (ADR-039–042).
- **Trade limits by tier**, daily and monthly (ADR-058).
- **Codes or a face check** to confirm new payout accounts and each deal's payout choice (step-up, ADR-054).
- **Fraud alerts** (ADR-068):
  - PIN and code lock-outs;
  - 3 or more disputes against one person in 30 days;
  - a payout account in a name that doesn't match the verified name.

  Alerts **never block by themselves**.
- **Disputes** pause a deal's escrow. Staff can suspend customers, refund through a two-person reversal, and pause all deals.

## The main risk the hold covered

**Account takeover, then a fast payout.** Someone gets into an account, adds their own payout account, takes a deal and is paid before the owner notices. The second check (code or face) makes this harder but not impossible: a SIM swap or a stolen email inbox is enough.

## Options

| # | Check | What it stops | Cost to honest users | Effort |
|---|---|---|---|---|
| 1 | **New payout account waits.** A payout account added in the last *N* hours (e.g. 24) can't receive a payout yet; older accounts pay at once. | Takeover → new account → instant payout | Only the first deal to a new account waits | Small |
| 2 | ~~Block when the payout name doesn't match the verified name~~. **Ruled out by the owner, 2 Nov 2026 (DEC-007):** payouts to other people's accounts are allowed (e.g. a school's account for fees). | — | — | — |
| 3 | **New-user caps.** Lower limits for the first 7–30 days after verification, on top of the tiers. | Fresh fake or mule accounts moving large sums | New users trade smaller amounts at first | Small |
| 4 | **Recent-security-change pause.** After a PIN reset, phone or email change, or sign-in on a new phone, payouts wait *N* hours. | Takeover via reset or SIM swap | Rarely felt | Medium |
| 5 | **Staff "hold this deal" button.** Compliance can hold one deal's payout from a fraud alert while they look (holds exist today; there's no button for this case). | Lets alerts act fast without suspending the person | None | Small |
| 6 | **Velocity rules raise high alerts:** many deals in a short time, many payout accounts added, or one payout account used by several customers. | Mule networks, scripted abuse | None (alerts only) | Medium |
| 7 | **Large first payout needs a second person.** Above an amount, the first payout of a new account or user waits for a Compliance approval. | High-value one-off fraud | Some large first deals wait for review | Medium |

## Suggested starting set

- **1** (new payout account waits 24 hours). This matters more now that payouts may go to anyone's account (DEC-007): it's the main brake on a takeover that adds the fraudster's account.
- **5** (hold-this-deal button). **Chosen and built (owner, 3 Nov 2026): ADR-092.**

Together they cover the takeover path, and honest users rarely notice them. Add **3** if the bank or the lawyer asks for new-user limits. The numbers above are starting points for you to set.

**Third-party payouts (owner, 2 Nov 2026, DEC-007): allowed.** The owner then chose: the `payout_name_mismatch` alert fires **only when the account is new and used straight away** (within 24 hours of being added), and adding an account or choosing a deal's payout accounts asks the customer to confirm exactly who will be paid (ADR-083).

**New payout accounts: no wait (owner, 3 Nov 2026, DEC-092). Option 1 is not chosen.** The owner keeps instant payouts and relies on what is built:
- double confirmation when an account is added (ADR-083);
- a fraud alert when a new account is used within 24 hours (ADR-083);
- a "payout account added" email with a "this wasn't me" link that freezes the account (ADR-084).

Accepted risk: an account takeover that adds a new account and takes a deal at once can be paid out before the alert is seen or the owner reads the email. If the partner bank or the lawyer requires a cooling-off period on new payees, this decision is reopened.

**Lawyer, 3 Nov 2026 (DEC-097): third-party payouts are acceptable under AML rules.** Still confirm with the partner bank: some banks require extra checks for them.

**What I need from you:** which numbers to use for options 1, 3, 4 and 7, if chosen, and who reviews held payouts (Compliance Officer?). The partner bank may also have rules of its own: ask them (C-1).

**Owner, 9 Nov 2026: no further checks before launch (options 3, 4, 6 and 7 not chosen).** Asked which of the remaining options to add, after discussing the takeover route (SIM swap → the victim's own bank pays into escrow → payout to the thief's account abroad), the owner answered: "just these two": the **face check on a new phone** against the identity-check photo (ADR-054) and the **"this wasn't me" email link that freezes the account** (ADR-084). The fraud alerts and the staff deal hold already built stay (ADR-068, 083, 092).

Accepted risk: if the face check is beaten (for example on the victim's own unlocked phone), a takeover that adds a new payout account and takes a deal can be paid out before the alert is seen or the owner reads the email. Reopened if the partner bank or the lawyer asks for any of these checks.
