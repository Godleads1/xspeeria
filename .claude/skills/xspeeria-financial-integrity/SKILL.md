---
name: xspeeria-financial-integrity
description: Protect Xspeeria financial correctness.
---
# xspeeria-financial-integrity

For money, transactions, balances, settlement, fees, payments or reconciliation:
no binary floating point; validate amounts/currency server-side; never trust client financial state; use explicit transaction states; idempotency where applicable; handle retries, duplicates, timeouts, reversals, provider disagreement and reconciliation; preserve auditability.

