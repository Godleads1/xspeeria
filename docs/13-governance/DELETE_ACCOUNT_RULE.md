# Delete Account — What Is Kept and for How Long

**Status:** part approved by the owner, 3 Nov 2026 (DEC-106). The rest is a suggestion awaiting the owner's decision. **Nothing is built yet.**

## Approved (owner, 3 Nov 2026: *"yes to this"*)

- **Kept 5 years from the account's closing date, locked away:**
  - name, phone, email, date of birth;
  - identity-check results and ID images;
  - payout accounts used;
  - deals, disputes, refunds and fraud alerts.
- **Who sees them:** only Compliance, read-only. They are used for nothing else.
- **The staff audit log and deal events stay 7 years,** as the financial specification already says (Appendix D, §"audit": minimum retention 7 years).

**Why 5 years:** Nigeria's Money Laundering (Prevention and Prohibition) Act 2022, s.8, requires keeping identity records for at least 5 years after the relationship ends, and transaction records for at least 5 years after the transaction. The Nigeria Data Protection Act 2023, s.34, gives a right to erasure, which can be refused where the law requires the data to be kept.
- This comes from a secondary source (Youverify, "Data retention in Nigeria: NDPA and AML").
- **The lawyer should confirm it,** including whether ID images may be kept for the whole period: `UNKNOWN — NOT VERIFIED`.

## Suggested, awaiting the owner

1. **Before deleting:** the customer confirms twice (PIN, then the second check).
   - Deleting is refused while a deal is in progress, a dispute or refund is open, or the account is frozen or under a fraud review.
   - Open offers are withdrawn automatically.
2. **At once:**
   - the customer is signed out everywhere and trusted phones are removed;
   - payout accounts are switched off;
   - the account is closed and can't sign in again.
3. **Deleted at once** (no legal reason to keep it):
   - profile photo and banner;
   - push and notification settings, device names, in-app notifications;
   - the activity log, except security events.
4. **After the 5 years:** an automatic job deletes the personal details. Amounts stay, with no name attached.
5. **Outside services:** Didit, Resend and the photo storage are asked to delete what they hold that isn't needed.
6. **The customer is told:** a confirmation email lists what was deleted and what is kept, and why.
7. **Open question:** a grace period to undo (e.g. 14 days), or none.

Apple's and Google's store rules require deleting the account from inside the app, so this is needed before the first store release.
