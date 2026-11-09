/**
 * "Need help?" for people who can't log in (ADR-103). No log-in: the server gives this phone a
 * private key when the request is made; reading and replying send it in `X-Help-Key`.
 */

import { apiRequest, type RequestOptions } from './client';

export interface HelpOpened {
  request_id: string;
  key: string;
}

export interface HelpThread {
  request_id: string;
  status: 'open' | 'closed';
  messages: { message_id: string; author: 'you' | 'staff'; body: string; created_at: string }[];
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const helpApi = {
  open: (phone: string, email: string, message: string, x: Extra = {}) =>
    apiRequest<HelpOpened>('POST', '/api/v1/help/requests', { body: { phone, email, message }, ...x }),
  read: (requestId: string, key: string, x: Extra = {}) =>
    apiRequest<HelpThread>('GET', `/api/v1/help/requests/${encodeURIComponent(requestId)}`, {
      headers: { 'X-Help-Key': key },
      ...x,
    }),
  reply: (requestId: string, key: string, message: string, x: Extra = {}) =>
    apiRequest<void>('POST', `/api/v1/help/requests/${encodeURIComponent(requestId)}/messages`, {
      body: { message },
      headers: { 'X-Help-Key': key },
      ...x,
    }),
};
