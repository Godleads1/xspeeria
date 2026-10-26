/** Fraud Management (ADR-068): the list, what raised an alert, resolving it, raising one by hand. */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FraudCaseScreen, finding } from '../components/screens/FraudCaseScreen';
import { FraudScreen } from '../components/screens/FraudScreen';
import { makeAdminApi, type AdminApi, type FraudAlert, type FraudAlertRow, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(permissions: string[]): Me {
  return {
    id: 's-1', email: 'officer@xspeeria.test', name: 'Officer', role_id: 'r', role: 'compliance_officer', status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions,
  };
}
const OFFICER = me(['fraud_alerts.read', 'fraud_alerts.create', 'fraud_alerts.update', 'users.read']);

const ROW: FraudAlertRow = {
  id: '55555555-2222-3333-4444-555555555555', ref: '#55555555', user_id: 'u-2', customer: 'Musa Bello', customer_email: 'musa@example.com',
  rule: 'disputes_against', severity: 'high', status: 'open', details: { disputes: 3, days: 30 },
  created_at: '2026-10-26T10:00:00Z', resolved_at: null, resolution: null,
};
const ALERT: FraudAlert = {
  ...ROW, customer_status: 'active', customer_phone: '+2348031111111', note: null, resolution_note: null, raised_by: null, resolved_by: null,
};

function mount(who: Me, ui: ReactElement, over: Partial<AdminApi> = {}): AdminApi {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => who),
    listFraudAlerts: vi.fn(async () => ({ total: 1, items: [ROW] })),
    fraudStats: vi.fn(async () => ({ open: 1, in_progress: 0, resolved: 2, high_open: 1 })),
    fraudAlert: vi.fn(async () => ALERT),
    startFraudAlert: vi.fn(async () => undefined),
    resolveFraudAlert: vi.fn(async () => undefined),
    reportFraud: vi.fn(async () => ({ id: 'x', ref: '#AAAA0000' })),
    listCustomers: vi.fn(async () => ({
      total: 1,
      items: [{ id: 'u-9', ref: 'U9', name: 'Ada Obi', email: 'ada@example.com', phone: '+2348030000000', status: 'active' as const, kyc_status: 'approved', created_at: '2026-10-01T00:00:00Z', last_login_at: null }],
    })),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{ui}</SessionProvider>);
  return api;
}

describe('what raised an alert', () => {
  it('says it in plain words, with the last 4 digits at most', () => {
    expect(finding(ALERT)).toBe('3 disputes were raised against this person in the last 30 days.');
    expect(finding({ ...ALERT, rule: 'payout_name_mismatch', details: { bank: 'GTBank', last4: '1234' } })).toContain('ending 1234');
  });
});

describe('fraud list', () => {
  it('shows our real alert types, not Figma samples, with counts', async () => {
    mount(OFFICER, <FraudScreen />);
    await screen.findByText('#55555555');
    expect(within(screen.getByRole('table')).getByText('Many disputes against this person')).toBeInTheDocument();
    expect(screen.getByTestId('fraud-high')).toHaveTextContent('1');
    expect(screen.queryByText(/Card Skimming|Phishing|Synthetic ID/)).toBeNull();
  });

  it('raises an alert by hand for a chosen customer', async () => {
    const api = mount(OFFICER, <FraudScreen />);
    fireEvent.click(await screen.findByTestId('report-fraud'));
    fireEvent.change(screen.getByTestId('fraud-customer-search'), { target: { value: 'ada' } });
    fireEvent.click(await screen.findByTestId('pick-u-9'));
    fireEvent.change(screen.getByTestId('fraud-severity'), { target: { value: 'high' } });
    fireEvent.change(screen.getByTestId('fraud-note'), { target: { value: 'Caller asked for someone else’s code' } });
    fireEvent.click(screen.getByTestId('fraud-report-save'));
    await waitFor(() => expect(api.reportFraud).toHaveBeenCalledWith({ user_id: 'u-9', severity: 'high', note: 'Caller asked for someone else’s code' }));
  });

  it('hides Report without fraud_alerts.create', async () => {
    mount(me(['fraud_alerts.read']), <FraudScreen />);
    await screen.findByText('#55555555');
    expect(screen.queryByTestId('report-fraud')).toBeNull();
  });
});

describe('one alert', () => {
  it('resolves with an outcome and a note', async () => {
    const api = mount(OFFICER, <FraudCaseScreen id={ROW.id} />);
    expect(await screen.findByTestId('finding')).toHaveTextContent('3 disputes');
    fireEvent.click(screen.getByTestId('fraud-resolve'));
    expect(screen.getByTestId('resolution-save')).toBeDisabled();
    fireEvent.click(screen.getByTestId('resolution-false_alarm'));
    fireEvent.change(screen.getByTestId('resolution-note'), { target: { value: 'Slow seller, not fraud' } });
    fireEvent.click(screen.getByTestId('resolution-save'));
    await waitFor(() => expect(api.resolveFraudAlert).toHaveBeenCalledWith(ROW.id, 'false_alarm', 'Slow seller, not fraud'));
  });

  it('read-only staff see no buttons', async () => {
    mount(me(['fraud_alerts.read']), <FraudCaseScreen id={ROW.id} />);
    await screen.findByTestId('finding');
    expect(screen.queryByTestId('fraud-resolve')).toBeNull();
    expect(screen.queryByTestId('fraud-start')).toBeNull();
  });
});
