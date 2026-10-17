/**
 * Trades for the demo app (ADR-014). In memory. Mirrors ADR-001 at the user's level:
 * accepted → matched → (optional extension) → you funded escrow → counterparty funded →
 * released → paid out. Money is integer minor units only.
 *
 * DEMO: there is no partner bank, so after "I have paid" the bank's steps advance on their
 * own every DEMO_STEP_MS, and an extension request is approved after DEMO_STEP_MS. The
 * funding window and extension length are Figma's values; Appendix D marks them as
 * configurable policy (TBD), so they are named constants here, not business rules.
 */

import { useSyncExternalStore } from 'react';

import { COORDINATION_FEE_KOBO, type HistoryItem } from '../history/data';
import type { Listing } from '../market/data';
import type { Side } from '../market/MarketScreen';
import { quoteMinor } from '../market/money';
import { DEMO_MODE } from '../auth/demo';
import { session } from '../auth/session';

export const FUNDING_WINDOW_MS = 5 * 60 * 1000;
export const EXTENSION_MS = 5 * 60 * 1000;
export const DEMO_STEP_MS = 3000;

export type Phase =
  | 'awaiting_payment'
  | 'confirming'
  | 'awaiting_counterparty'
  | 'releasing'
  | 'completed'
  | 'expired'
  | 'cancelled';

export interface TradeEvent {
  readonly label: string;
  readonly at: number;
}

export interface PayoutChoice {
  readonly id: string;
  readonly name: string;
  readonly bank: string;
  readonly last4: string;
}

export interface Trade {
  readonly id: string;
  readonly reference: string;
  /** The user's side: buy = pays NGN, receives `currency`; sell = pays `currency`, receives NGN. */
  readonly side: Side;
  readonly currency: string;
  /** Foreign amount, minor units of `currency`. */
  readonly amountMinor: number;
  readonly rateHundredths: number;
  /** What the user transfers into escrow, minor units of `payCurrency` (fee included on the NGN side). */
  readonly transferMinor: number;
  readonly payCurrency: string;
  readonly feeKobo: number;
  readonly counterparty: string;
  readonly payout: PayoutChoice;
  readonly phase: Phase;
  readonly events: readonly TradeEvent[];
  readonly deadline: number;
  readonly extension: 'none' | 'requested' | 'approved';
  /** Listing the trade took its amount from (capacity accounting). */
  readonly listingId: string;
  /** Set when one request was filled from several listings: the trades of that order. */
  readonly orderId?: string;
  readonly phaseSince: number;
  readonly rating?: { readonly stars: number; readonly feedback: string };
}

export type RandomBytes = (n: number) => Uint8Array;

const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function reference(random: RandomBytes): string {
  // 32 symbols: 256 % 32 === 0, so the modulo is unbiased.
  return Array.from(random(10), (b) => REF_ALPHABET[b % 32]).join('');
}

/** NGN amount for a foreign amount at a rate (kobo). */
export function ngnFor(amountMinor: number, rateHundredths: number): number {
  return quoteMinor(amountMinor, rateHundredths);
}

/** What the user must transfer: NGN + fee when buying; the foreign amount when selling. */
export function transferFor(side: Side, currency: string, amountMinor: number, rateHundredths: number): { minor: number; currency: string } {
  return side === 'buy'
    ? { minor: ngnFor(amountMinor, rateHundredths) + COORDINATION_FEE_KOBO, currency: 'NGN' }
    : { minor: amountMinor, currency };
}

let trades: readonly Trade[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function patch(id: string, f: (t: Trade) => Trade): Trade | null {
  let out: Trade | null = null;
  trades = trades.map((t) => {
    if (t.id !== id) return t;
    out = f(t);
    return out;
  });
  emit();
  return out;
}

const other = (side: Side): string => (side === 'buy' ? 'Seller' : 'Buyer');

export const tradeStore = {
  get: (id: string): Trade | undefined => trades.find((t) => t.id === id),
  all: (): readonly Trade[] => trades,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  create(input: {
    side: Side;
    listing: Listing;
    amountMinor: number;
    payout: PayoutChoice;
    now: number;
    random: RandomBytes;
    orderId?: string;
  }): Trade {
    const { side, listing, amountMinor, payout, now, random, orderId } = input;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('Amount must be a positive integer');
    // Never silently resize: the caller must ask for an amount the listing can fill. What
    // earlier live trades already took from the listing is not available again
    // (Standing Standards §7.1: original = matched + remaining).
    if (amountMinor > tradeStore.remainingMinor(listing)) throw new Error('Amount is more than this listing has available');
    const t = transferFor(side, listing.currency, amountMinor, listing.rateHundredths);
    const trade: Trade = {
      id: `t-${reference(random).toLowerCase()}`,
      reference: reference(random),
      side,
      listingId: listing.id,
      ...(orderId ? { orderId } : {}),
      currency: listing.currency,
      amountMinor,
      rateHundredths: listing.rateHundredths,
      transferMinor: t.minor,
      payCurrency: t.currency,
      feeKobo: COORDINATION_FEE_KOBO,
      counterparty: other(side),
      payout,
      phase: 'awaiting_payment',
      events: [
        { label: side === 'buy' ? 'You accepted the offer' : 'You accepted the request', at: now },
        { label: `You are matched with ${other(side)}`, at: now },
      ],
      deadline: now + FUNDING_WINDOW_MS,
      extension: 'none',
      phaseSince: now,
    };
    trades = [trade, ...trades];
    emit();
    return trade;
  },

  /** What is left on a listing after live and completed trades took their share. */
  remainingMinor(listing: Listing): number {
    const taken = trades
      .filter((t) => t.listingId === listing.id && t.phase !== 'expired' && t.phase !== 'cancelled')
      .reduce((sum, t) => sum + t.amountMinor, 0);
    return Math.max(0, listing.availableMinor - taken);
  },

  requestExtension(id: string, now: number): boolean {
    const t = tradeStore.get(id);
    if (!t || t.phase !== 'awaiting_payment' || t.extension !== 'none' || now > t.deadline) return false;
    patch(id, (x) => ({ ...x, extension: 'requested', phaseSince: now, events: [...x.events, { label: 'You requested a payment extension', at: now }] }));
    return true;
  },

  markPaid(id: string, now: number): boolean {
    const t = tradeStore.get(id);
    if (!t || t.phase !== 'awaiting_payment' || now > t.deadline) return false;
    // Paying ends any pending extension request: it is no longer needed.
    patch(id, (x) => ({ ...x, phase: 'confirming', phaseSince: now, extension: x.extension === 'requested' ? 'none' : x.extension }));
    return true;
  },

  /** Only before the user has said they paid. */
  cancel(id: string, now: number): boolean {
    const t = tradeStore.get(id);
    // After the deadline the trade has expired (tick records that); it cannot be "cancelled".
    if (!t || t.phase !== 'awaiting_payment' || now > t.deadline) return false;
    patch(id, (x) => ({ ...x, phase: 'cancelled', phaseSince: now, events: [...x.events, { label: 'You cancelled the trade', at: now }] }));
    return true;
  },

  /** Advances time-based changes: expiry, and (demo) the partner bank's steps. */
  tick(id: string, now: number): void {
    const t = tradeStore.get(id);
    if (!t) return;
    const due = now - t.phaseSince >= DEMO_STEP_MS;
    const add = (x: Trade, label: string): TradeEvent[] => [...x.events, { label, at: now }];
    if (t.phase === 'awaiting_payment') {
      // A request made before the deadline holds expiry until it is answered (FIN-08); the
      // extension runs from the original deadline. Demo only: the counterparty "answers".
      if (t.extension === 'requested') {
        if (due && DEMO_MODE) {
          patch(id, (x) => ({ ...x, extension: 'approved', deadline: x.deadline + EXTENSION_MS, phaseSince: now, events: add(x, `Extension approved by ${x.counterparty}`) }));
        }
      } else if (now > t.deadline) {
        patch(id, (x) => ({ ...x, phase: 'expired', phaseSince: now, events: add(x, 'Time ran out: the trade was cancelled') }));
      }
      return;
    }
    // The partner bank's steps advance on their own only in the demo (ADR-018). A real build
    // moves a trade only on bank evidence from the server, never on the user's "I have paid".
    if (!due || !DEMO_MODE) return;
    if (t.phase === 'confirming') {
      patch(id, (x) => ({ ...x, phase: 'awaiting_counterparty', phaseSince: now, events: add(x, 'Payment made to escrow by you') }));
    } else if (t.phase === 'awaiting_counterparty') {
      patch(id, (x) => ({ ...x, phase: 'releasing', phaseSince: now, events: add(x, `Payment made to escrow by ${x.counterparty}`) }));
    } else if (t.phase === 'releasing') {
      patch(id, (x) => ({
        ...x,
        phase: 'completed',
        phaseSince: now,
        events: [...add(x, 'Partner bank released the funds'), { label: `Paid to your account ending ${x.payout.last4}`, at: now }],
      }));
    }
  },

  /** One rating per completed trade. */
  rate(id: string, stars: number, feedback: string): boolean {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return false;
    const t = tradeStore.get(id);
    if (!t || t.phase !== 'completed' || t.rating) return false;
    return patch(id, (x) => ({ ...x, rating: { stars, feedback: feedback.trim().slice(0, 500) } })) !== null;
  },

  /** Back to the initial state (log-out / new account, and tests). */
  reset(): void {
    trades = [];
    emit();
  },
};

export function useTrade(id: string): Trade | undefined {
  return useSyncExternalStore(tradeStore.subscribe, () => tradeStore.get(id), () => tradeStore.get(id));
}


// Cleared on log-out and when a new account is created (ADR-018).
session.onUserChange(() => tradeStore.reset());

/** Other trades created in the same multi-listing order, oldest first. */
export function orderSiblings(t: Trade, all: readonly Trade[]): readonly Trade[] {
  if (!t.orderId) return [];
  return all.filter((x) => x.orderId === t.orderId && x.id !== t.id).slice().reverse();
}

export function useTrades(): readonly Trade[] {
  return useSyncExternalStore(tradeStore.subscribe, tradeStore.all, tradeStore.all);
}

/** `08:20 AM` style clock for event times. */
function clock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${String(h % 12 === 0 ? 12 : h % 12)}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Steps the user still waits for, shown greyed in the progress list. */
export function pendingSteps(t: Trade): string[] {
  const all = [
    'Payment made to escrow by you',
    `Payment made to escrow by ${t.counterparty}`,
    'Partner bank released the funds',
    `Paid to your account ending ${t.payout.last4}`,
  ];
  const done = new Set(t.events.map((e) => e.label));
  if (t.phase === 'expired' || t.phase === 'cancelled') return [];
  return all.filter((l) => !done.has(l));
}

export function progressFor(t: Trade): { label: string; at?: string }[] {
  return [...t.events.map((e) => ({ label: e.label, at: clock(e.at) })), ...pendingSteps(t).map((label) => ({ label }))];
}

/** Finished trades appear in History alongside the mock history. */
export function toHistoryItem(t: Trade): HistoryItem {
  const d = new Date(t.events[0].at);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: t.id,
    side: t.side,
    currency: t.currency,
    amountMinor: t.amountMinor,
    rateHundredths: t.rateHundredths,
    date: iso,
    status: t.phase === 'completed' ? 'completed' : t.phase === 'expired' || t.phase === 'cancelled' ? 'failed' : 'pending',
    reference: t.reference,
    payouts: t.phase === 'completed' ? [{ name: t.payout.name, bank: t.payout.bank, last4: t.payout.last4, amountMinor: t.side === 'buy' ? t.amountMinor : ngnFor(t.amountMinor, t.rateHundredths) }] : [],
    progress: progressFor(t),
    recorded: { transferMinor: t.transferMinor, payCurrency: t.payCurrency, feeKobo: t.side === 'buy' ? t.feeKobo : null },
  };
}
