# ADR-068 — Fraud Management: Simple Rules and Staff Reports

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-26 (server, migration 0030, console) |
| **Decision ID** | DEC-075 |
| **Authority** | Product owner, 2026-10-26. Asked "Fraud Management: what should raise a fraud alert for MVP?", the owner answered **"Simple rules + staff flag"**: a few automatic checks from data Xspeeria already has, plus staff can flag a user by hand. Builds on ADR-051 A-3 (fraud alerts), ADR-060 (`fraud_alerts` permissions) and the Figma "Fraud Management" frame. |
| **Constraints** | No AI or outside vendor (any would need owner approval and a vendor review). An alert never blocks, moves or reverses anything by itself. No PINs, codes or full account numbers in an alert. SEC-008. |

## Decisions

1. **The rules.** They run in the existing background sweep (about every 30 seconds), over data Xspeeria already has:

   | Rule | Severity | Raised when |
   |---|---|---|
   | `pin_lockout` | low | The app locked the account after 5 wrong PINs (the existing SEC-003 lock). |
   | `code_lockout` | low | The account was locked after 5 wrong sign-in codes. |
   | `disputes_against` | high | 3 or more disputes were raised **against** the same person in 30 days. |
   | `payout_name_mismatch` | medium | A payout account's bank-checked holder name shares no word with the person's verified identity name. Accents, letter case and word order are ignored. **Since 2026-11-02 (ADR-083): only when that account was chosen for a deal within 24 hours of being added**, because payouts to other people's accounts are allowed (DEC-007). |

   The numbers (5, 3, 30 days) are starting values; changing them is an owner decision.
2. **Each thing raises one alert.** Every alert records what it is about: the lock-out time, the newest dispute, or the payout account. Something already raised, even if resolved, is not raised again; something new raises a new alert.
3. **Staff reports** (`staff_report`). Staff with `fraud_alerts.create` raise an alert about a customer by hand, with a severity and what happened (at least 5 characters).
4. **Working an alert** (`fraud_alerts.update`): open → in progress → resolved. Resolving needs an outcome (**confirmed** or **false alarm**) and a note. Resolved is final, and alerts are never deleted. Every step is in the staff audit log.
5. **An alert never acts by itself.** To stop a customer trading, a Super Admin suspends them in Users (ADR-062). A refund is a reversal (ADR-065). The alert screen says so and links to the customer in Users.
6. **Who** (ADR-060): the Compliance officer role has full fraud access; Super Admin has everything; Support agents and Ops admins have none unless given it.
7. **What is stored and shown:** counts, dates, the bank name and the **last 4 digits** of an account. The alert screen also shows the payout account's holder name next to the verified name. It never shows PINs, codes or full account numbers.
8. **Design corrections to Figma.** The sample types ("Card Skimming", "Phishing Scam", "Synthetic ID", and so on) are things Xspeeria cannot detect, so the Type column shows the rules above. Figma's sample people and dates are placeholders.

## Not built

- ~~Staff notifications (the bell) for new alerts.~~ Built 2026-10-27 (ADR-070).
- Any AI, device or behaviour scoring, or outside fraud vendor.
- Automatic blocking.
- Editing the thresholds from the console.

## Evidence

- `backend/tests/integration/test_admin_fraud.py`:
  - each rule raises its alert about the right person, once, and not again after it is resolved;
  - the details hold only safe facts;
  - the list, counts and one alert;
  - mark in progress, resolve (confirmed or false alarm, with a note); resolved is final;
  - the customer stays active;
  - audit entries;
  - staff reports;
  - validation (severity, note length, unknown fields, unknown customer);
  - access (support agent 403, compliance officer 200);
  - no delete grant;
  - the name-matching rule.
- `admin/__tests__/fraud.test.tsx`: plain-words findings (last 4 digits only), the real alert types with no Figma samples, raising an alert by hand, resolving with an outcome and note, read-only staff.
