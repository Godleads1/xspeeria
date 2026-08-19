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

Status Overview Card:
*(Replaces "Balance Card" — Xspeeria is wallet-less and non-custodial, so the
home screen must never display a stored balance or a wallet identifier. This
card shows marketplace/transaction status instead.)*
- Radius 32
- Xspeeria Blue Gradient
- Active FX requests (count)
- Pending settlements (count)
- Preferred currency pair shortcut

Quick Actions:
New FX Request, Browse Marketplace, Track Transaction, Support

Recent Transactions:
Three floating premium cards — each shows currency pair, current stage in the
transaction state machine (e.g. Matched, Settlement Pending), and the next
action available to the user. No balance figures on these cards.

Bottom Navigation:
Home, Marketplace, Track, Notifications, Profile

*(Dropped "Cards" and "Scan" from the original spec — no scanning flow exists
anywhere else in the Xspeeria product docs, and the optional debit-card
feature is Phase 12/deferred, so it doesn't belong in MVP primary nav. Add a
"Cards" tab back only once Phase 12 actually ships.)*
