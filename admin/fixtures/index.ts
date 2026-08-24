/**
 * View-model fixtures for the admin shell.
 *
 * Presentation shapes only. No domain entity, persistence or API exists. Status
 * vocabulary is taken verbatim from ADR-001 so that operator and customer surfaces
 * never describe the same settlement differently. No new settlement state is invented.
 */

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

/**
 * Navigation the shell actually renders. Every entry must resolve to a route that
 * exists under `admin/app`; `__tests__/shell.test.tsx` derives the route set from the
 * filesystem and fails if a rendered link would 404.
 */
export const NAV_ITEMS: readonly NavItem[] = [{ id: 'overview', label: 'Overview', href: '/' }];

/**
 * Destinations the operator console is expected to grow, kept here so the intent stays
 * recorded rather than rediscovered. **Not rendered.** Each one requires its own review
 * of operator authorization before it becomes a route: an admin surface reaching KYC
 * cases, allocations, settlements, reconciliation or the audit log is privileged, and
 * Phase 1 grants no privileged operator workflow. Move an entry into `NAV_ITEMS` in the
 * same change that adds its page.
 */
export const PLANNED_DESTINATIONS: readonly NavItem[] = [
  { id: 'kyc', label: 'KYC review', href: '/kyc' },
  { id: 'allocations', label: 'Allocations', href: '/allocations' },
  { id: 'settlements', label: 'Settlements', href: '/settlements' },
  { id: 'reconciliation', label: 'Reconciliation', href: '/reconciliation' },
  { id: 'audit', label: 'Audit log', href: '/audit' },
];

export type LegState =
  | 'PENDING'
  | 'ESCROW_PROVISIONED'
  | 'FUNDED'
  | 'RELEASE_SENT'
  | 'PAID_OUT'
  | 'RETURN_SENT'
  | 'RETURNED'
  | 'PROVISION_FAILED'
  | 'PAYOUT_FAILED';

export interface SettlementRow {
  readonly id: string;
  readonly reference: string;
  readonly pair: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly scale: number;
  readonly legState: LegState;
}

export const SETTLEMENT_ROWS: readonly SettlementRow[] = [
  {
    id: 'row-1',
    reference: 'STL-0001',
    pair: 'NGN / GBP',
    amountMinor: 100000,
    currency: 'GBP',
    scale: 2,
    legState: 'FUNDED',
  },
  {
    id: 'row-2',
    reference: 'STL-0002',
    pair: 'NGN / GBP',
    amountMinor: 250000,
    currency: 'GBP',
    scale: 2,
    legState: 'ESCROW_PROVISIONED',
  },
  {
    id: 'row-3',
    reference: 'STL-0003',
    pair: 'NGN / GBP',
    amountMinor: 75000,
    currency: 'GBP',
    scale: 2,
    legState: 'PAYOUT_FAILED',
  },
];

export const NO_ROWS: readonly SettlementRow[] = [];
