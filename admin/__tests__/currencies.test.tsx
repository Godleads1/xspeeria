/** ADR-106: Settings → Currencies — a Super Admin switches built-in currencies on and off. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CurrenciesScreen } from '../components/screens/CurrenciesScreen';
import { makeAdminApi, type AdminApi, type CurrencySwitchRow, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(role: string): Me {
  return {
    id: 's-1', email: 'x@xspeeria.test', name: 'Ada', role_id: 'r', role, status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions: [],
  };
}

const ROWS: CurrencySwitchRow[] = [
  { currency: 'NGN', enabled: true, locked: 'naira', reason: null, changed_at: null },
  { currency: 'CNY', enabled: false, locked: 'china', reason: null, changed_at: null },
  { currency: 'EUR', enabled: true, locked: null, reason: null, changed_at: null },
];

function mount(role: string, over: Partial<AdminApi> = {}): AdminApi {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => me(role)),
    currencies: vi.fn(async () => ROWS),
    switchCurrency: vi.fn(async (c: string, enabled: boolean) => ({ currency: c, enabled })),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}><CurrenciesScreen /></SessionProvider>);
  return api;
}

describe('Currencies (ADR-106)', () => {
  it('a Super Admin switches the euro off with a reason', async () => {
    const api = mount('super_admin');
    fireEvent.click(await screen.findByTestId('switch-EUR'));
    expect(within(screen.getByTestId('reason-dialog')).getByText(/Deals already matched finish/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'Partner bank paused euro payments' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    await waitFor(() => expect(api.switchCurrency).toHaveBeenCalledWith('EUR', false, 'Partner bank paused euro payments'));
    expect(await screen.findByText('EUR is off.')).toBeInTheDocument();
  });

  it('naira has no switch, and the yuan waits for legal clearance', async () => {
    mount('super_admin');
    expect(await screen.findByText('Always on: every deal has a naira side.')).toBeInTheDocument();
    expect(screen.queryByTestId('switch-NGN')).toBeNull();
    expect(screen.queryByTestId('switch-CNY')).toBeNull();
    expect(screen.getByText('Waiting for legal clearance')).toBeInTheDocument();
  });

  it('other staff see the list without switches', async () => {
    mount('compliance_officer');
    expect((await screen.findAllByText('Never changed')).length).toBe(2);
    expect(screen.queryByTestId('switch-EUR')).toBeNull();
  });
});
