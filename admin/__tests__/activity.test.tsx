/** Customer activity log and deal timelines (ADR-073): Super Admin only, read-only, no secrets. */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NAV_ITEMS } from '../fixtures';
import { CustomerActivityScreen, activityCsv, lagosDay } from '../components/screens/CustomerActivityScreen';
import { DealTimelineScreen, eventFacts } from '../components/screens/DealTimelineScreen';
import { DealsScreen, decimalMoney } from '../components/screens/DealsScreen';
import { activityLabel, eventLabel } from '../components/screens/activityLabels';
import { AdminApiError, makeAdminApi, type ActivityItem, type AdminApi, type CustomerActivityPage, type DealTimeline, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

const ME: Me = {
  id: 's-1', email: 'boss@xspeeria.test', name: 'Boss', role_id: 'r', role: 'super_admin', status: 'active', phone: null,
  has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions: ['activity.read'],
};
const UID = '11111111-2222-3333-4444-555555555555';
const MID = 'abcdef12-0000-4000-8000-000000000001';

function item(over: Partial<ActivityItem>): ActivityItem {
  return {
    source: 'customer', at: '2026-10-27T10:00:00Z', action: 'signed_in', category: 'account', outcome: 'done', route: null,
    method: null, status: null, match_id: null, offer_id: null, ref_id: null, detail: null, device: 'Xspeeria app', country: 'NG',
    staff_name: null, target_type: null, deal_ref: null, ...over,
  };
}

const PAGE: CustomerActivityPage = {
  customer: { id: UID, name: 'Ada Obi', email: 'ada@example.com', phone: '+2348000000001', status: 'active', joined_at: '2026-10-01T09:00:00Z' },
  total: 3,
  items: [
    item({ source: 'staff', action: 'customer_suspended', category: 'staff', staff_name: 'Boss', device: null, country: null, at: '2026-10-27T12:00:00Z' }),
    item({ action: 'payout_accounts_chosen', category: 'deal', match_id: MID, deal_ref: 'ABCDEF12', at: '2026-10-27T11:00:00Z' }),
    item({ action: 'sign_in_failed', category: 'security', outcome: 'refused' }),
  ],
};

const DEAL: DealTimeline = {
  match_id: MID, ref: 'ABCDEF12', transaction_id: null, taken_at: '2026-10-27T10:00:00Z', currency: 'USD', counter_currency: 'NGN',
  amount: '200.00', rate: '1320.500000', offer_owner: { id: UID, email: 'ben@example.com' }, taker: { id: UID, email: 'ada@example.com' },
  phase: 'COMPLETED', closure_reason: null,
  events: [
    { at: '2026-10-27T09:00:00Z', kind: 'offer_posted', by: 'offer_owner', amount: '200.00', rate: '1320.500000' },
    { at: '2026-10-27T10:05:00Z', kind: 'EscrowFunded', by: 'taker', currency: 'NGN', amount: '264100.00', fee: '1320.50' },
    { at: '2026-10-27T10:06:00Z', kind: 'customer:paid_into_escrow_pretend', by: 'taker', outcome: 'done' },
    { at: '2026-10-27T10:07:00Z', kind: 'hold_opened', by: 'Grace Ops', hold: 'dispute' },
    { at: '2026-10-27T10:09:00Z', kind: 'SettlementCompleted', by: 'system' },
  ],
};

function mount(node: React.ReactElement, over: Partial<AdminApi> = {}): AdminApi {
  const a: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => ME),
    customerActivity: vi.fn(async () => PAGE),
    listDeals: vi.fn(async () => ({ total: 1, items: [DEAL] })),
    deal: vi.fn(async () => DEAL),
    ...over,
  };
  render(<SessionProvider api={a} onSignedOut={() => undefined}>{node}</SessionProvider>);
  return a;
}

describe('Customer activity', () => {
  it('lists what the customer and staff did, newest first, with deal links', async () => {
    const a = mount(<CustomerActivityScreen id={UID} />);
    expect(await screen.findByTestId('activity-customer')).toHaveTextContent('ada@example.com');
    expect(screen.getByText('Staff suspended the account')).toBeInTheDocument();
    expect(screen.getByText('Staff: Boss')).toBeInTheDocument();
    expect(screen.getByText('Sign-in refused')).toBeInTheDocument();
    expect(screen.getByText('Refused')).toBeInTheDocument();
    expect(screen.getByTestId('deal-ABCDEF12')).toHaveAttribute('href', `/deals/case?id=${MID}`);
    expect(screen.getByTestId('activity-count')).toHaveTextContent('Showing 3 of 3');
    expect(screen.queryByTestId('activity-more')).toBeNull();
    expect(a.customerActivity).toHaveBeenCalledWith(UID, { category: undefined, since: undefined, until: undefined, offset: 0, limit: 50 });
  });

  it('filters by type and by Lagos dates', async () => {
    const a = mount(<CustomerActivityScreen id={UID} />);
    await screen.findByTestId('activity-customer');
    fireEvent.change(screen.getByTestId('activity-category'), { target: { value: 'deal' } });
    fireEvent.change(screen.getByTestId('activity-from'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByTestId('activity-to'), { target: { value: '2026-10-27' } });
    await waitFor(() =>
      expect(a.customerActivity).toHaveBeenLastCalledWith(UID, {
        category: 'deal', since: '2026-10-01T00:00:00+01:00', until: '2026-10-27T23:59:59.999+01:00', offset: 0, limit: 50,
      }),
    );
    expect(lagosDay('not a date', false)).toBeUndefined();
  });

  it('loads older entries and shows a refusal from the server', async () => {
    const older = { ...PAGE, total: 4, items: [item({ action: 'signed_up', at: '2026-10-01T09:00:00Z' })] };
    const calls = vi.fn().mockResolvedValueOnce({ ...PAGE, total: 4 }).mockResolvedValueOnce(older);
    mount(<CustomerActivityScreen id={UID} />, { customerActivity: calls });
    fireEvent.click(await screen.findByTestId('activity-more'));
    expect(await screen.findByText('Signed up')).toBeInTheDocument();
    expect(calls).toHaveBeenLastCalledWith(UID, expect.objectContaining({ offset: 3, limit: 50 }));
  });

  it('shows the server refusing anyone who is not the Super Admin', async () => {
    const refused = vi.fn(async () => {
      throw new AdminApiError('AUTH_403_FORBIDDEN', 403, 'You do not have permission to do that.');
    });
    mount(<CustomerActivityScreen id={UID} />, { customerActivity: refused });
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-customer')).toBeNull();
  });

  it('exports a CSV that a spreadsheet cannot run as a formula', () => {
    const csv = activityCsv([item({ action: 'other', device: '=HYPERLINK("x")' })]);
    expect(csv.split('\r\n')[0]).toContain('Date (Lagos)');
    expect(csv).toContain('Other change');
    expect(csv).not.toContain(',"=HYPERLINK');
  });
});

describe('Transactions', () => {
  it('finds deals by reference and opens the timeline', async () => {
    const a = mount(<DealsScreen />);
    expect(await screen.findByTestId('deal-ABCDEF12')).toHaveAttribute('href', `/deals/case?id=${MID}`);
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('deals-search'), { target: { value: ' abcdef12 ' } });
    await waitFor(() => expect(a.listDeals).toHaveBeenLastCalledWith({ search: 'abcdef12', offset: 0, limit: 50 }));
  });

  it('shows every step in order with who did it and the exact amounts', async () => {
    mount(<DealTimelineScreen id={MID} />);
    expect(await screen.findByText('Deal ABCDEF12')).toBeInTheDocument();
    const steps = within(screen.getByTestId('deal-timeline')).getAllByRole('listitem');
    expect(steps.map((s) => s.getAttribute('data-testid'))).toEqual([
      'event-offer_posted', 'event-EscrowFunded', 'event-customer:paid_into_escrow_pretend', 'event-hold_opened', 'event-SettlementCompleted',
    ]);
    expect(steps[1]).toHaveTextContent('Payment arrived in escrow');
    expect(steps[1]).toHaveTextContent('Taker');
    expect(steps[1]).toHaveTextContent('fee');
    expect(steps[2]).toHaveTextContent('Paid into escrow (pretend bank)');
    expect(steps[3]).toHaveTextContent('Grace Ops'); // staff are named
    expect(steps[4]).toHaveTextContent('Xspeeria');
  });

  it('reads the rate as the pair does: NGN per USD, or GHS per USD (ADR-111)', async () => {
    mount(<DealTimelineScreen id={MID} />);
    expect(await screen.findByTestId('deal-summary')).toHaveTextContent('NGN 1320.500000 per USD');
    cleanup();
    mount(<DealTimelineScreen id={MID} />, { deal: vi.fn(async () => ({ ...DEAL, counter_currency: 'GHS', rate: '11.500000' })) });
    expect(await screen.findByTestId('deal-summary')).toHaveTextContent('GHS 11.500000 per USD');
  });

  it('keeps money exact and labels unknown steps in words', () => {
    expect(decimalMoney('264100.00', 'NGN')).toContain('264,100.00');
    expect(decimalMoney('0.10', 'USD')).toBe('$0.10');
    expect(decimalMoney('1e5', 'USD')).toBe('—');
    expect(decimalMoney(null, 'USD')).toBe('—');
    expect(eventFacts({ at: '', kind: 'x', by: 'system', outcome: 'refused' })).toBe('Refused');
    expect(eventLabel('SomethingNew')).toBe('SomethingNew');
    expect(activityLabel('brand_new_thing')).toBe('Brand new thing');
  });

  it('is in the menu for the Super Admin permission only', () => {
    const item = NAV_ITEMS.find((n) => n.id === 'deals');
    expect(item?.permission).toBe('activity.read');
    expect(item?.href).toBe('/deals');
  });
});
