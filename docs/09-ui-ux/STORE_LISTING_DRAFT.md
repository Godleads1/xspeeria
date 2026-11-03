# Store Listing Draft — Apple App Store and Google Play

**Draft for the owner to edit and approve (ADR-090).** Nothing here is submitted. The texts make no claim that isn't true today: no licence, user numbers or ratings. Fill in the blanks marked ▢.

## 1. Basics

| Field | Draft |
|---|---|
| App name | **Xspeeria** |
| Subtitle (Apple, 30 characters) | Swap naira and dollars safely |
| Short description (Google, 80 characters) | Swap naira and dollars person to person. Both sides pay into escrow first. |
| Category | Finance |
| Content rating | Everyone / 4+ (no objectionable content). Answer the stores' questionnaires honestly. |
| Price | Free (a 1% fee is charged on each deal, shown before you pay) |
| Countries | Nigeria first. ▢ Others only after the partner bank and licence allow them (ADR-043). |
| Support web address | ▢ |
| Privacy policy web address | ▢ (required by both stores) |
| Bundle ID / package | `com.xspeeria.app`, the same on both. **Can't be changed after the first upload.** |

## 2. Full description (draft)

> **Swap naira and dollars, person to person.**
>
> Post the rate you want, or take an offer you like. When a deal is agreed, both sides pay into escrow, and nobody is paid out until both have paid in.
>
> - **A flat 1% fee**, shown before you pay.
> - **Your rate:** set it yourself, or take one from the market.
> - **Escrow on both sides** of every deal.
> - **Pay out to any account you choose,** confirmed twice before money moves.
> - **Security:** a 6-digit PIN, fingerprint or Face ID approval for important steps, an identity check, and an email for every log-in and change, with a "this wasn't me" button that freezes your account at once.
>
> You need to verify your identity before you trade. ▢ *Add one line naming the partner bank that holds escrow, once agreed.*

## 3. What the app collects (for Apple's "App Privacy" and Google's "Data safety")

Taken from the code as of 3 Nov 2026. **The owner and the lawyer confirm before submitting.** The privacy policy must say the same.

| Data | Why | Linked to the person | Shared with |
|---|---|---|---|
| Phone number, email address | Account, sign-in codes, security emails | Yes | SMS provider ▢; Resend (email) |
| Name, date of birth, ID document, selfie for the face check | Identity checks (KYC), required by law | Yes | Didit (identity checks) |
| Approximate location (country only) | Which identity rules apply; fraud prevention. Only the country is kept. | Yes | — |
| Photos the person chooses (profile picture, banner, ID document) | As chosen | Yes | Didit for ID documents |
| Payout account details (bank, account number, encrypted at rest) | Paying out deals | Yes | The partner bank ▢ |
| Deals, offers and their amounts | The service itself; records kept by law | Yes | The partner bank ▢ |
| Device name, push token | Security emails and push notifications | Yes | Expo, Apple and Google (push) |
| Activity log (what was done, when, from which app) | Security and fraud prevention | Yes | — |

- **Not collected:** contacts, precise location, background location, camera access by the app itself (the face check runs in Didit's flow), advertising IDs, or tracking across other apps.
- **The PIN** is never sent to anyone else: only a scrambled hash is kept on the server.
- **Encryption in transit:** yes (HTTPS only).
- **Deletion:** ▢ once "Delete account" is built (the stores require a way to request deletion).

## 4. Still needed before the first upload

- [ ] **Release builds run against the server** (ADR-090 blocker); today they show "not available".
- [ ] **The app icon:** 1024 × 1024 square, plus an Android adaptive icon.
- [ ] **Screenshots:** iPhone 6.7" and 6.5"; Android phone. Five each: market, take an offer, escrow progress, payout account, security.
- [ ] **Apple Developer account** (yearly fee) and **Google Play Console account** (one-time fee).
- [ ] **Privacy policy and support pages** online.
- [ ] **A reviewer account** on a test server, with instructions (both stores test sign-in).
- [ ] **The "Delete account" feature** (both stores require it for apps with accounts).
- [ ] **The Apple export-compliance answer** (standard encryption only), confirmed by the owner or lawyer.
