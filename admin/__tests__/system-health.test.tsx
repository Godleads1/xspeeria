/** System Health (ADR-072): status, warnings in words, every API, jobs, Super Admin only. */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NAV_ITEMS } from '../fixtures';
import { REFRESH_MS, SystemHealthScreen, warningText } from '../components/screens/SystemHealthScreen';
import { makeAdminApi, type AdminApi, type Me, type SystemHealth } from '../lib/api';
import { SessionProvider } from '../lib/session';

const ME: Me = {
  id: 's-1', email: 'boss@xspeeria.test', name: 'Boss', role_id: 'r', role: 'super_admin', status: 'active', phone: null,
  has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions: ['monitoring.read'],
};

const api = (name: string, method = 'GET', extra: Partial<SystemHealth['apis']['own'][number]> = {}) => ({
  name, method, calls: 40, client_errors: 2, server_errors: 0, network_errors: 0, error_rate: 0, avg_ms: 85, max_ms: 410, slow_calls: 0,
  last_call_at: '2026-10-27T14:00:00Z', ...extra,
});

const HEALTH: SystemHealth = {
  now: '2026-10-27T14:05:00Z', window: '1h', status: 'problem', environment: 'local', api_version: 'v1',
  server_started_at: '2026-10-27T12:05:00Z', database: { ok: true, ping_ms: 1.4 },
  totals: { calls: 120, errors: 3, error_rate: 0.025, avg_ms: 92 },
  series: [{ at: '2026-10-27T13:05:00Z', calls: 60, errors: 1, avg_ms: 90 }, { at: '2026-10-27T13:10:00Z', calls: 60, errors: 2, avg_ms: 94 }],
  apis: {
    own: [api('/api/v1/marketplace/listings'), api('/api/v1/auth/login', 'POST', { server_errors: 3, error_rate: 0.075 })],
    webhook: [api('/api/v1/webhooks/didit', 'POST', { calls: 4 })],
    outside: [api('Didit identity check: /v3/session/', 'POST', { network_errors: 2, error_rate: 0.05 }), api('Pretend bank: open escrow', 'CALL')],
  },
  jobs: [
    { name: 'Escrow processing', every_seconds: 5, runs: 700, failures: 0, last_started_at: null, last_ok_at: '2026-10-27T14:04:58Z', last_failed_at: null, last_error: null, last_duration_ms: 12, state: 'ok' },
    { name: 'Fraud scan', every_seconds: 30, runs: 100, failures: 1, last_started_at: null, last_ok_at: null, last_failed_at: '2026-10-27T14:04:00Z', last_error: 'TimeoutError', last_duration_ms: 3000, state: 'failing' },
  ],
  queues: { escrow_messages_waiting: 1, escrow_messages_failed: 0, bank_events_waiting: 0, reconciliation_open: 2 },
  warnings: [
    { level: 'red', code: 'outside_failing', name: 'Didit identity check: /v3/session/', value: 2 },
    { level: 'red', code: 'job_failed', name: 'Fraud scan', value: 'TimeoutError' },
    { level: 'amber', code: 'reconciliation_open', name: null, value: 2 },
  ],
};

function mount(over: Partial<AdminApi> = {}): AdminApi {
  const a: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => ME),
    systemHealth: vi.fn(async () => HEALTH),
    opsAlerts: vi.fn(async () => ({ items: [], live: { P1: 0, P2: 0, P3: 0, P4: 0 } })),
    dealPauseStatus: vi.fn(async () => ({ paused: false, pause: null })),
    ...over,
  };
  render(<SessionProvider api={a} onSignedOut={() => undefined}><SystemHealthScreen /></SessionProvider>);
  return a;
}

afterEach(() => vi.useRealTimers());

describe('System Health', () => {
  it('shows the status, warnings in plain words, totals and every kind of API', async () => {
    mount();
    const status = await screen.findByTestId('health-status');
    expect(status).toHaveTextContent('Something is not working');
    const warnings = within(screen.getByTestId('health-warnings'));
    expect(warnings.getByText('Didit identity check: /v3/session/ failed 2 times')).toBeInTheDocument();
    expect(warnings.getByText('The job "Fraud scan" failed last time (TimeoutError)')).toBeInTheDocument();
    expect(warnings.getByText('2 bank records don’t match ours and wait for a person')).toBeInTheDocument();
    expect(screen.getByTestId('health-calls')).toHaveTextContent('120');
    expect(screen.getByTestId('health-errors')).toHaveTextContent('2.5% of calls');
    expect(screen.getByTestId('health-uptime')).toHaveTextContent('2 h');
    expect(screen.getByText('/api/v1/marketplace/listings')).toBeInTheDocument();
    expect(screen.getByText('/api/v1/webhooks/didit')).toBeInTheDocument(); // webhooks we receive
    expect(screen.getByText('Didit identity check')).toBeInTheDocument(); // outside services
    expect(screen.getByText('Pretend bank')).toBeInTheDocument();
    expect(screen.getByText('Failing')).toBeInTheDocument();
    expect(screen.getByTestId('queue-recon')).toHaveTextContent('2');
  });

  it('filters the API list and switches the period', async () => {
    const a = mount();
    await screen.findByTestId('health-status');
    fireEvent.change(screen.getByTestId('health-search'), { target: { value: 'login' } });
    expect(screen.queryByText('/api/v1/marketplace/listings')).toBeNull();
    expect(screen.getByText('/api/v1/auth/login')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('window-7d'));
    await waitFor(() => expect(a.systemHealth).toHaveBeenLastCalledWith('7d'));
  });

  it('refreshes by itself every 30 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const a = mount();
    await waitFor(() => expect(a.systemHealth).toHaveBeenCalledTimes(1));
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_MS);
    });
    await waitFor(() => expect(a.systemHealth).toHaveBeenCalledTimes(2));
  });

  it('is in the menu for those with monitoring.read only', () => {
    const item = NAV_ITEMS.find((i) => i.href === '/system-health');
    expect(item?.permission).toBe('monitoring.read');
  });

  it('formats every warning kind', () => {
    expect(warningText({ level: 'red', code: 'server_errors', name: 'POST /api/v1/auth/login', value: 0.075 })).toBe('POST /api/v1/auth/login: 7.5% of calls failed');
    expect(warningText({ level: 'amber', code: 'database_slow', name: null, value: 250 })).toBe('The database is slow to answer (250 ms)');
  });
});
