# ADR-016 — New Location and Region Identity Check (Demo)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-022 |
| **Authority** | Product owner, 2026-10-17: "go" on the remaining onboarding frames (Figma 436:12247, 436:12428, 439:4008, 439:4218, 439:4394) — `DOCUMENT_INDEX.md` §1 rank 2 |

## 1. Flow

Log in from a region the user has no KYC for → **Trade in Your New Location** →
"Confirm & Create a new profile" → **Verify Your Identity** (SSN, a photo of a valid ID chosen
from State ID Card / Passport / Driver's License, a selfie) → Verify → submitted for review.
The region appears in Account details → KYC approved regions as **Pending**. "Skip" goes to
Home. Routes: `/region/new`, `/region/verify` (signed-in group).

## 2. Rules

- The SSN is masked, checked only for format (no 000/666/9xx area, no 00 group, no 0000
  serial), never stored, logged or passed to app state, and cleared on submit.
- The ID photo is chosen from the photo library (camera permission is not requested); it is
  not uploaded in the demo.
- Region KYC is reviewed server-side; the app only shows Pending. USD trading follows the
  Year 2 corridor (PRD), so approval also depends on that launch.

## 3. Demo

Location detection is simulated: on the log-in screen, "Log in as if from the United
States" sets the next log-in's region. The selfie match is simulated with a labelled dialog.

## 4. Deviations from Figma

| Figma | Implementation | Why |
|---|---|---|
| US body text mentions "confirm your NIN … OTP sent to your registered number" | US-specific text (SSN, ID photo, selfie) | NIN is Nigerian; copy slip |
| Plain play-arrow rows | Chevron rows with a green tick when done | Consistent with the rest of the app |
| Location pin with runner illustration | Simplified original pin + US flag illustration | Artwork not exportable |

## 5. Open

- Location signal source (IP/device), and whether a new region also requires 2FA (ADR-008
  new-device rule applies to devices, not regions).
- US identity provider, SSN handling under US law (GLBA/state privacy), and data residency.
- Regions other than the US.
