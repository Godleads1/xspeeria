/** Disputes and support cases (ADR-057, contract §3.8). */

import { apiRequest, type RequestOptions } from './client';

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

/** A dispute category code. The first four are built in; staff may add more (ADR-063). */
export type DisputeReason = string;

export interface DisputeCategory {
  code: string;
  /** As staff wrote it (shown for categories the app has no translation for). */
  name: string;
  description: string;
}

export interface DisputeMessage {
  message_id: string;
  /** The other side's messages are never sent to you. */
  author: 'you' | 'staff';
  body: string;
  created_at: string;
}

export interface ServerDispute {
  dispute_id: string;
  /** "dispute": on a deal (its escrow is paused); "support": no deal. */
  kind: 'dispute' | 'support';
  transaction_id: string | null;
  reason: DisputeReason;
  status: 'open' | 'under_review' | 'resolved';
  outcome: string | null;
  opened_by_you: boolean;
  /** Your own words; null when the other side opened it. */
  description: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  messages: DisputeMessage[];
}

const path = (id: string): string => `/api/v1/disputes/${encodeURIComponent(id)}`;

export const disputesApi = {
  open: (token: string, body: { transaction_id?: string; reason: DisputeReason; description: string }, x: Extra = {}) =>
    apiRequest<ServerDispute>('POST', '/api/v1/disputes', { token, body, ...x }),
  categories: (token: string, x: Extra = {}) =>
    apiRequest<DisputeCategory[]>('GET', '/api/v1/disputes/categories', { token, ...x }),
  mine: (token: string, x: Extra = {}) => apiRequest<ServerDispute[]>('GET', '/api/v1/disputes', { token, ...x }),
  get: (token: string, id: string, x: Extra = {}) => apiRequest<ServerDispute>('GET', path(id), { token, ...x }),
  message: (token: string, id: string, message: string, x: Extra = {}) =>
    apiRequest<ServerDispute>('POST', `${path(id)}/evidence`, { token, body: { message }, ...x }),
};
