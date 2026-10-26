import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardScreen, bucketKeys, csvCell, dashboardCsv } from '../components/screens/DashboardScreen';
import { makeAdminApi, type AdminApi, type Dashboard, type Me } from '../lib/api';
import { change, duration, money, moneyChange, share } from '../lib/figures';
import { SessionProvider } from '../lib/session';

const ME: Me = {
  id: 's-1',
  email: 'boss@xspeeria.test',
  name: 'The Boss',
  role_id: 'r',
  role: 'super_admin',
  status: 'active',
  phone: null,
  has_photo: false,
  password_set: true,
  last_login_at: null,
  created_at: '2026-10-01T00:00:00Z',
  permissions: ['dashboard.read'],
};

function data(over: Partial<Dashboard> = {}): Dashboard {
  return {
    period: { kind: 'month', start: '2026-09-30T23:00:00Z', end: '2026-10-03T12:00:00Z', bucket: 'day' },
    overview: {
      active_users: { value: 120, previous: 100 },
      new_users: { value: 9, previous: 10 },
      trades_started: { value: 4, previous: 0 },
      trades_completed: { value: 3, previous: 2 },
      value: [
        { currency: 'NGN', scale: 2, minor: '9007199254740993', previous_minor: '100' },
        { currency: 'USD', scale: 2, minor: '20000', previous_minor: '0' },
      ],
      fees: [{ currency: 'NGN', scale: 2, minor: '264100', previous_minor: '0' }],
      avg_settlement_seconds: 138,
      open_disputes: 2,
      kyc_waiting: 5,
    },
    customers: {
      growth: [{ at: '2026-10-02T00:00:00', signed_up: 7, not_verified: 2 }],
      active_customers: 200,
      inactive_30_days: 50,
    },
    transactions: { completed: 979, failed: 21, speed: { lt_1m: 3, '1_5m': 1, '5_10m': 0, '10_60m': 0, gt_60m: 0 } },
    revenue: {
      fees_by_time: [{ at: '2026-10-02T00:00:00', currency: 'NGN', scale: 2, minor: '264100' }],
      waiting_in_escrow: [{ currency: 'USD', scale: 2, minor: '20000', legs: 1 }],
    },
    corridors: [{ pair: ['NGN', 'USD'], trades: 4, previous_trades: 2, average_rate: '1320.5000' }],
    operations: {
      disputes_opened: { value: 1, previous: 0 },
      disputes_resolved: { value: 0, previous: 0 },
      mean_seconds_to_resolve: null,
      reconciliation_open: 0,
      open_offers_paying_naira: 6,
      open_offers_paying_foreign: 4,
    },
    ...over,
  };
}

async function show(dashboard = vi.fn(async () => data())): Promise<AdminApi> {
  const api: AdminApi = { ...makeAdminApi(vi.fn()), me: vi.fn(async () => ME), dashboard };
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{(<DashboardScreen />) as ReactElement}</SessionProvider>);
  await screen.findByTestId('tile-active');
  return api;
}

describe('figures', () => {
  it('formats money exactly from minor units, past what a float can hold', () => {
    expect(money({ currency: 'NGN', scale: 2, minor: '9007199254740993' })).toBe('₦90,071,992,547,409.93');
    expect(money({ currency: 'USD', scale: 2, minor: '5' })).toBe('$0.05');
    expect(money({ currency: 'XOF', scale: 0, minor: '1500' })).toBe('1,500 XOF');
    expect(() => money({ currency: 'NGN', scale: 2, minor: '1.5' })).toThrow();
  });

  it('works out change and shares from whole numbers', () => {
    expect(change(120, 100)).toEqual({ pct: '20.0%', up: true });
    expect(change(9, 10)).toEqual({ pct: '10.0%', up: false });
    expect(change(4, 0)).toBeNull();
    expect(moneyChange({ currency: 'NGN', scale: 2, minor: '150', previous_minor: '100' })).toEqual({ pct: '50.0%', up: true });
    expect(share(979, 1000)).toBe('97.9%');
    expect(share(1, 0)).toBeNull();
    expect(duration(138)).toBe('2.3 min');
    expect(duration(null)).toBeNull();
  });

  it('makes one bucket per Lagos day of the period', () => {
    expect(bucketKeys('2026-09-30T23:00:00Z', '2026-10-03T12:00:00Z', 'day')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(bucketKeys('2025-12-31T23:00:00Z', '2026-03-10T00:00:00Z', 'month')).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('exports CSV that a spreadsheet cannot run as a formula', () => {
    const csv = dashboardCsv(data());
    expect(csv).toContain('"Active Users","120","100"');
    expect(csv).toContain('"Transaction Value NGN","₦90,071,992,547,409.93","₦1.00"');
    for (const bad of ['=SUM(A1)', '+1', '-1', '@x']) expect(csvCell(bad)).toBe(`"'${bad}"`);
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('analytics dashboard', () => {
  it('shows real figures with change against the period before', async () => {
    await show();
    expect(within(screen.getByTestId('tile-active')).getByText('120')).toBeInTheDocument();
    expect(within(screen.getByTestId('tile-active')).getByText('20.0%')).toBeInTheDocument();
    expect(within(screen.getByTestId('tile-trades')).getByText('Nothing to compare with yet')).toBeInTheDocument();
    expect(within(screen.getByTestId('tile-value')).getByText('$200.00')).toBeInTheDocument();
    expect(within(screen.getByTestId('tile-speed')).getByText('2.3 min')).toBeInTheDocument();
  });

  it('has no Cards or Adverts tab and no sample-only tiles', async () => {
    await show();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Overview', 'Customers', 'Transactions', 'Revenue', 'Corridors', 'Operations']);
    expect(screen.queryByText(/NPS|Net Promoter|Uptime|Cost per Acquisition|Card/i)).toBeNull();
  });

  it('shows escrow as a record, not revenue', async () => {
    await show();
    fireEvent.click(screen.getByTestId('dash-tab-revenue'));
    expect(screen.getByTestId('escrow-USD')).toHaveTextContent('$200.00');
    expect(screen.getByText(/not Xspeeria’s money and not revenue/)).toBeInTheDocument();
    expect(screen.queryByText(/return/i)).toBeNull();
  });

  it('asks the server again for another period and month', async () => {
    const dashboard = vi.fn(async () => data());
    await show(dashboard);
    expect(dashboard).toHaveBeenLastCalledWith('month', undefined);
    fireEvent.change(screen.getByTestId('period'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByTestId('month'), { target: { value: '2026-02' } });
    await screen.findByTestId('tile-active');
    expect(dashboard).toHaveBeenLastCalledWith('custom', '2026-02');
  });

  it('shows the other tabs from the same figures', async () => {
    await show();
    fireEvent.click(screen.getByTestId('dash-tab-transactions'));
    expect(screen.getByTestId('success-rate')).toHaveTextContent('97.9%');
    fireEvent.click(screen.getByTestId('dash-tab-corridors'));
    expect(within(screen.getByTestId('corridors')).getByText('1320.5000')).toBeInTheDocument();
    expect(within(screen.getByTestId('corridors')).getByText('+100.0%')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dash-tab-customers'));
    expect(screen.getByTestId('growth-chart')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dash-tab-operations'));
    expect(screen.getByTestId('offers-naira')).toHaveTextContent('6');
  });
});
