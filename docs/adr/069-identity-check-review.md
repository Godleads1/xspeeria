# ADR-069 — Staff Review of Identity Checks

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-27 (server, migration 0031, console) |
| **Decision ID** | DEC-076 |
| **Authority** | Product owner, 2026-10-27, answering two questions. "Where should staff decide Didit's own In Review cases?": **"Keep in Didit's console"**. "Who may approve a check Xspeeria holds?": **"Two people"**. Builds on ADR-039 (Didit), ADR-041 (one person, one account), ADR-042 (a second country's check), ADR-060 (`kyc` permissions), API contract §3.3 (`…/decision`; the reason is shown to the user verbatim), and the Compliance Operations Manual §4.2 (oldest first; a documented reason for every decision) and §14.1 (segregation of duties). |
| **Constraints** | No document numbers stored or shown (ADR-041). Nothing changes in the Didit account. Nothing personal is logged. |

## Decisions

1. **Two kinds of waiting check:**
   - **Held by Xspeeria** (`review_reason` set):
     - `DUPLICATE_IDENTITY`: the same person looks verified on another account;
     - `IDENTITY_MISMATCH`: a second country's ID doesn't match the account;
     - `CHECKS_INCOMPLETE`: checks came back incomplete.

     Staff decide these in the console.
   - **Being reviewed in Didit** (Didit said "In Review"; no `review_reason`): decided in Didit's console. Shown read-only, and Didit's answer arrives by webhook as before.
2. **Approving needs two people.**
   1. A staff member with `kyc.update` *recommends* approval, with a reason.
   2. A **different** staff member with `kyc.approve` *confirms*, and the customer is verified and notified, or *declines* with a note, and the check stays waiting.

   The recommender can never confirm. This is checked by the server (403), by a database CHECK, and by the console. A recommendation is decided once (trigger), and only one can be waiting per check.
3. **Rejecting needs one person** (`kyc.update`) and a reason. The customer reads the reason exactly as written (contract §3.3). The recommender of a waiting approval can't reject over it; another person must.
4. **What reviewers see:**
   - the name, date of birth, ID type and issuer from the ID;
   - why the check was held;
   - for a duplicate, the other account(s) with the same ID (email, check status, account status);
   - for a mismatch, the identity already verified on the account;
   - the decision history.

   Since this ADR, a held approval **keeps the identity facts it was approved with** on the case, which before were dropped. The customer still doesn't see them until the check is approved. Checks held before this change, and checks missing a name or date of birth, can only be rejected; the customer then checks again.
5. **One ID, one account still holds.** While another account's check with the same ID document is approved, this one cannot be approved (the ADR-041 unique index; 409 with a plain explanation).
6. **Contract deviation.** Instead of one `POST /v1/admin/kyc/cases/{id}/decision`, the console uses `recommend`, `confirm`, `decline` and `reject` under `/api/v1/admin/kyc/cases/{id}/…`, because the owner chose two-person approval. The rules are the same: `kyc` permissions, a mandatory rejection reason shown verbatim, full audit.
7. **No Figma frame exists for this screen.** It follows the other admin lists: oldest first while waiting (COM §4.2).

## Not built

- Sending staff decisions to Didit.
- Senior-officer sign-off for PEP/sanctions cases (COM §14.1). Didit's AML hits are not approved automatically today (ADR-039), and staff would need that tier to exist.
- Notifying staff when a check needs them (the bell).

## Evidence

- `backend/tests/integration/test_admin_kyc_review.py`:
  - two people approve a held check; facts are kept, but not shown to the customer before approval;
  - the recommender can't confirm (server and database);
  - the customer is verified and notified;
  - decided once; audit entries;
  - the same ID still verified elsewhere can't be approved;
  - the recommender can't reject, but a second person can, and the customer reads the reason;
  - decline, then reject;
  - Didit reviews are read-only;
  - missing facts can't be approved;
  - access (support agent 403, ops admin read-only);
  - strict input; no delete grant.
- `admin/__tests__/kyc.test.tsx`: the lists, recommend, the recommender sees no Confirm or Reject, a second person confirms, Didit cases have no buttons, missing facts allow only Reject.
