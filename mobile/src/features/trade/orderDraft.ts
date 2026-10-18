/**
 * The order the user confirmed on Select Match, waiting for its payout accounts (Payout
 * Destination, ADR-022). In memory; cleared once trades are created, on log-out and when a
 * new account is created. The Payout Destination route opens only while a draft exists, so
 * it cannot be reached with made-up amounts from a deep link.
 */

import { useSyncExternalStore } from 'react';

import { session } from '../auth/session';
import type { Side } from '../market/MarketScreen';
import type { FillPlan } from './fillPlan';

export interface OrderDraft {
  readonly side: Side;
  /** What the user asked for, minor units of the listing currency. */
  readonly requestedMinor: number;
  readonly parts: FillPlan;
}

let draft: OrderDraft | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export const orderDraft = {
  get: (): OrderDraft | null => draft,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(next: OrderDraft): void {
    if (next.parts.length === 0) throw new Error('An order needs at least one part');
    draft = next;
    emit();
  },
  clear(): void {
    draft = null;
    emit();
  },
  /** Back to the initial state (log-out / new account, and tests). */
  reset(): void {
    orderDraft.clear();
  },
};

// Cleared on log-out and when a new account is created (ADR-018).
session.onUserChange(() => orderDraft.reset());

export function useOrderDraft(): OrderDraft | null {
  return useSyncExternalStore(orderDraft.subscribe, orderDraft.get, orderDraft.get);
}
