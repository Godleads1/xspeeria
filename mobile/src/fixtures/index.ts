/**
 * View-model fixtures for Milestone 1.
 *
 * These are presentation shapes, not domain entities. No persistence, no API and no
 * domain model exists yet. Naming follows the canonical glossary
 * (`DOCUMENT_INDEX.md` section 2A): `MatchAllocation` is product language for the
 * persisted `Match`, and using it here creates no new requirement.
 */

import { k } from "../i18n";

export type ReadinessState = 'complete' | 'action-required' | 'pending';

export interface ReadinessDimension {
  readonly id: 'identity' | 'security' | 'eligibility';
  readonly label: string;
  readonly state: ReadinessState;
  readonly detail: string;
  readonly action?: string;
}

/**
 * Exactly three dimensions. Beneficiary, payout and funding readiness are
 * allocation-specific and must never appear on Home.
 */
export const READINESS_INCOMPLETE: readonly ReadinessDimension[] = [
  {
    id: 'identity',
    label: k("Identity"),
    state: 'complete',
    detail: k("Verified"),
  },
  {
    id: 'security',
    label: k("Security"),
    state: 'action-required',
    detail: k("Add a second factor to continue"),
    action: k("Set up"),
  },
  {
    id: 'eligibility',
    label: k("Eligible to transact"),
    state: 'pending',
    detail: k("Available once the steps above are complete"),
  },
];

export const READINESS_COMPLETE: readonly ReadinessDimension[] = [
  { id: 'identity', label: k("Identity"), state: 'complete', detail: k("Verified") },
  { id: 'security', label: k("Security"), state: 'complete', detail: k("Two-factor on") },
  {
    id: 'eligibility',
    label: k("Eligible to transact"),
    state: 'complete',
    detail: k("You can create and accept offers"),
  },
];

export type ActivityKind = 'offer' | 'allocation' | 'settlement';

/**
 * Each item carries its own amount. Amounts are never summed into a single figure:
 * an aggregate currency hero reads as a balance regardless of its label, and Xspeeria
 * has no balance of any kind.
 *
 * MOCK DATA (DEC-008): pairs and amounts follow the Figma Home frame (node 39:2882),
 * currency swaps only. The Figma "Shopping" row is omitted because Cards is COMING SOON.
 */
export interface ActivityItem {
  readonly id: string;
  readonly kind: ActivityKind;
  /** Corridor as shown in the row title, e.g. `NGN → USD`. */
  readonly title: string;
  readonly pair: string;
  /** Minor units, with an explicit scale. Never a float. */
  readonly amountMinor: number;
  readonly currency: string;
  readonly scale: number;
  readonly status: string;
  readonly statusTone: 'neutral' | 'success' | 'warning' | 'error';
  /** Display time or date, already formatted. */
  readonly when: string;
  readonly nextAction?: string;
  /** Surfaced first when true. */
  readonly timeCritical?: boolean;
}

export const ACTIVITY_ITEMS: readonly ActivityItem[] = [
  {
    id: 'settle-1',
    kind: 'settlement',
    title: 'NGN → USD',
    pair: 'NGN / USD',
    amountMinor: 45000000,
    currency: 'NGN',
    scale: 2,
    status: 'Completed',
    statusTone: 'success',
    when: '4:34 AM',
  },
  {
    id: 'alloc-1',
    kind: 'allocation',
    title: 'NGN → CAD',
    pair: 'NGN / CAD',
    amountMinor: 2300000,
    currency: 'NGN',
    scale: 2,
    status: 'Pending',
    statusTone: 'warning',
    when: '23/09/2024',
    nextAction: 'Add your payout account',
    timeCritical: true,
  },
  {
    id: 'offer-1',
    kind: 'offer',
    title: 'NGN → EUR',
    pair: 'NGN / EUR',
    amountMinor: 6700000,
    currency: 'NGN',
    scale: 2,
    status: 'Failed',
    statusTone: 'error',
    when: '12/09/2024',
  },
];

export const NO_ACTIVITY: readonly ActivityItem[] = [];

/**
 * A market rate: how many units of `base` buy ONE unit of `quote`.
 *
 * `rate` is a decimal string, never a float, and it is a price, not an amount anyone
 * holds. MOCK DATA (DEC-008): the Figma frame repeats one placeholder value (1,190.47)
 * for three corridors; distinct illustrative values are used instead.
 */
export interface MarketRate {
  readonly id: string;
  readonly base: string;
  readonly quote: string;
  readonly rate: string;
}

/** Best marketplace rates (mock), matching the Market listings, at or below the CBN official rate (ADR-020). */
export const MARKET_RATES: readonly MarketRate[] = [
  { id: 'ngn-usd', base: 'NGN', quote: 'USD', rate: '1325.00' },
  { id: 'ngn-gbp', base: 'NGN', quote: 'GBP', rate: '1760.00' },
  { id: 'ngn-eur', base: 'NGN', quote: 'EUR', rate: '1488.00' },
];

/** The best NGN → USD rate currently offered on the marketplace (mock): the cheapest USD offer. */
export const BEST_RATE: MarketRate = { id: 'best-ngn-usd', base: 'NGN', quote: 'USD', rate: '1325.00' };

export const MOCK_USER = { name: 'David Peters', initials: 'DP' } as const;
