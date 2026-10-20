/** In-app notifications (ADR-044). The server sends an event name and ids; the app writes the words. */

import { apiRequest, type RequestOptions } from './client';

export interface ServerNotification {
  notification_id: string;
  type: 'kyc_status' | 'match_found' | 'settlement_update' | 'dispute_update' | 'system' | string;
  /** e.g. "kyc.approved", "match.created", "settlement.completed". Unknown events are shown generically. */
  event: string;
  data: Record<string, string>;
  created_at: string;
  read: boolean;
}

export interface NotificationPage {
  items: ServerNotification[];
  unread_count: number;
  next_before: string | null;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const notificationsApi = {
  list: (token: string, q: { before?: string | null; limit?: number } = {}, x: Extra = {}) => {
    const params = new URLSearchParams();
    if (q.before) params.set('before', q.before);
    if (q.limit) params.set('limit', String(q.limit));
    const qs = params.toString();
    return apiRequest<NotificationPage>('GET', `/api/v1/notifications${qs ? `?${qs}` : ''}`, { token, ...x });
  },
  mark: (token: string, id: string, read: boolean, x: Extra = {}) =>
    apiRequest<ServerNotification>('PATCH', `/api/v1/notifications/${encodeURIComponent(id)}`, {
      token,
      body: { read },
      ...x,
    }),
  /** ADR-052: this phone's Expo push token, for the current session. */
  registerPush: (token: string, push: { token: string; platform: 'ios' | 'android' }, x: Extra = {}) =>
    apiRequest<void>('PUT', '/api/v1/users/me/push-token', { token, body: push, ...x }),
  removePush: (token: string, x: Extra = {}) =>
    apiRequest<void>('DELETE', '/api/v1/users/me/push-token', { token, ...x }),
};
