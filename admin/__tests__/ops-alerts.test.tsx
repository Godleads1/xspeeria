/** Operations alerts for Super Admins (ADR-074): plain words, urgency, acknowledge, resolve. */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WORK_LABEL } from '../components/Notifications';
import { ALERT_REFRESH_MS, OpsAlertsPanel, alertTitle } from '../components/screens/OpsAlertsPanel';
import { makeAdminApi, type AdminApi, type Me, type OpsAlert, type OpsAlertsPage } from '../lib/api';
import { SessionProvider } from '../lib/session';

const ME: Me = {
  id: 's-1', email: 'boss@xspeeria.test', name: 'Boss', role_id: 'r', role: 'super_admin', status: 'active', phone: null,
  has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z',
  permissions: ['monitoring.read', 'monitoring.update'],
};

const alert = (over: Partial<OpsAlert>): OpsAlert => ({
  id: 'a-1', ref: '#A1', rule: 'staff_sign_in_attack', severity: 'P2', status: 'open', subject: 'all staff',
  details: { failures: 12, locked: 1, minutes: 15 }, occurrences: 3,
  first_seen_at: '2026-11-01T10:00:00Z', last_seen_at: '2026-11-01T10:02:00Z', notified_at: null,
  acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by: null, resolution_note: null,
  ...over,
});

const PAGE: OpsAlertsPage = {
  items: [
    alert({ id: 'a-1', rule: 'escrow_stalled', severity: 'P1', subject: 'Escrow processing', details: { warning: 'job_late', value: null } }),
    alert({ id: 'a-2' }),
  ],
  live: { P1: 1, P2: 1, P3: 0, P4: 0 },
};

function mount(me: Me = ME, over: Partial<AdminApi> = {}): AdminApi {
  const a: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => me),
    opsAlerts: vi.fn(async () => PAGE),
    acknowledgeAlert: vi.fn(async () => alert({ status: 'acknowledged' })),
    resolveAlert: vi.fn(async () => alert({ status: 'resolved' })),
    ...over,
  };
  render(<SessionProvider api={a} onSignedOut={() => undefined}><OpsAlertsPanel /></SessionProvider>);
  return a;
}

afterEach(() => vi.useRealTimers());

describe('operations alerts', () => {
  it('lists live alerts in plain words, most urgent first, with how often they fired', async () => {
    mount();
    const list = within(await screen.findByTestId('alerts-list'));
    expect(screen.getByTestId('alerts-live')).toHaveTextContent('(2)');
    expect(list.getByText('Escrow processing has stopped or messages to the bank failed')).toBeInTheDocument();
    expect(list.getByText('12 failed staff sign-ins in 15 minutes')).toBeInTheDocument();
    expect(list.getByText('P1 · Critical')).toBeInTheDocument();
    expect(list.getAllByText(/· 3 times$/)).toHaveLength(2);
  });

  it('acknowledges, and resolves only with a note', async () => {
    const a = mount();
    await screen.findByTestId('alerts-list');
    fireEvent.click(screen.getByTestId('alert-ack-a-2'));
    await waitFor(() => expect(a.acknowledgeAlert).toHaveBeenCalledWith('a-2'));
    fireEvent.click(screen.getByTestId('alert-resolve-a-2'));
    const box = await screen.findByRole('textbox');
    fireEvent.change(box, { target: { value: 'Blocked the address range at the firewall.' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Resolve/ }));
    await waitFor(() => expect(a.resolveAlert).toHaveBeenCalledWith('a-2', 'Blocked the address range at the firewall.'));
  });

  it('shows no buttons without monitoring.update, and nothing without monitoring.read', async () => {
    mount({ ...ME, permissions: ['monitoring.read'] });
    await screen.findByTestId('alerts-list');
    expect(screen.queryByTestId('alert-ack-a-2')).toBeNull();
    expect(screen.queryByTestId('alert-resolve-a-2')).toBeNull();
  });

  it('hides itself from staff without monitoring.read', async () => {
    const a = mount({ ...ME, permissions: ['users.read'] });
    await act(async () => undefined);
    expect(screen.queryByTestId('alerts-list')).toBeNull();
    expect(a.opsAlerts).not.toHaveBeenCalled();
  });

  it('says so when there is nothing, and can show resolved ones', async () => {
    const a = mount(ME, { opsAlerts: vi.fn(async () => ({ items: [], live: { P1: 0, P2: 0, P3: 0, P4: 0 } })) });
    expect(await screen.findByTestId('alerts-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('alerts-show-all'));
    await waitFor(() => expect(a.opsAlerts).toHaveBeenLastCalledWith('all'));
  });

  it('refreshes every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const a = mount();
    await waitFor(() => expect(a.opsAlerts).toHaveBeenCalledTimes(1));
    await act(async () => {
      vi.advanceTimersByTime(ALERT_REFRESH_MS);
    });
    await waitFor(() => expect(a.opsAlerts).toHaveBeenCalledTimes(2));
  });

  it('names every rule, and the bell knows the new kind', () => {
    expect(alertTitle(alert({ rule: 'job_failing', subject: 'Fraud scan', details: {} }))).toBe('The job "Fraud scan" is failing');
    expect(alertTitle(alert({ rule: 'unusual_deal_volume', details: { last_hour: 40, hourly_average: 2.5 } }))).toBe('40 deals in the last hour, against 2.5 an hour usually');
    expect(WORK_LABEL.ops_alert).toBe('New system alert');
  });
});
