/** Signed-in and trusted devices from the real server (ADR-025/026). */

import { ApiError } from '../../api/client';
import { devicesApi } from '../../api/devicesApi';
import { serverAuth } from '../auth/serverAuth';
import type { DevicesSource } from './DevicesScreen';

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, 'Please log in again.');
  return t;
}

export const serverDevices: DevicesSource = {
  sessions: async () => devicesApi.sessions(token(), serverAuth.apiOptions()),
  signOut: async (id) => devicesApi.signOut(token(), id, serverAuth.apiOptions()),
  trusted: async () => devicesApi.trusted(token(), serverAuth.apiOptions()),
  untrust: async (id) => devicesApi.untrust(token(), id, serverAuth.apiOptions()),
};
