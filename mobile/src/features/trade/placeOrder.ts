/**
 * Turns a confirmed order and its payout accounts into trades (ADR-019, ADR-021, ADR-022).
 * The caller must have passed the 2FA step-up first; this function does not ask.
 *
 * - The payout split must add up exactly to what the user receives, or nothing happens.
 * - Each listing is accepted on its own (Standing Standards §7.1): if one was taken in the
 *   meantime, the others still go ahead and the caller tells the user.
 * - New accounts the user asked to save become pending beneficiaries (the bank verifies them).
 * Integers only. The server repeats every check.
 */

import { beneficiaryStore } from '../profile/beneficiaryStore';
import type { OrderDraft } from './orderDraft';
import { allocatePayouts, splitProblem, type PayoutShare } from './payoutSplit';
import type { Recipient } from './PayoutDestinationScreen';
import { receiveFor, tradeStore, type RandomBytes } from './tradeStore';

export interface PlacedOrder {
  readonly created: readonly string[];
  readonly failed: number;
}

/** What the user receives for the whole order, minor units of `receiveCurrency(draft)`. */
export function orderReceiveMinor(draft: OrderDraft): number {
  return draft.parts.reduce((sum, p) => sum + receiveFor(draft.side, p.amountMinor, p.listing.rateHundredths), 0);
}

export function receiveCurrency(draft: OrderDraft): string {
  return draft.side === 'buy' ? (draft.parts[0]?.listing.currency ?? '') : 'NGN';
}

function hex(random: RandomBytes, n: number): string {
  return Array.from(random(n), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function placeOrder(input: {
  draft: OrderDraft;
  recipients: readonly Recipient[];
  now: number;
  random: RandomBytes;
}): PlacedOrder {
  const { draft, recipients, now, random } = input;
  const total = orderReceiveMinor(draft);
  if (splitProblem(total, recipients) !== null) throw new Error('Payout accounts must add up to the amount received');

  const shares: PayoutShare[] = recipients.map((r) => ({
    id: r.id,
    name: r.name,
    bank: r.bank,
    last4: r.last4,
    amountMinor: r.amountMinor,
    ...(r.isNew ? { isNew: true } : {}),
  }));
  const perTrade = allocatePayouts(
    draft.parts.map((p) => receiveFor(draft.side, p.amountMinor, p.listing.rateHundredths)),
    shares,
  );
  const orderId = draft.parts.length > 1 ? `o-${hex(random, 6)}` : undefined;

  const created: string[] = [];
  let failed = 0;
  draft.parts.forEach((part, i) => {
    try {
      created.push(
        tradeStore.create({
          side: draft.side,
          listing: part.listing,
          amountMinor: part.amountMinor,
          payouts: perTrade[i],
          now,
          random,
          orderId,
        }).id,
      );
    } catch {
      failed += 1;
    }
  });

  // Saved only when asked, and only as "pending": the bank must confirm the name (§3.3).
  const currency = receiveCurrency(draft);
  for (const r of recipients) {
    if (r.isNew && r.save) beneficiaryStore.add({ currency, bank: r.bank, accountNumber: r.last4, name: r.name });
  }
  return { created, failed };
}
