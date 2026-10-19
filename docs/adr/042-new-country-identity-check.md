# ADR-042 — New-Country Identity Check (Plan)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** — 2026-10-19 (rules); build deferred to the US launch |
| **Decision ID** | DEC-049 |
| **Authority** | Product owner, 2026-10-19: "if I do my kyc in nigeria and used the [app] for a while, when i travel to USA, it should demand for another kyc based on the country location". Answers: **"Location seen + user confirms"**, **"Keep Nigerian trading"**, **"Plan now, build at US launch"**. |
| **Extends** | ADR-016 (Figma "Trade in Your New Location", demo only) — settles its open item "location signal source"; ADR-039/041 (Didit, one person one account) |

## Rules

1. **Verification is per country.** A user verified in Nigeria is verified for the Nigerian side only. Using another country's side (e.g. US payout accounts, USD funding) needs an approved identity check for that country.
2. **What starts it: location seen + user confirms.** The server notices sign-ins from a country the user is not verified for (from the network address, server-side; never from anything the app claims). The app then shows the Figma **"Trade in Your New Location"** prompt. The user may confirm (start that country's check) or **Skip** (nothing changes). The network location alone never verifies, refuses or blocks anyone — VPNs and travel make it unreliable.
3. **Meanwhile, the home country keeps working.** The Nigerian side stays usable. Only actions on the new country's side wait for its check (server-enforced with the same `AUTH_403_KYC_REQUIRED` pattern, per country).
4. **Same person, same account.** A new-country check is added to the existing account, never a second account (ADR-041). Its name and date of birth must match the account's verified identity, or the case is held for review.

## Not decided — needed before the build

- US identity rules: SSN collection and storage under US law (GLBA, state privacy laws). ADR-016 says the SSN is never stored; whether Didit or another provider handles it is open.
- Whether Didit's US checks (documents, database checks) meet the US partner's and regulator's requirements.
- The US banking partner and USD corridor (PRD: Year 2).
- How long an unused country verification stays valid, and whether a move (not a trip) should ask the user to change their home country.
- Data residency for US identity data.

## Build (later, at US launch)

Per-country verification on `kyc_cases` (country column, one active case per user per country), country-aware market and payout checks, a server-side "new country seen" signal with the confirm/skip prompt from ADR-016, and tests for travel, VPN and skip.
