# ADR-013 — Onboarding and Log-in (Demo Mode)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-019 |
| **Authority** | Product owner, 2026-10-17: "lets do onboarding, but we will use demo data to login" — `DOCUMENT_INDEX.md` §1 rank 2 |

## 1. Decision

Built from the Figma onboarding frames:

| Step | Figma | Route |
|---|---|---|
| Welcome + slides, "Open a free profile" / "I have a profile" | 33:1367 | `/welcome` |
| Let's get started: phone linked to NIN, AML consent, Terms consent | 35:1633 | `/signup/start` |
| Verify Your Identity: date of birth, then selfie **or** OTP | 36:6635, 308:2261, 197:6508 | `/signup/verify`, `/signup/otp` |
| Details from the NIN record (read-only) + email, newsletter opt-in | 39:1688 | `/signup/details` |
| Confirm email with a 6-digit code (**added**, not in Figma) | — | `/signup/email` |
| Create PIN / Confirm PIN | 39:1923, 39:2060 | `/signup/pin`, `/signup/confirm-pin` |
| Enable Face ID / Not now | 39:2121 | `/signup/biometrics` |
| Congratulations → Home | 39:2248 | `/signup/done` |
| Welcome Back: phone or e-mail + PIN, Remember me, Use face ID | 39:2291, 342:6006 | `/login` |
| Forgot Password | 559:4183, 559:4280 | `/forgot` |

The signed-in app moved into the `(app)` route group (URLs unchanged). The root layout uses
`Stack.Protected`: signed out → only welcome / log-in / sign-up / public Terms; signed in →
only the app. Profile gains **Log out** (with confirmation).

## 1a. Launch

The Figma splash (33:1355, logo on `#F8F9FD`) is the first screen: the native splash shows
while fonts load, then the same picture stays for 1.2 s (`LaunchSplash`) and fades into
Welcome, or Home when signed in.

## 2. Demo mode (`src/features/auth/demo.ts`, `DEMO_MODE = __DEV__` since ADR-018)

No backend, NIN/identity provider, SMS or email service exists, so:
- **Demo account:** `+2348038383838` or `davidpeters@example.com`, PIN `4826`. The log-in
  screen shows these and a "Fill demo details" link.
- Any valid Nigerian number maps to one sample NIN record (David Peters, 12/07/1997).
- The selfie match is simulated after the date of birth matches the record; the dialog
  says so. OTP and email codes are generated on the device and shown in a yellow demo note.
- Every simulated step is labelled on screen. **Amended by ADR-018:** `DEMO_MODE` is no
  longer hand-set; it is true only in development builds, and a release build refuses every
  demo path and shows "Not available yet".
- The session is in memory: reloading the app signs you out. Only "Remember me" (phone or
  email, never the PIN) and the Face ID choice are saved on the device.

## 3. Rules (mirror what the server must enforce)

- 4-digit PIN as in Figma; all-same-digit and straight runs (1234, 4321) refused — proposed
  default within Open Decision 2. Production: PIN checked server-side, stored only as a slow
  salted hash; a 4-digit PIN is weak on its own, so device binding + 2FA (ADR-008) matter.
- 5 wrong PINs → 15-minute lock (same rule as ADR-008). Errors are the same for an unknown
  account and a wrong PIN; Forgot PIN always shows one neutral message (no account
  enumeration).
- Face ID log-in only on a phone where it was turned on after a PIN log-in or sign-up, and
  never while locked. ADR-008 still applies: a new phone needs 2FA once the backend exists.
- Both consents are required to continue; the newsletter is opt-in (unchecked).
- Each sign-up step checks the previous one is done (deep links cannot skip steps).

## 4. Recorded deviations from Figma

| Figma | Implementation | Why |
|---|---|---|
| Photo of a woman on Welcome | **Used (2026-10-17, product owner request)**: taken from the Figma frame at 1× (`assets/images/welcome-hero.png`, white background removed). Export at 3× for sharpness. **Licence must be confirmed before release** (likely stock imagery) |
| One welcome slide, four progress bars | Four slides; slides 2–4 written from the approved model | Bars implied slides; copy needs marketing/legal review |
| Date of birth "select" with calendar | Typed DD/MM/YYYY | Month-by-month calendar is impractical for birth years |
| Details: "Babatunde Peter", 14 May 1998 | Sample NIN record (David Peters) | One demo person across the app |
| No email confirmation | 6-digit email code step | Same proof rule as profile editing (ADR-011) |
| "remmber", "Your have … a Xspeeria", "Congratulations!!" | Corrected spelling/grammar | Copy fixes |
| Language dropdown | English only, shown as a label | No other languages exist yet |
| Camera selfie stock image (195:6359) | Not used | Simulated in demo |

## 5. Open

- Identity (NIN/BVN) provider, liveness/selfie vendor, SMS and email providers.
- Password vs PIN: Figma mixes "PIN" (log-in) and "Password" (Forgot / Change Password).
- Full Forgot-PIN reset (needs backend + 2FA).
- UK (GBP) customers' onboarding: Figma is Nigeria/NIN-only.
- New-location check and document picker: built in ADR-016.
