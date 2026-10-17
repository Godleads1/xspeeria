/**
 * Splitting what a user receives across several of their own payout accounts (product
 * owner, 2026-10-17; `docs/adr/021-percentage-fee-and-split-payouts.md`).
 *
 * The user names each account and the amount it gets; the amounts must add up exactly to
 * what they receive. The partner bank, which holds the money in escrow, pays each account
 * and confirmation goes to both sides. Xspeeria never holds or moves the money.
 *
 * Accounts are the user's own verified accounts only (Banking spec §3.3; payouts to other
 * people wait for DEC-007). Integers only.
 */

export interface PayoutShare {
  readonly id: string;
  readonly name: string;
  readonly bank: string;
  readonly last4: string;
  /** Minor units of the currency received. */
  readonly amountMinor: number;
}

export type SplitProblem = 'none-selected' | 'empty-amount' | 'over' | 'under' | 'duplicate';

/** Why a split cannot be used, or null when every share is positive and they add up exactly. */
export function splitProblem(totalMinor: number, shares: readonly { id: string; amountMinor: number | null }[]): SplitProblem | null {
  if (shares.length === 0) return 'none-selected';
  if (new Set(shares.map((s) => s.id)).size !== shares.length) return 'duplicate';
  let sum = 0;
  for (const s of shares) {
    if (s.amountMinor === null || !Number.isSafeInteger(s.amountMinor) || s.amountMinor <= 0) return 'empty-amount';
    sum += s.amountMinor;
  }
  if (sum > totalMinor) return 'over';
  if (sum < totalMinor) return 'under';
  return null;
}

/**
 * Spreads an order-level split over the order's trades, in order: each trade's payout list
 * adds up exactly to what that trade pays out, and each account gets exactly its share in
 * total. Throws if the split does not add up to the trades' total.
 */
export function allocatePayouts(tradeAmounts: readonly number[], shares: readonly PayoutShare[]): PayoutShare[][] {
  const total = tradeAmounts.reduce((a, b) => a + b, 0);
  if (splitProblem(total, shares) !== null) throw new Error('Payout split does not add up');
  const left = shares.map((s) => s.amountMinor);
  let k = 0;
  return tradeAmounts.map((amount) => {
    const out: PayoutShare[] = [];
    let need = amount;
    while (need > 0) {
      while (left[k] === 0) k += 1;
      const take = Math.min(need, left[k]);
      out.push({ ...shares[k], amountMinor: take });
      left[k] -= take;
      need -= take;
    }
    return out;
  });
}
