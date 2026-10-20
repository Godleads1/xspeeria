# ADR-055 — Name, Date of Birth and Gender Come From the ID Check

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (owner) — 2026-10-20; **IMPLEMENTED** 2026-10-20 |
| **Decision ID** | DEC-062 |
| **Builds on** | DEC-054 (legal name and date of birth come from the verified ID, not typed in), ADR-039/041/042 (Didit identity checks) |
| **Authority** | Product owner, 2026-10-20: asked why sign-up showed a sample name, date of birth and gender; when offered "(a) take gender from the ID check and store it" or "(b) remove gender", chose **"a"**. |

## Decision

1. Server builds never show a sample person ("David Peters"). Sign-up asks only for phone, email and PIN and says the name, date of birth and gender come from the ID.
2. After an identity check is approved, the profile shows the **legal name, date of birth and gender read from the ID** (most recent approved check). Before that, each shows "From your ID once verified". None of them can be typed in by the user.
3. **Gender is stored** on the approved identity check as `M` or `F`, exactly as the ID shows it (Didit `id_verifications[].gender`, e.g. `"F"`; docs.didit.me, read 2026-10-20). Anything else (missing, `X`, unreadable) is not stored and the profile shows the placeholder. It is shown only to the account holder, never to the other side of a deal, in notifications or in logs. A missing gender never holds an approval.

## Built

- Migration `0018`: `kyc_cases.gender CHAR(1)`, `CHECK (gender IS NULL OR gender IN ('M','F'))`.
- `GET /api/v1/users/me` adds `legal_name`, `date_of_birth`, `gender` (null until approved).
- App: the profile store starts empty in server builds and is filled from `/users/me` at sign-in, unlock, Home (when the check becomes approved) and Account details. The public handle shown to counterparties is "User" plus 4 characters of the account id; the rating is hidden until ratings exist.

## Privacy

Gender is personal data (Data Protection: minimise and protect). It is kept because the owner chose to show it on the profile; it inherits the KYC case's access rules and is never sent anywhere else. Revisit if no product or partner-bank need appears.
