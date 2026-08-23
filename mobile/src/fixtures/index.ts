/**
 * View-model fixtures for Milestone 1.
 *
 * These are presentation shapes, not domain entities. No persistence, no API and no
 * domain model exists yet. Naming follows the canonical glossary
 * (`DOCUMENT_INDEX.md` section 2A): `MatchAllocation` is product language for the
 * persisted `Match`, and using it here creates no new requirement.
 */

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
    label: 'Identity',
    state: 'complete',
    detail: 'Verified',
  },
  {
    id: 'security',
    label: 'Security',
    state: 'action-required',
    detail: 'Add a second factor to continue',
    action: 'Set up',
  },
  {
    id: 'eligibility',
    label: 'Eligible to transact',
    state: 'pending',
    detail: 'Available once the steps above are complete',
  },
];

export const READINESS_COMPLETE: readonly ReadinessDimension[] = [
  { id: 'identity', label: 'Identity', state: 'complete', detail: 'Verified' },
  { id: 'security', label: 'Security', state: 'complete', detail: 'Two-factor on' },
  {
    id: 'eligibility',
    label: 'Eligible to transact',
    state: 'complete',
    detail: 'You can create and accept offers',
  },
];

export type ActivityKind = 'offer' | 'allocation' | 'settlement';

/**
 * Each item carries its own amount. Amounts are never summed into a single figure:
 * an aggregate currency hero reads as a balance regardless of its label, and Xspeeria
 * has no balance of any kind.
 */
export interface ActivityItem {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly title: string;
  readonly pair: string;
  /** Minor units, with an explicit scale. Never a float. */
  readonly amountMinor: number;
  readonly currency: string;
  readonly scale: number;
  readonly status: string;
  readonly statusTone: 'neutral' | 'success' | 'warning' | 'error';
  readonly nextAction?: string;
  /** Surfaced first when true. */
  readonly timeCritical?: boolean;
}

export const ACTIVITY_ITEMS: readonly ActivityItem[] = [
  {
    id: 'alloc-1',
    kind: 'allocation',
    title: 'Allocation awaiting preparation',
    pair: 'NGN / GBP',
    amountMinor: 100000,
    currency: 'GBP',
    scale: 2,
    status: 'Preparation',
    statusTone: 'warning',
    nextAction: 'Choose a destination',
    timeCritical: true,
  },
  {
    id: 'offer-1',
    kind: 'offer',
    title: 'Open offer',
    pair: 'NGN / GBP',
    amountMinor: 250000,
    currency: 'GBP',
    scale: 2,
    status: 'Partially matched',
    statusTone: 'neutral',
  },
  {
    id: 'settle-1',
    kind: 'settlement',
    title: 'Settlement in progress',
    pair: 'NGN / GBP',
    amountMinor: 75000,
    currency: 'GBP',
    scale: 2,
    status: 'Awaiting funding',
    statusTone: 'neutral',
  },
];

export const NO_ACTIVITY: readonly ActivityItem[] = [];
