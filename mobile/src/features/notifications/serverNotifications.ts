/** Notifications from the real server (ADR-044), and an empty source for demo builds. */

import { ApiError } from '../../api/client';
import { notificationsApi, type NotificationPage, type ServerNotification } from '../../api/notificationsApi';
import { serverAuth } from '../auth/serverAuth';

export interface NotificationSource {
  list(before?: string | null): Promise<NotificationPage>;
  mark(id: string, read: boolean): Promise<ServerNotification>;
}

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, 'Please log in again.');
  return t;
}

export const serverNotifications: NotificationSource = {
  list: async (before) => notificationsApi.list(token(), { before, limit: 20 }, serverAuth.apiOptions()),
  mark: async (id, read) => notificationsApi.mark(token(), id, read, serverAuth.apiOptions()),
};

/** Demo builds have no server: nothing to show. */
export const demoNotifications: NotificationSource = {
  list: async () => ({ items: [], unread_count: 0, next_before: null }),
  mark: async () => {
    throw new ApiError('APP_NOT_CONFIGURED', 0, 'This version of the app is not connected to Xspeeria.');
  },
};
