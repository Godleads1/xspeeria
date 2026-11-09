import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { UsersScreen } from '../components/screens/UsersScreen';
import { AdminApiError, makeAdminApi, type AdminApi, type Customer, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(role: string, permissions: string[]): Me {
  return {
    id: 's-1', email: 'x@xspeeria.test', name: 'Staff One', role_id: 'r', role, status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions,
  };
}

const ADA: Customer = {
  id: 'u-1', ref: '3F2A9C1B', name: 'Ada Obi', email: 'ada@example.com', phone: '+2348031111111', status: 'active',
  kyc_status: 'approved', created_at: '2026-10-01T00:00:00Z', last_login_at: '2026-10-20T09:00:00Z',
};
const EVE: Customer = { ...ADA, id: 'u-2', ref: '77AA0011', name: null, email: 'eve@example.com', status: 'suspended' };

async function show(who: Me, over: Partial<AdminApi> = {}): Promise<AdminApi> {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => who),
    listCustomers: vi.fn(async () => ({ total: 2, items: [ADA, EVE] })),
    customerStats: vi.fn(async () => ({ total: 2, active_30_days: 1, inactive_30_days: 0, suspended: 1, kyc_waiting: 3 })),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{(<UsersScreen />) as ReactElement}</SessionProvider>);
  await screen.findByText('Ada Obi');
  return api;
}

describe('users', () => {
  it('shows the counts and the list; no name before an approved identity check', async () => {
    await show(me('support_agent', ['users.read']));
    expect(screen.getByTestId('users-kyc')).toHaveTextContent('3');
    expect(screen.getByTestId('users-total')).toHaveTextContent('1 suspended');
    const rows = screen.getAllByRole('row');
    expect(within(rows[2]!).getByText('—')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Suspended')).toBeInTheDocument();
  });

  it('shows no actions to staff who are not Super Admin', async () => {
    await show(me('compliance_officer', ['users.read', 'users.update']));
    expect(screen.queryByTestId('menu-u-1')).toBeNull();
  });

  it('offers "View activity" to the Super Admin (activity.read) only', async () => {
    const go = vi.fn();
    const real = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...real, assign: go } });
    try {
      await show(me('super_admin', ['users.read', 'activity.read']));
      fireEvent.click(screen.getByTestId('menu-u-1'));
      fireEvent.click(screen.getByTestId('activity-u-1'));
      expect(go).toHaveBeenCalledWith('/users/activity?id=u-1');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: real });
    }
  });

  it('asks the server with the search and status', async () => {
    const api = await show(me('support_agent', ['users.read']));
    fireEvent.change(screen.getByTestId('users-search'), { target: { value: 'ada' } });
    await waitFor(() => expect(api.listCustomers).toHaveBeenLastCalledWith({ search: 'ada', status: undefined, offset: 0, limit: 50 }));
    fireEvent.change(screen.getByTestId('users-status'), { target: { value: 'suspended' } });
    await waitFor(() => expect(api.listCustomers).toHaveBeenLastCalledWith({ search: 'ada', status: 'suspended', offset: 0, limit: 50 }));
  });

  it('suspends with a reason, and shows a server refusal', async () => {
    const changeCustomer = vi.fn(async () => ({ id: 'u-1', status: 'suspended' as const }));
    await show(me('super_admin', ['users.read']), { changeCustomer });
    fireEvent.click(screen.getByTestId('menu-u-1'));
    fireEvent.click(screen.getByTestId('suspend-u-1'));
    const dialog = screen.getByTestId('reason-dialog');
    expect(within(dialog).getByText(/Deals already under way keep settling/)).toBeInTheDocument();
    // Too short: the button stays off.
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'no' } });
    expect(screen.getByTestId('reason-confirm')).toBeDisabled();
    fireEvent.change(screen.getByTestId('reason'), { target: { value: '  Fraud   check pending ' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    expect(await screen.findByText('Ada Obi is suspended and was logged out.')).toBeInTheDocument();
    expect(changeCustomer).toHaveBeenCalledWith('u-1', 'suspend', 'Fraud check pending');

    changeCustomer.mockRejectedValueOnce(new AdminApiError('RES_409_INVALID_STATE', 409, 'This customer\'s account can\'t be changed that way now.'));
    fireEvent.click(screen.getByTestId('menu-u-2'));
    fireEvent.click(screen.getByTestId('reactivate-u-2'));
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'Checked, all fine' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    expect(await within(screen.getByTestId('reason-dialog')).findByRole('alert')).toHaveTextContent(/can't be changed/);
  });

  // ADR-104: Compliance asks for a new identity check at the next new-phone log-in.
  it('Compliance asks for a new identity check, and can cancel it', async () => {
    const requestIdentityRedo = vi.fn(async () => ({ id: 'u-1' }));
    const cancelIdentityRedo = vi.fn(async () => ({ id: 'u-1' }));
    const asked = { ...ADA, identity_redo_requested_at: '2026-11-09T10:00:00Z' };
    const listCustomers = vi
      .fn()
      .mockResolvedValueOnce({ total: 2, items: [ADA, EVE] })
      .mockResolvedValue({ total: 2, items: [asked, EVE] });
    await show(me('compliance_officer', ['users.read', 'kyc.update']), { requestIdentityRedo, cancelIdentityRedo, listCustomers });
    // Only a customer with an approved identity check can be asked; no Super Admin actions.
    fireEvent.click(screen.getByTestId('menu-u-1'));
    expect(screen.queryByTestId('suspend-u-1')).toBeNull();
    fireEvent.click(screen.getByTestId('redo-u-1'));
    expect(within(screen.getByTestId('reason-dialog')).getByText(/a different one waits for two of you/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'Face check fails, customer called' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    expect(await screen.findByText(/will take a new identity check/)).toBeInTheDocument();
    expect(requestIdentityRedo).toHaveBeenCalledWith('u-1', 'Face check fails, customer called');
    expect(await screen.findByText('New identity check asked')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('menu-u-1'));
    fireEvent.click(screen.getByTestId('redo-cancel-u-1'));
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'Customer passed the face check' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    await waitFor(() => expect(cancelIdentityRedo).toHaveBeenCalledWith('u-1', 'Customer passed the face check'));
  });

  it('staff without kyc.update are not offered it', async () => {
    await show(me('super_admin', ['users.read']));
    fireEvent.click(screen.getByTestId('menu-u-1'));
    expect(screen.queryByTestId('redo-u-1')).toBeNull();
  });

  // ADR-095 / DEC-106: an account the customer is deleting; its details are for Compliance only.
  it('labels a deleted account and shows no details to staff outside Compliance', async () => {
    const GONE: Customer = {
      ...ADA, id: 'u-3', ref: 'DEAD0001', name: null, email: null, phone: null, kyc_status: null, status: 'closed',
      deletion: { state: 'deleting', requested_at: '2026-11-03T10:00:00Z', restore_until: '2026-11-17T10:00:00Z' },
    };
    await show(me('super_admin', ['users.read', 'activity.read']), {
      listCustomers: vi.fn(async () => ({ total: 2, items: [ADA, GONE] })),
    });
    const row = screen.getAllByRole('row')[2]!;
    expect(within(row).getByText('Deleted account')).toBeInTheDocument();
    expect(within(row).getByText(/Deleting, restorable until/)).toBeInTheDocument();
    // No "View activity" for it (the server refuses it too); a closed account has no other action.
    expect(within(row).queryByTestId('menu-u-3')).toBeNull();
    expect(screen.queryByTestId('activity-u-3')).toBeNull();
  });
});
