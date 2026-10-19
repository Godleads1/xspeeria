/** My signed-in devices and trusted devices (ADR-025/026). Times are ISO strings. */

import { apiRequest, type RequestOptions } from './client';

export interface ServerSession {
  session_id: string;
  device_id: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  /** This device. */
  current: boolean;
}

export interface ServerTrustedDevice {
  trusted_device_id: string;
  device_id: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;
const enc = encodeURIComponent;

export const devicesApi = {
  sessions: (token: string, x: Extra = {}) =>
    apiRequest<ServerSession[]>('GET', '/api/v1/users/me/sessions', { token, ...x }),
  signOut: (token: string, id: string, x: Extra = {}) =>
    apiRequest<void>('DELETE', `/api/v1/users/me/sessions/${enc(id)}`, { token, ...x }),
  trusted: (token: string, x: Extra = {}) =>
    apiRequest<ServerTrustedDevice[]>('GET', '/api/v1/users/me/trusted-devices', { token, ...x }),
  untrust: (token: string, id: string, x: Extra = {}) =>
    apiRequest<void>('DELETE', `/api/v1/users/me/trusted-devices/${enc(id)}`, { token, ...x }),
};
