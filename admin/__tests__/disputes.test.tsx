import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DisputeCaseScreen } from '../components/screens/DisputeCaseScreen';
import { DisputeCategoriesScreen } from '../components/screens/DisputeCategoriesScreen';
import { DisputesScreen, Sla } from '../components/screens/DisputesScreen';
import { makeAdminApi, type AdminApi, type DisputeCase, type DisputeRow, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(role: string, permissions: string[]): Me {
  return {
    id: 's-1', email: 'x@xspeeria.test', name: 'Ada Agent', role_id: 'r', role, status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions,
  };
}
const AGENT = me('support_agent', ['disputes.read', 'disputes.create', 'disputes.update']);
const BOSS = me('super_admin', ['disputes.read', 'disputes.create', 'disputes.update', 'disputes.approve', 'staff.read']);

const ROW: DisputeRow = {
  id: '11111111-2222-3333-4444-555555555555', ref: '11111111', kind: 'dispute', customer: 'David Obi', customer_email: 'david@example.com',
  category: 'funds_not_received', category_name: 'Funds not received', status: 'open', priority: 'medium', assigned_to: null,
  assigned_name: null, escalated: false, created_at: '2026-10-26T10:00:00Z', resolved_at: null, sla_due_at: '2026-10-27T10:00:00Z',
};

const CASE: DisputeCase = {
  ...ROW,
  now: '2026-10-26T12:00:00Z',
  description: 'I paid, nothing came',
  desired_resolution: null,
  opened_by_staff: false,
  customer_details: { id: 'u-1', name: 'David Obi', email: 'david@example.com', phone: '+2348038383838', status: 'active' },
  deal: {
    transaction_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', match_id: 'm', rate: '1320.50', phase: 'AWAITING_FUNDING', escrow_paused: true,
    legs: [
      { party: 'ACCEPTER', paid_by: 'u-2', currency: 'NGN', scale: 2, amount_minor: '26410000', fee_minor: '264100', state: 'ESCROW_PROVISIONED' },
      { party: 'REQUESTER', paid_by: 'u-1', currency: 'USD', scale: 2, amount_minor: '20000', fee_minor: '200', state: 'FUNDED' },
    ],
    other_party: { id: 'u-2', name: null, email: 'ada@example.com', phone: '+2348031111111', status: 'active' },
  },
  messages: [{ id: 'm1', author: 'other_party', staff_name: null, body: 'Not paid either', created_at: '2026-10-26T11:00:00Z' }],
  timeline: [{ at: '2026-10-26T10:00:00Z', who: 'customer', name: null, event: 'created', detail: null }],
};

function mount(who: Me, ui: ReactElement, over: Partial<AdminApi> = {}): AdminApi {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => who),
    listDisputes: vi.fn(async () => ({ now: '2026-10-26T12:00:00Z', total: 1, items: [ROW] })),
    disputeStats: vi.fn(async () => ({ total: 1, resolved_7_days: 0, pending: 1, overdue: 0, avg_resolution_seconds: null })),
    dispute: vi.fn(async () => CASE),
    listStaff: vi.fn(async () => []),
    disputeCategories: vi.fn(async () => [
      { code: 'funds_not_received', name: 'Funds not received', description: 'Money missing', active: true },
      { code: 'old_one', name: 'Old one', description: '', active: false },
    ]),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{ui}</SessionProvider>);
  return api;
}

describe('SLA timer', () => {
  it('counts down, turns amber under 6 hours, shows overdue, and met or missed once closed', () => {
    const due = Date.parse(ROW.sla_due_at);
    const { rerender } = render(<Sla row={ROW} now={due - (22 * 3600 + 5) * 1000} />);
    expect(screen.getByText('22:00:05')).toHaveStyle({ color: '#13A36B' });
    rerender(<Sla row={ROW} now={due - 3600_000} />);
    expect(screen.getByText('01:00:00')).toHaveStyle({ color: '#C27803' });
    rerender(<Sla row={ROW} now={due + 1} />);
    expect(screen.getByText('SLA Overdue')).toBeInTheDocument();
    rerender(<Sla row={{ ...ROW, status: 'resolved', resolved_at: '2026-10-26T20:00:00Z' }} now={due + 1} />);
    expect(screen.getByText('Met')).toBeInTheDocument();
    rerender(<Sla row={{ ...ROW, status: 'resolved', resolved_at: '2026-10-28T20:00:00Z' }} now={due + 1} />);
    expect(screen.getByText('Missed')).toBeInTheDocument();
  });
});

describe('dispute list', () => {
  it('shows the tiles, the list with the SLA from the server clock, and filters', async () => {
    const api = mount(AGENT, <DisputesScreen />);
    expect(await screen.findByText('David Obi')).toBeInTheDocument();
    expect(screen.getByText('22:00:00')).toBeInTheDocument();
    expect(screen.getByTestId('disputes-pending')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('disputes-mine'));
    await waitFor(() => expect(api.listDisputes).toHaveBeenLastCalledWith({ search: undefined, status: undefined, mine: true, offset: 0, limit: 50 }));
    expect(screen.getByTestId('start-dispute')).toBeInTheDocument();
  });

  it('hides Start a dispute without disputes.create', async () => {
    mount(me('ops_admin', ['disputes.read']), <DisputesScreen />);
    await screen.findByText('David Obi');
    expect(screen.queryByTestId('start-dispute')).toBeNull();
  });
});

describe('dispute case', () => {
  it('shows the deal with exact money, the escrow pause, and both people', async () => {
    mount(AGENT, <DisputeCaseScreen id={ROW.id} />);
    const overview = await screen.findByTestId('overview');
    expect(within(overview).getByText(/₦264,100.00/)).toBeInTheDocument();
    expect(within(overview).getByText('Paused while this dispute is open')).toBeInTheDocument();
    expect(within(screen.getByTestId('other-party')).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(screen.getByTestId('conversation')).getByText('Not paid either')).toBeInTheDocument();
  });

  it('a support agent works the case but cannot close it', async () => {
    const replyDispute = vi.fn(async () => undefined);
    const escalateDispute = vi.fn(async () => undefined);
    const api = mount(AGENT, <DisputeCaseScreen id={ROW.id} />, { replyDispute, escalateDispute });
    await screen.findByTestId('overview');
    expect(screen.queryByTestId('close-case')).toBeNull();
    fireEvent.change(screen.getByTestId('reply'), { target: { value: '  Send the receipt please ' } });
    fireEvent.click(screen.getByTestId('send-reply'));
    await waitFor(() => expect(replyDispute).toHaveBeenCalledWith(ROW.id, 'Send the receipt please'));
    fireEvent.click(screen.getByTestId('escalate'));
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'Large amount' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    await waitFor(() => expect(escalateDispute).toHaveBeenCalledWith(ROW.id, 'Large amount'));
    expect(api.dispute).toHaveBeenCalledTimes(3);
  });

  it('closing needs an outcome and explains what happens to the escrow', async () => {
    const resolveDispute = vi.fn(async () => undefined);
    mount(BOSS, <DisputeCaseScreen id={ROW.id} />, { resolveDispute });
    await screen.findByTestId('overview');
    fireEvent.click(screen.getByTestId('close-case'));
    const dialog = screen.getByTestId('close-dialog');
    expect(within(dialog).getByText(/pays out only if both sides paid in/)).toBeInTheDocument();
    expect(screen.getByTestId('close-confirm')).toBeDisabled();
    fireEvent.change(screen.getByTestId('outcome'), { target: { value: 'favor_initiator' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('close-confirm'));
    });
    expect(resolveDispute).toHaveBeenCalledWith(ROW.id, 'favor_initiator', undefined);
  });
});

describe('dispute categories', () => {
  it('lists active and switched-off; only disputes.approve may change them', async () => {
    mount(AGENT, <DisputeCategoriesScreen />);
    expect(await screen.findByText('Old one')).toBeInTheDocument();
    expect(screen.getByText('Switched off')).toBeInTheDocument();
    expect(screen.queryByTestId('add-category')).toBeNull();
  });

  it('adds a category', async () => {
    const saveDisputeCategory = vi.fn(async () => ({ code: 'tech', name: 'Technical Problem', description: '', active: true }));
    mount(BOSS, <DisputeCategoriesScreen />, { saveDisputeCategory });
    await screen.findByText('Old one');
    fireEvent.click(screen.getByTestId('add-category'));
    fireEvent.change(screen.getByTestId('cat-name'), { target: { value: ' Technical Problem ' } });
    fireEvent.click(screen.getByTestId('cat-save'));
    expect(await screen.findByText('Technical Problem is saved.')).toBeInTheDocument();
    expect(saveDisputeCategory).toHaveBeenCalledWith(null, { name: 'Technical Problem', description: '', active: true });
  });
});

describe('raise dispute', () => {
  it('walks the three steps and opens a case for the chosen customer', async () => {
    const openDisputeFor = vi.fn(async () => ({ id: 'x', ref: 'ND88ENE0' }));
    const listCustomers = vi.fn(async () => ({
      total: 1,
      items: [{ id: 'u-1', ref: 'U1', name: 'David Obi', email: 'david@example.com', phone: '+2348038383838', status: 'active' as const, kyc_status: null, created_at: '', last_login_at: null }],
    }));
    mount(AGENT, <DisputesScreen />, { openDisputeFor, listCustomers });
    await screen.findByText('David Obi');
    fireEvent.click(screen.getByTestId('start-dispute'));
    const next = () => screen.getByTestId('raise-next');
    expect(next()).toBeDisabled();
    fireEvent.click(await screen.findByTestId('cat-funds_not_received'));
    expect(screen.queryByTestId('cat-old_one')).toBeNull();
    fireEvent.change(screen.getByTestId('customer-search'), { target: { value: 'david' } });
    fireEvent.click(await screen.findByTestId('pick-u-1'));
    fireEvent.change(screen.getByTestId('resource-id'), { target: { value: 'not-an-id' } });
    expect(next()).toBeDisabled();
    fireEvent.change(screen.getByTestId('resource-id'), { target: { value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } });
    fireEvent.click(next());
    fireEvent.change(screen.getByTestId('describe'), { target: { value: 'Customer called' } });
    fireEvent.change(screen.getByTestId('priority'), { target: { value: 'high' } });
    fireEvent.click(next());
    expect(within(screen.getByTestId('review')).getByText('Funds not received')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(next());
    });
    expect(openDisputeFor).toHaveBeenCalledWith({
      user_id: 'u-1', transaction_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', category: 'funds_not_received', description: 'Customer called', priority: 'high',
    });
    expect(await screen.findByText('A dispute with dispute ID ND88ENE0 has been created successfully.')).toBeInTheDocument();
  });
});
