/** Emergency controls (SEC-039, ADR-075): pause and resume deals, sign everyone out. */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmergencyPanel } from '../components/screens/EmergencyPanel';
import { makeAdminApi, type AdminApi, type DealPauseStatus, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

const BOSS: Me = {
  id: 's-1', email: 'boss@xspeeria.test', name: 'Boss', role_id: 'r', role: 'super_admin', status: 'active', phone: null,
  has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions: ['monitoring.read'],
};
const RUNNING: DealPauseStatus = { paused: false, pause: null };
const PAUSED: DealPauseStatus = {
  paused: true,
  pause: { id: 'p-1', started_at: '2026-11-02T10:00:00Z', started_by: 's-1', reason: 'Bank reported a problem', ended_at: null, ended_by: null, end_reason: null, details: {} },
};

function mount(me: Me = BOSS, over: Partial<AdminApi> = {}): AdminApi {
  const a: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => me),
    dealPauseStatus: vi.fn(async () => RUNNING),
    pauseDeals: vi.fn(async () => PAUSED),
    resumeDeals: vi.fn(async () => RUNNING),
    endSessions: vi.fn(async () => ({ customer_sessions: 12, staff_sessions: 3 })),
    ...over,
  };
  render(<SessionProvider api={a} onSignedOut={() => undefined}><EmergencyPanel /></SessionProvider>);
  return a;
}

async function confirm(reason: string): Promise<void> {
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: reason } });
  const buttons = within(dialog).getAllByRole('button');
  fireEvent.click(buttons[buttons.length - 1]);
}

describe('emergency controls', () => {
  it('pauses all deals with a reason', async () => {
    const a = mount();
    expect(await screen.findByText('Deals are running normally')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pause-deals'));
    await confirm('Bank reported a problem');
    await waitFor(() => expect(a.pauseDeals).toHaveBeenCalledWith('Bank reported a problem'));
    expect(await screen.findByTestId('emergency-done')).toHaveTextContent('All deals are paused.');
  });

  it('shows who paused and why, and resumes', async () => {
    const a = mount(BOSS, { dealPauseStatus: vi.fn(async () => PAUSED) });
    expect(await screen.findByText('All deals are paused')).toBeInTheDocument();
    expect(screen.getByTestId('deals-state')).toHaveTextContent('Reason: Bank reported a problem');
    fireEvent.click(screen.getByTestId('resume-deals'));
    await confirm('Bank confirmed it is fixed');
    await waitFor(() => expect(a.resumeDeals).toHaveBeenCalledWith('Bank confirmed it is fixed'));
  });

  it('signs out the chosen group', async () => {
    const a = mount();
    await screen.findByText('Deals are running normally');
    fireEvent.change(screen.getByTestId('sessions-who'), { target: { value: 'everyone' } });
    fireEvent.click(screen.getByTestId('end-sessions'));
    await confirm('Suspected stolen session tokens');
    await waitFor(() => expect(a.endSessions).toHaveBeenCalledWith('everyone', 'Suspected stolen session tokens'));
    expect(await screen.findByTestId('emergency-done')).toHaveTextContent('Signed out 12 customer sessions and 3 staff sessions.');
  });

  it('is not shown to anyone but a Super Admin', async () => {
    const a = mount({ ...BOSS, role: 'operations_admin' });
    await waitFor(() => expect(a.me).toHaveBeenCalled());
    expect(screen.queryByTestId('pause-deals')).toBeNull();
    expect(a.dealPauseStatus).not.toHaveBeenCalled();
  });
});
