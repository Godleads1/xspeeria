/**
 * ADR-044 N-2: notification centre, bell badge and in-app banner. The server is a fake
 * `NotificationSource`; what gets recorded is tested on the server.
 */
import type { ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { NotificationPage, ServerNotification } from '../src/api/notificationsApi';
import { BannerHost, hideBanner, showBanner } from '../src/components/Banner';
import { NotificationBadge } from '../src/components/NotificationBadge';
import { notificationCopy } from '../src/features/notifications/notificationCopy';
import { groupOf, NotificationsScreen } from '../src/features/notifications/NotificationsScreen';
import type { NotificationSource } from '../src/features/notifications/serverNotifications';
import { refreshUnread, resetUnread, useUnreadCount } from '../src/features/notifications/unread';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const MATCH = '0b6d1f3e-8a2c-4d5e-9f10-112233445566';
const NOW = new Date('2026-10-19T15:00:00');

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

const n = (over: Partial<ServerNotification> = {}): ServerNotification => ({
  notification_id: over.notification_id ?? 'n1',
  type: 'kyc_status',
  event: 'kyc.approved',
  data: { kyc_case_id: 'k1', country: 'NG' },
  created_at: '2026-10-19T14:30:00',
  read: false,
  ...over,
});

const page = (items: ServerNotification[], over: Partial<NotificationPage> = {}): NotificationPage => ({
  items,
  unread_count: items.filter((i) => !i.read).length,
  next_before: null,
  ...over,
});

function fake(...pages: NotificationPage[]): jest.Mocked<NotificationSource> {
  const list = jest.fn(async () => pages.shift() ?? page([]));
  return { list, mark: jest.fn(async (id: string, read: boolean) => n({ notification_id: id, read })) };
}

const EVENTS = [
  'kyc.approved',
  'kyc.rejected',
  'kyc.in_review',
  'kyc.expired',
  'match.created',
  'settlement.awaiting_funding',
  'settlement.releasing',
  'settlement.completed',
  'settlement.cancelled',
  'settlement.unwinding',
  'settlement.refunded',
];

describe('notification words', () => {
  it('has a title, words and a safe link for every event', () => {
    for (const event of EVENTS) {
      const c = notificationCopy({ event, data: { match_id: MATCH, kyc_case_id: 'k', country: 'GB' } });
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
      expect(`${c.title} ${c.body}`).not.toMatch(/wallet|balance|sanction/i);
      expect(c.link).toMatch(/^\/(profile\/kyc|market\/deals|market\/escrow\?match=[0-9a-f-]{36})$/);
    }
    expect(notificationCopy({ event: 'kyc.approved', data: { country: 'GB' } }).body).toContain('the United Kingdom');
  });

  it('never builds a link from an unsafe id, and shows something for unknown events', () => {
    expect(notificationCopy({ event: 'settlement.completed', data: { match_id: '../../x' } }).link).toBeNull();
    const unknown = notificationCopy({ event: 'something.new', data: {} });
    expect(unknown.title).toBe('Update');
    expect(unknown.link).toBeNull();
  });

  it('shows the pay-in deadline as a time', () => {
    const c = notificationCopy({
      event: 'settlement.awaiting_funding',
      data: { match_id: MATCH, deadline: '2026-10-19T14:35:00' },
    });
    expect(c.body).toBe('Pay into escrow by 14:35 to complete your deal.');
  });

  it('groups by Today / This week / Earlier', () => {
    expect(groupOf('2026-10-19T00:01:00', NOW)).toBe('Today');
    expect(groupOf('2026-10-14T09:00:00', NOW)).toBe('This week');
    expect(groupOf('2026-10-01T09:00:00', NOW)).toBe('Earlier');
  });
});

describe('Notification centre', () => {
  it('lists newest first in groups, unread marked for screen readers', async () => {
    const src = fake(
      page([
        n({ notification_id: 'a', event: 'settlement.completed', data: { match_id: MATCH } }),
        n({ notification_id: 'b', read: true, created_at: '2026-10-10T09:00:00' }),
      ]),
    );
    await render(<NotificationsScreen source={src} onBack={jest.fn()} onOpen={jest.fn()} now={() => NOW} />);
    await flush();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Earlier')).toBeTruthy();
    expect(screen.getByTestId('notification-a').props.accessibilityLabel).toMatch(/^Unread: Deal complete/);
    expect(screen.getByTestId('notification-b').props.accessibilityLabel).toMatch(/^Identity verified/);
    expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(1);
  });

  it('opening one marks it read and goes to its screen', async () => {
    const onOpen = jest.fn();
    const src = fake(page([n({ notification_id: 'a', event: 'settlement.releasing', data: { match_id: MATCH } })]));
    await render(<NotificationsScreen source={src} onBack={jest.fn()} onOpen={onOpen} now={() => NOW} />);
    await flush();
    await fireEvent.press(screen.getByTestId('notification-a'));
    await flush();
    expect(src.mark).toHaveBeenCalledWith('a', true);
    expect(onOpen).toHaveBeenCalledWith(`/market/escrow?match=${MATCH}`);
    expect(screen.queryByTestId('notification-unread-dot')).toBeNull();
  });

  it('shows it unread again if marking fails', async () => {
    const src = fake(page([n({ notification_id: 'a' })]));
    src.mark.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'x'));
    await render(<NotificationsScreen source={src} onBack={jest.fn()} onOpen={jest.fn()} now={() => NOW} />);
    await flush();
    await fireEvent.press(screen.getByTestId('notification-a'));
    await flush();
    expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(1);
  });

  it('says when there is nothing', async () => {
    await render(<NotificationsScreen source={fake(page([]))} onBack={jest.fn()} onOpen={jest.fn()} now={() => NOW} />);
    await flush();
    expect(screen.getByTestId('notifications-empty')).toHaveTextContent(/You’re all caught up/);
  });

  it('offers a retry when loading fails', async () => {
    const src = fake(page([n()]));
    src.list.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'Can’t reach Xspeeria.'));
    await render(<NotificationsScreen source={src} onBack={jest.fn()} onOpen={jest.fn()} now={() => NOW} />);
    await flush();
    await fireEvent.press(screen.getByTestId('error-retry'));
    await flush();
    expect(screen.getByTestId('notification-n1')).toBeTruthy();
  });

  it('loads more at the end of the list', async () => {
    const src = fake(
      page([n({ notification_id: 'a' })], { next_before: 'a' }),
      page([n({ notification_id: 'b', created_at: '2026-10-19T10:00:00' })]),
    );
    await render(<NotificationsScreen source={src} onBack={jest.fn()} onOpen={jest.fn()} now={() => NOW} />);
    await flush();
    await fireEvent(screen.getByTestId('notifications-list'), 'onEndReached');
    await flush();
    expect(src.list).toHaveBeenLastCalledWith('a');
    expect(screen.getByTestId('notification-b')).toBeTruthy();
  });
});

describe('bell badge', () => {
  it('is hidden at zero and caps at 9+', async () => {
    const { rerender } = await render(<NotificationBadge count={0} />);
    expect(screen.queryByTestId('notification-badge')).toBeNull();
    await rerender(<NotificationBadge count={3} />);
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('3');
    await rerender(<NotificationBadge count={12} />);
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('9+');
  });
});

describe('in-app banner', () => {
  afterEach(async () => {
    await act(async () => hideBanner());
  });

  it('shows the Figma message and closes', async () => {
    await render(<BannerHost />);
    await act(async () => showBanner({ tone: 'error', title: 'Incorrect Password', message: 'You entered an incorrect password' }));
    expect(screen.getByTestId('banner-title')).toHaveTextContent('Incorrect Password');
    expect(screen.getByTestId('banner-message')).toHaveTextContent('You entered an incorrect password');
    await fireEvent.press(screen.getByTestId('banner-close'));
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('goes away by itself and can open something', async () => {
    jest.useFakeTimers();
    try {
      const onPress = jest.fn();
      await render(<BannerHost />);
      await act(async () => showBanner({ tone: 'success', title: 'Deal complete', onPress }));
      await fireEvent.press(screen.getByTestId('banner-open'));
      expect(onPress).toHaveBeenCalled();
      expect(screen.queryByTestId('banner')).toBeNull();
      await act(async () => showBanner({ tone: 'info', title: 'Hello' }));
      await act(async () => {
        jest.advanceTimersByTime(5_000);
      });
      expect(screen.queryByTestId('banner')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('unread count and new-message banner', () => {
  beforeEach(() => resetUnread());

  function Count(): ReactElement | null {
    const c = useUnreadCount();
    return <NotificationBadge count={c} />;
  }

  it('announces only messages that arrive after the first check', async () => {
    await render(
      <>
        <Count />
        <BannerHost />
      </>,
    );
    const open = jest.fn();
    const first = page([n({ notification_id: 'old' })]);
    const second = page([
      n({ notification_id: 'new', event: 'settlement.completed', data: { match_id: MATCH } }),
      n({ notification_id: 'old' }),
    ]);
    const src = fake(first, second, second);
    await act(async () => refreshUnread(src, open));
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('1');
    expect(screen.queryByTestId('banner')).toBeNull(); // first look: the bell is enough
    await act(async () => refreshUnread(src, open));
    expect(screen.getByTestId('banner-title')).toHaveTextContent('Deal complete');
    expect(screen.getByTestId('notification-badge')).toHaveTextContent('2');
    await fireEvent.press(screen.getByTestId('banner-open'));
    expect(open).toHaveBeenCalledWith(`/market/escrow?match=${MATCH}`);
    await act(async () => refreshUnread(src, open)); // same newest: no second banner
    expect(screen.queryByTestId('banner')).toBeNull();
    await act(async () => hideBanner());
  });
});
