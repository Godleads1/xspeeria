/**
 * Filling one request from several listings (product owner, 2026-10-17;
 * `docs/adr/019-review-decisions-and-multi-offer-fill.md`). Example: a buyer needs
 * 1,000 USD and four sellers have 250 USD each.
 *
 * Each part is its own explicit acceptance of one listing with an explicit amount, so
 * Standing Standards §7.3 holds: nothing is clamped or silently resized. The user picks
 * every listing, sees the amount taken from each, and confirms them together. Each part
 * becomes a separate trade (its own match, escrow transfer, reference and fee), and the
 * server serialises each acceptance on its own Offer (§7.1). Integers only.
 */

import type { Listing } from '../market/data';
import type { Side } from '../market/MarketScreen';
import { ngnFor, transferFor } from './tradeStore';

export interface FillPart {
  readonly listing: Listing;
  /** Minor units of the listing currency taken from this listing. */
  readonly amountMinor: number;
}

export type FillPlan = readonly FillPart[];

export function plannedMinor(plan: FillPlan): number {
  return plan.reduce((sum, p) => sum + p.amountMinor, 0);
}

export function inPlan(plan: FillPlan, listingId: string): FillPart | undefined {
  return plan.find((p) => p.listing.id === listingId);
}

/**
 * Adds a listing, taking what is still needed or what the listing has left, whichever is
 * smaller. Returns the plan unchanged if nothing is needed, nothing is left, the listing is
 * already in the plan, or its currency does not match.
 */
export function addToPlan(
  plan: FillPlan,
  listing: Listing,
  requestedMinor: number,
  remainingOf: (l: Listing) => number,
): FillPlan {
  if (inPlan(plan, listing.id)) return plan;
  if (plan.length > 0 && plan[0].listing.currency !== listing.currency) return plan;
  const stillNeeded = requestedMinor - plannedMinor(plan);
  const take = Math.min(stillNeeded, remainingOf(listing));
  if (!Number.isSafeInteger(take) || take <= 0) return plan;
  return [...plan, { listing, amountMinor: take }];
}

export function removeFromPlan(plan: FillPlan, listingId: string): FillPlan {
  return plan.filter((p) => p.listing.id !== listingId);
}

export interface PlanTotals {
  readonly count: number;
  /** Foreign currency bought or sold, minor units. */
  readonly foreignMinor: number;
  /** NGN value of the parts at their own rates, kobo. */
  readonly ngnMinor: number;
  /** Sum of each trade's 1% coordination fee, minor units of `payCurrency` (ADR-021). */
  readonly feeMinor: number;
  /** What the user transfers in total, minor units of `payCurrency`, fees included. */
  readonly transferMinor: number;
  readonly payCurrency: string;
}

export function planTotals(side: Side, plan: FillPlan): PlanTotals {
  const currency = plan[0]?.listing.currency ?? '';
  let ngn = 0;
  let transfer = 0;
  let fee = 0;
  for (const p of plan) {
    ngn += ngnFor(p.amountMinor, p.listing.rateMilli);
    const t = transferFor(side, currency, p.amountMinor, p.listing.rateMilli);
    transfer += t.minor;
    fee += t.feeMinor;
  }
  if (!Number.isSafeInteger(ngn) || !Number.isSafeInteger(transfer)) throw new Error('Total is out of range');
  return {
    count: plan.length,
    foreignMinor: plannedMinor(plan),
    ngnMinor: ngn,
    feeMinor: fee,
    transferMinor: transfer,
    payCurrency: side === 'buy' ? 'NGN' : currency,
  };
}
