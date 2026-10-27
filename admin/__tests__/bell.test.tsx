/** Staff bell (ADR-070): live count, list with links, opening clears the count, 401 signs out. */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationBell, POLL_MS, type BellSource } from '../components/Notifications';
import { AdminApiError, type StaffWorkFeed } from '../lib/api';

const FEED: StaffWorkFeed = {
  total: 2,
  new: 1,
  seen_at: '2026-10-27T08:00:00Z',
  items: [
    { kind: 'reversal', id: '11111111-0000-0000-0000-000000000001', ref: 'RVL-11111111', at: '2026-10-27T09:00:00Z', detail: null, new: true },
    { kind: 'fraud', id: '22222222-0000-0000-0000-000000000002', ref: '#22222222', at: '2026-10-27T07:00:00Z', detail: 'high', new: false },
  ],
};

function source(over: Partial<BellSource> = {}): BellSource {
  return { load: vi.fn(async () => FEED), seen: vi.fn(async () => undefined), onSignedOut: vi.fn(), ...over };
}

afterEach(() => vi.useRealTimers());

describe('staff bell', () => {
  it('shows the new count, lists the work with links, and opening clears the count', async () => {
    const s = source();
    render(<NotificationBell source={s} />);
    const bell = screen.getByTestId('bell');
    await waitFor(() => expect(bell).toHaveAccessibleName('Notifications (1 new)'));
    expect(screen.getByTestId('bell-count')).toHaveTextContent('1');

    fireEvent.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Notification' });
    const refund = within(panel).getByTestId(`work-reversal-${FEED.items[0].id}`);
    expect(refund).toHaveTextContent('Refund waiting for your approval');
    expect(refund).toHaveTextContent('RVL-11111111');
    expect(refund).toHaveAttribute('href', `/reversals/case?id=${FEED.items[0].id}`);
    expect(within(refund).getByRole('img', { name: 'New' })).toBeInTheDocument();
    const alert = within(panel).getByTestId(`work-fraud-${FEED.items[1].id}`);
    expect(alert).toHaveTextContent('New fraud alert · High');
    expect(alert).toHaveAttribute('href', `/fraud/case?id=${FEED.items[1].id}`);
    expect(within(alert).queryByRole('img', { name: 'New' })).toBeNull();

    await waitFor(() => expect(s.seen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('bell-count')).toBeNull());
  });

  it('shows the empty state when nothing is waiting, and does not mark seen', async () => {
    const s = source({ load: vi.fn(async () => ({ items: [], total: 0, new: 0, seen_at: null })) });
    render(<NotificationBell source={s} />);
    await waitFor(() => expect(s.load).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('bell'));
    expect(screen.getByText('No notification')).toBeInTheDocument();
    expect(s.seen).not.toHaveBeenCalled();
  });

  it('says when only the newest are listed', async () => {
    render(<NotificationBell source={source({ load: vi.fn(async () => ({ ...FEED, total: 75 })) })} />);
    await waitFor(() => expect(screen.getByTestId('bell-count')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bell'));
    expect(screen.getByText('Showing the newest 2 of 75')).toBeInTheDocument();
  });

  it('checks again every minute', async () => {
    vi.useFakeTimers();
    const s = source();
    render(<NotificationBell source={s} />);
    await act(async () => undefined);
    expect(s.load).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(s.load).toHaveBeenCalledTimes(2);
  });

  it('goes back to log-in when the session has ended', async () => {
    const s = source({ load: vi.fn(async () => Promise.reject(new AdminApiError('AUTH_401', 401, 'Signed out'))) });
    render(<NotificationBell source={s} />);
    await waitFor(() => expect(s.onSignedOut).toHaveBeenCalled());
    expect(screen.queryByTestId('bell-count')).toBeNull();
  });

  it('keeps quiet on other errors', async () => {
    const s = source({ load: vi.fn(async () => Promise.reject(new Error('network'))) });
    render(<NotificationBell source={s} />);
    await waitFor(() => expect(s.load).toHaveBeenCalled());
    expect(s.onSignedOut).not.toHaveBeenCalled();
    expect(screen.getByTestId('bell')).toHaveAccessibleName('Notifications');
  });
});
