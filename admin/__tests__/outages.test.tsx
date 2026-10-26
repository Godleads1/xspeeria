/** Service outage notices (ADR-066): list, report, mark in progress / resolved, Lagos times. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OutagesScreen, isoToLagos, lagosToIso } from '../components/screens/OutagesScreen';
import { makeAdminApi, type AdminApi, type Me, type Outage } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(permissions: string[]): Me {
  return {
    id: 's-1', email: 'ops@xspeeria.test', name: 'Ops', role_id: 'r', role: 'ops_admin', status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions,
  };
}
const OPS = me(['outages.read', 'outages.create', 'outages.update']);

const OPEN: Outage = {
  id: '77777777-2222-3333-4444-555555555555', ref: '#77777777', service: 'GBP payouts',
  message: 'Payouts to UK banks are delayed.', severity: 'high', status: 'open',
  started_at: '2026-10-26T09:00:00Z', expected_end_at: '2026-10-26T13:00:00Z', resolved_at: null,
  duration_seconds: 8100, reported_by: 'Ops', created_at: '2026-10-26T09:00:00Z', updated_at: '2026-10-26T09:00:00Z',
};

function mount(who: Me, over: Partial<AdminApi> = {}): AdminApi {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => who),
    listOutages: vi.fn(async () => ({ now: '2026-10-26T11:15:00Z', total: 1, items: [OPEN] })),
    reportOutage: vi.fn(async () => ({ id: 'x', ref: '#AAAA1111' })),
    changeOutage: vi.fn(async () => undefined),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{(<OutagesScreen />) as ReactElement}</SessionProvider>);
  return api;
}

describe('Lagos times', () => {
  it('turns a typed Lagos time into an ISO time with +01:00 and back', () => {
    expect(lagosToIso('2026-10-26T14:30')).toBe('2026-10-26T14:30:00+01:00');
    expect(lagosToIso('')).toBeUndefined();
    expect(lagosToIso('26/10/2026')).toBeUndefined();
    expect(isoToLagos('2026-10-26T13:30:00Z')).toBe('2026-10-26T14:30');
    expect(isoToLagos(null)).toBe('');
  });
});

describe('outage list', () => {
  it('shows the Figma columns, how long it has lasted, and how many notices the app shows', async () => {
    mount(OPS);
    await screen.findByText('#77777777');
    expect(screen.getByText('GBP payouts')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('2.3 h')).toBeInTheDocument();
    expect(screen.getByTestId('live-count')).toHaveTextContent('1 notice is showing in the app right now.');
  });

  it('reports an outage with the words app users will read', async () => {
    const api = mount(OPS);
    fireEvent.click(await screen.findByTestId('report-outage'));
    expect(screen.getByTestId('outage-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('outage-service'), { target: { value: 'Sign-in' } });
    fireEvent.change(screen.getByTestId('outage-message'), { target: { value: 'Sign-in codes are slow to arrive.' } });
    fireEvent.change(screen.getByTestId('outage-severity'), { target: { value: 'medium' } });
    fireEvent.change(screen.getByTestId('outage-end'), { target: { value: '2026-10-26T18:00' } });
    fireEvent.click(screen.getByTestId('outage-save'));
    await waitFor(() =>
      expect(api.reportOutage).toHaveBeenCalledWith({
        service: 'Sign-in',
        message: 'Sign-in codes are slow to arrive.',
        severity: 'medium',
        expected_end_at: '2026-10-26T18:00:00+01:00',
      }),
    );
  });

  it('marks it resolved from the row menu', async () => {
    const api = mount(OPS);
    fireEvent.click(await screen.findByTestId(`menu-${OPEN.id}`));
    fireEvent.click(screen.getByTestId(`resolve-${OPEN.id}`));
    await waitFor(() => expect(api.changeOutage).toHaveBeenCalledWith(OPEN.id, { status: 'resolved' }));
  });

  it('read-only staff see no buttons', async () => {
    mount(me(['outages.read']));
    await screen.findByText('#77777777');
    expect(screen.queryByTestId('report-outage')).toBeNull();
    expect(screen.queryByTestId(`menu-${OPEN.id}`)).toBeNull();
  });
});
