/**
 * View-model fixtures for the admin shell.
 *
 * Presentation shapes only. Status vocabulary is taken verbatim from ADR-001 so that
 * operator and customer surfaces never describe the same settlement differently. No new
 * settlement state is invented.
 */

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /** Shown only to staff holding this permission (display only; the server enforces it). */
  readonly permission?: string;
  /** Figma admin menu: work areas on top, then the "ADMIN" section. */
  readonly section?: 'work' | 'admin';
  readonly icon?: 'dashboard' | 'disputes' | 'staff' | 'audit' | 'setups' | 'profile';
}

/**
 * Navigation the shell actually renders. Every entry must resolve to a route that
 * exists under `admin/app`; `__tests__/shell.test.tsx` derives the route set from the
 * filesystem and fails if a rendered link would 404. Labels follow the Figma admin menu
 * ("Setups" holds role setup, ADR-051).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'overview', label: 'Dashboard', href: '/', section: 'work', icon: 'dashboard' },
  { id: 'disputes', label: 'Dispute Resolution', href: '/disputes', permission: 'disputes.read', section: 'work', icon: 'disputes' },
  { id: 'staff', label: 'Staff', href: '/staff', permission: 'staff.read', section: 'admin', icon: 'staff' },
  { id: 'users', label: 'Users', href: '/users', permission: 'users.read', section: 'admin', icon: 'staff' },
  { id: 'audit', label: 'Audit Logs', href: '/audit', permission: 'audit.read', section: 'admin', icon: 'audit' },
  { id: 'settings', label: 'Setups', href: '/settings', section: 'admin', icon: 'setups' },
  { id: 'profile', label: 'My profile', href: '/profile', section: 'admin', icon: 'profile' },
];

/**
 * Destinations the operator console is expected to grow (ADR-051 A-3, Figma admin menu),
 * kept here so the intent stays recorded. **Not rendered.** Move an entry into `NAV_ITEMS`
 * in the same change that adds its page and its server-side permission check.
 */
export const PLANNED_DESTINATIONS: readonly NavItem[] = [
  { id: 'reversals', label: 'Reversal', href: '/reversals' },
  { id: 'fraud', label: 'Fraud Management', href: '/fraud' },
  { id: 'kyc', label: 'Identity checks', href: '/kyc' },
  { id: 'outages', label: 'Service Outage Mgt', href: '/outages' },
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

/** Test data for the table components only. Not shown on any page. */
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
