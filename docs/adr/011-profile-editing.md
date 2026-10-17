# ADR-011 — Profile Editing with Proof of Ownership

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-017 |
| **Authority** | Product owner, 2026-10-17: "users should be able to edit their profile details, add profile banner and DP, edit date of birth, email address, phone number … but must show prove that the edit is correct, like sending sms to confirm number and email to confirm" — `DOCUMENT_INDEX.md` §1 rank 2 |

## 1. Decision

Account details → **Edit** opens Edit profile.

| Field | How it changes | Proof |
|---|---|---|
| Profile photo (DP) | Pick from photos, square crop | None needed (not identity data). Re-encoded to JPEG 512 px, which drops EXIF/GPS |
| Banner | Pick from photos, 3:1 crop | None needed. Re-encoded to 1200 px wide |
| Phone number | Enter new number with country code | **2FA re-check (ADR-008), then a 6-digit code sent by SMS to the NEW number** |
| Email address | Enter new address | **2FA re-check, then a 6-digit code emailed to the NEW address** |
| Date of birth | Enter new date (18+), attach ID document photo | **KYC review of the document**; old date stays until approved, shown as "under review" |
| Full legal name | Not editable in the app | KYC-verified; Support changes it after re-verification |
| Gender | Not editable (data-minimisation question open, ADR-007) | — |

Rules for the code (server is authoritative): 6 digits from a CSPRNG without modulo bias,
compared in constant time; expires after **10 minutes**; **5 wrong tries** end the attempt;
a new code after **60 seconds**. The old phone/email is notified of the change. SMS here
only proves ownership of a number; it is **never** a 2FA factor (ADR-008 stands).

## 2. Mock implementation (no backend yet)

- No SMS or email provider is connected. The code is generated on the device and, **in
  development builds only** (`__DEV__`), shown on screen labelled as a test build so the
  flow can be tried. Release builds never show it.
- The ID document photo is not uploaded or kept; the date goes to "under review".
- Profile data, photo and banner live in memory and reset on reload.
- Photos need the `expo-image-picker` permission text in `app.json` for custom builds.

## 3. Open (must not be assumed)

- The 10-minute / 60-second values are proposed defaults inside Open Decision 2.
- SMS and email providers; who reviews date-of-birth documents and the turnaround time.
- Photo moderation and storage location (server must re-encode and moderate on upload).
- Whether a phone/email change should also trigger the 24-hour payout hold (ADR-008 lists
  it for 2FA resets and new beneficiaries only).
