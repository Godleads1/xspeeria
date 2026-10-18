# ADR-022 — Payout Destination, Welcome Slides, Location for KYC Region

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-028 |
| **Authority** | Product owner, 2026-10-17/18: Figma frames "Payout Destination", "Send to a New Receipent", Welcome slides 1–4 and the "Let's get started" location prompt; "build it in enterprise standard in mind" — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Builds on** | `docs/adr/021-percentage-fee-and-split-payouts.md` (split payouts), `docs/adr/016-new-location-region-kyc.md`, `docs/adr/008-two-factor-authentication.md`, `docs/adr/012-cards-preview.md` |

## 1. Payout Destination

Flow: Select Match → Confirm trade (amounts, rates, 1% fee) → **Payout Destination** →
Continue → one 2FA check for the whole order → trades created → trade screen.

- Total Amount, **Fund Card** and **Fund Account** as in Figma. Accounts are listed with
  their amount and a ⋮ menu (Change amount, Remove). Continue is enabled only when the
  amounts add up exactly ("Left to assign: …" / "… more than you receive").
- **Send to a New Recipient** (Figma form): routing number, bank name, account number,
  account type, "Save to beneficiary", amount, "Send the full amount left".

Deliberate deviations from Figma (enterprise standard):

| Figma | Built | Why |
|---|---|---|
| "Available Balance: 500 USD", "Use all Available Balance" | "Left to assign: …", "Send the full amount left" | No balance or wallet wording (Standing Standards §2) |
| Recipients in other people's names | Own name only; the name is not typed, the bank confirms it | Banking spec §3.3; third-party payouts wait for DEC-007 |
| Full account number shown | Last 4 digits only, also in memory | API Data Dictionary (tokenised `account_ref`) |
| New account paid immediately | Paid after a **24-hour security hold** | ADR-008 (beneficiary substitution, SEC-025/FX-03) |
| "Request to Fund a USD card", "$3 fee" | Shown; says cards aren't available yet; no fee shown | ADR-012; no card partner or card fee approved |
| "Save to beneficiary" saves at once | Saved as **pending** only after the 2FA check on Continue | Step-up before beneficiary changes (ADR-008) |

The Payout Destination route opens only while a confirmed order exists in memory
(`orderDraft`), so a deep link cannot open it with made-up amounts; the order is cleared on
completion, log-out and new account.

## 2. Welcome slides

One picture per slide (Figma component 55:2057). Titles are Figma's. Three Figma claims are
replaced because they are untrue or unverified for Xspeeria:

| Figma text | Replaced with | Why |
|---|---|---|
| "end-to-end encryption keep every transaction protected" | "Everyone is identity-checked. Your money goes to a partner bank's escrow, never to Xspeeria, until both sides have paid." | Not a verified control; never invent compliance/security claims (CLAUDE.md) |
| "Send and receive funds across borders" | "Each side is paid by local transfer in their own country — no money crosses the border." | Product truth (Standing Standards §2) |
| "Spend via prepaid card" | removed | Cards not available (ADR-012) |

Copy needs marketing/legal review; artwork licence to confirm (ADR-013).

## 3. Location for the KYC region

- Asked on "Let's get started", **while in use only**, at **reduced accuracy** (Android
  coarse only, fine and background location blocked; iOS reduced accuracy by default).
- Only the **two-letter country code** is kept (sign-up draft); coordinates are used once to
  look up the country and dropped — never stored, logged or sent to Xspeeria.
- **Never required**: declining or any failure carries on normally. The device country is a
  hint; the server decides the region from its own signals (ADR-016).
- Purpose string: "Xspeeria uses your approximate location to check which identity rules
  apply in your country and to help stop fraud. Only your country is kept, not your
  location." The privacy notice's location line is updated (draft, legal review pending).

## 4. Fixes found on the phone (2026-10-17)

- Market tab "Buy"/"Sell" on a listing showed "the next screen to be built"; it now opens
  Select Match for that listing (same confirm, rate ceiling, payout and 2FA path).
- "Cannot update a component (StepUpHost) while rendering": 2FA enrolment started during
  render; it now starts in an effect. Regression test `mobile/__tests__/bugfixes.test.tsx`.

## 5. Tests

`payout-destination.test.tsx`, `location.test.tsx`, `bugfixes.test.tsx`, updated onboarding,
trade and multi-fill tests.
