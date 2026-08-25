# UI / UX SCREEN SPEC

## Home Screen

Canvas:
- iPhone 16 Pro
- 393×852
- Light Mode
- Safe Area

Header:
- Gradient Avatar
- Greeting
- Notification Button

Account Readiness Region:
*(SUPERSEDES the "Status Overview Card", which itself replaced a "Balance Card"
— HUMAN APPROVED, design-system freeze Phase 1. Xspeeria is wallet-less and
non-custodial, so the home screen must never display a stored balance, a wallet
identifier, or any aggregate currency figure. A large single amount in the hero
position reads as a balance regardless of its label.)*
- Radius 32
- Exactly three dimensions: Identity / KYC, Security / qualifying MFA,
  Eligible to transact
- Collapses to a compact confirmation state once all three are satisfied
- Beneficiary, payout and funding readiness are allocation-specific and must
  never appear here
- No currency amount of any kind

Primary Action:
Create or browse an offer — exactly one action, routing to the Marketplace.
*HISTORICAL: this line previously read “New FX Request / Browse Marketplace”; that wording is **SUPERSEDED** (reconciled 2026-08-24).*

Active Activity:
Open Offers, MatchAllocations requiring attention, in-flight settlement
activity — most time-critical item first. Amounts stay attached to the
individual Offer or allocation and are never summed into one figure.

Recent Transactions:
Three floating premium cards — each shows currency pair, current stage in the
transaction state machine (e.g. Matched, Settlement Pending), and the next
action available to the user. No balance figures on these cards.

*(Terminology: "MatchAllocation" is product language for one accepted allocation of an
Offer; it maps to the persisted entity "Match" — no separate table exists. See
DOCUMENT_INDEX.md section 2A.)*

Bottom Navigation:
Home, Marketplace, Track, Cards, Profile

*(HUMAN APPROVED, design-system freeze Phase 1. "Cards" is COMING SOON: the tab
opens a real destination explaining the future feature — never a dead or
disabled tab — and exposes no active card functionality, no card balances, and
nothing implying stored-value wallet or card functionality. This supersedes the
earlier guidance to add Cards back only once Phase 12 ships. Notifications move
out of the bar to the notification bell, the notification centre and push
notifications for time-sensitive events. "Scan" still does not exist anywhere
in the Xspeeria product docs, and Analytics is not in MVP scope.)*
