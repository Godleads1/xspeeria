/**
 * Reversals (ADR-065): the list, the details with Approve / Reject, the "never your own request"
 * rule as shown on screen, and "Process Refund" on a dispute (asks, never moves money).
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DisputeCaseScreen } from '../components/screens/DisputeCaseScreen';
import { ReversalScreen } from '../components/screens/ReversalScreen';
import { ReversalsScreen } from '../components/screens/ReversalsScreen';
import { makeAdminApi, type AdminApi, type DisputeCase, type Me, type ReversalDetail, type ReversalRow } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(id: string, permissions: string[]): Me {
  return {
    id, email: `${id}@xspeeria.test`, name: 'Staff', role_id: 'r', role: 'ops_admin', status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions,
  };
}
const OPS = me('s-2', ['reversals.read', 'reversals.create', 'reversals.approve', 'disputes.read']);
const ASKER = me('s-1', ['reversals.read', 'reversals.create', 'reversals.approve', 'disputes.read', 'disputes.update']);
const READER = me('s-3', ['reversals.read']);

const ROW: ReversalRow = {
  id: '99999999-2222-3333-4444-555555555555', ref: 'RVL-99999999', requested_by: 'The Boss', customer: 'David Obi',
  returns: [{ currency: 'NGN', scale: 2, minor: '26674100' }, { currency: 'USD', scale: 2, minor: '20200' }],
  category_name: 'Funds not received', reason: 'Seller never delivered', status: 'pending',
  requested_at: '2026-10-26T10:00:00Z', decided_at: null,
};

const DETAIL: ReversalDetail = {
  id: ROW.id, ref: ROW.ref, status: 'pending', reason: 'Seller never delivered', requested_by: 'The Boss', requested_by_id: 's-1',
  requested_at: '2026-10-26T10:00:00Z', decided_by: null, decided_at: null, decision_note: null,
  dispute: { id: '11111111-2222-3333-4444-555555555555', ref: '11111111', category_name: 'Funds not received', description: 'I paid, nothing came', status: 'open' },
  customer: { name: 'David Obi', email: 'david@example.com', phone: '+2348038383838' },
  deal: {
    transaction_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', phase: 'AWAITING_FUNDING', closure_reason: null,
    legs: [{ party: 'REQUESTER', currency: 'USD', scale: 2, amount_minor: '20000', fee_minor: '200', state: 'FUNDED' }],
  },
  returns: [{ user_id: 'u-1', name: 'David Obi', email: 'david@example.com', phone: null, currency: 'USD', scale: 2, minor: '20200', state: 'FUNDED' }],
  can_return: true,
};

function mount(who: Me, ui: ReactElement, over: Partial<AdminApi> = {}): AdminApi {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => who),
    listReversals: vi.fn(async () => ({ total: 1, items: [ROW] })),
    reversalStats: vi.fn(async () => ({ total: 3, approved: 1, pending: 1, rejected: 1 })),
    reversal: vi.fn(async () => DETAIL),
    approveReversal: vi.fn(async () => undefined),
    rejectReversal: vi.fn(async () => undefined),
    listStaff: vi.fn(async () => []),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{ui}</SessionProvider>);
  return api;
}

describe('reversal list', () => {
  it('shows real counts and exact money per currency, with no AI or risk columns', async () => {
    mount(READER, <ReversalsScreen />);
    await screen.findByText('RVL-99999999');
    expect(screen.getByTestId('reversals-total')).toHaveTextContent('3');
    expect(screen.getByText('₦266,741.00')).toBeInTheDocument();
    expect(screen.getByText('$202.00')).toBeInTheDocument();
    expect(screen.queryByText(/AI Flagged|Risk Level/)).toBeNull();
  });

  it('filters by status', async () => {
    const api = mount(READER, <ReversalsScreen />);
    await screen.findByText('RVL-99999999');
    fireEvent.change(screen.getByTestId('reversals-status'), { target: { value: 'approved' } });
    await waitFor(() => expect(api.listReversals).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'approved' })));
  });
});

describe('reversal details', () => {
  it('approves after confirming what goes back', async () => {
    const api = mount(OPS, <ReversalScreen id={ROW.id} />);
    fireEvent.click(await screen.findByTestId('approve'));
    const dialog = screen.getByTestId('approve-dialog');
    expect(within(dialog).getByText('$202.00')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId('approve-confirm'));
    await waitFor(() => expect(api.approveReversal).toHaveBeenCalledWith(ROW.id));
    expect(await screen.findByText('Request Approved Successfully')).toBeInTheDocument();
  });

  it('rejecting needs a reason', async () => {
    const api = mount(OPS, <ReversalScreen id={ROW.id} />);
    fireEvent.click(await screen.findByTestId('reject'));
    expect(screen.getByTestId('reason-confirm')).toBeDisabled();
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'The deal stands' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    await waitFor(() => expect(api.rejectReversal).toHaveBeenCalledWith(ROW.id, 'The deal stands'));
  });

  it('the person who asked sees no buttons, only who must decide', async () => {
    mount(ASKER, <ReversalScreen id={ROW.id} />);
    expect(await screen.findByTestId('own-request')).toBeInTheDocument();
    expect(screen.queryByTestId('approve')).toBeNull();
    expect(screen.queryByTestId('reject')).toBeNull();
  });

  it('staff without reversals.approve cannot decide', async () => {
    mount(READER, <ReversalScreen id={ROW.id} />);
    await screen.findByText('Reversal Details');
    expect(screen.queryByTestId('approve')).toBeNull();
  });
});

const CASE: DisputeCase = {
  id: DETAIL.dispute.id, ref: '11111111', kind: 'dispute', customer: 'David Obi', customer_email: 'david@example.com',
  category: 'funds_not_received', category_name: 'Funds not received', status: 'under_review', priority: 'medium', assigned_to: null,
  assigned_name: null, escalated: false, created_at: '2026-10-26T10:00:00Z', resolved_at: null, sla_due_at: '2026-10-27T10:00:00Z',
  now: '2026-10-26T12:00:00Z', description: 'I paid, nothing came', desired_resolution: null, opened_by_staff: false,
  customer_details: { id: 'u-1', name: 'David Obi', email: 'david@example.com', phone: '+2348038383838', status: 'active' },
  deal: {
    transaction_id: DETAIL.deal.transaction_id, match_id: 'm', rate: '1320.5', phase: 'AWAITING_FUNDING', escrow_paused: true,
    legs: [{ party: 'REQUESTER', paid_by: 'u-1', currency: 'USD', scale: 2, amount_minor: '20000', fee_minor: '200', state: 'FUNDED' }],
    other_party: { id: 'u-2', name: null, email: 'ada@example.com', phone: '+2348031111111', status: 'active' },
  },
  reversals: [], can_refund: true, messages: [],
  timeline: [{ at: '2026-10-26T10:00:00Z', who: 'customer', name: null, event: 'created', detail: null }],
};

describe('process refund on a dispute', () => {
  it('asks for approval with a reason; there is no amount to type', async () => {
    const requestRefund = vi.fn(async () => ({ id: ROW.id, ref: ROW.ref }));
    mount(ASKER, <DisputeCaseScreen id={CASE.id} />, { dispute: vi.fn(async () => CASE), requestRefund });
    fireEvent.click(await screen.findByTestId('process-refund'));
    expect(screen.getByTestId('reason-description')).toHaveTextContent('sent for approval');
    expect(screen.queryByPlaceholderText(/amount/i)).toBeNull();
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'Seller never delivered' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    await waitFor(() => expect(requestRefund).toHaveBeenCalledWith(CASE.id, 'Seller never delivered'));
  });

  it('is hidden without reversals.create, when nothing can be returned, and links a pending request', async () => {
    mount(me('s-4', ['disputes.read', 'disputes.update']), <DisputeCaseScreen id={CASE.id} />, { dispute: vi.fn(async () => CASE) });
    await screen.findByText('Dispute Details');
    expect(screen.queryByTestId('process-refund')).toBeNull();
  });

  it('shows the pending request instead of the button', async () => {
    const withPending = { ...CASE, can_refund: false, reversals: [{ id: ROW.id, ref: ROW.ref, status: 'pending' as const }] };
    mount(ASKER, <DisputeCaseScreen id={CASE.id} />, { dispute: vi.fn(async () => withPending) });
    expect(await screen.findByTestId('reversal-pending')).toHaveAttribute('href', `/reversals/case?id=${ROW.id}`);
    expect(screen.queryByTestId('process-refund')).toBeNull();
  });
});
