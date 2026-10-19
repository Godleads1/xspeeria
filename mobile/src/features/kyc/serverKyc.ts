/** Identity checks against the real server (ADR-039/040). */

import * as Linking from 'expo-linking';

import { ApiError } from '../../api/client';
import { kycApi, type ServerKycCase } from '../../api/kycApi';
import { serverAuth } from '../auth/serverAuth';

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, 'Please log in again.');
  return t;
}

export interface KycSource {
  current(): Promise<ServerKycCase>;
  start(): Promise<ServerKycCase>;
  /** Opens Didit's hosted check. Only https links are ever opened. */
  open(url: string): Promise<void>;
}

/** Didit's hosted check must be https; anything else is refused (the link comes from our server). */
export function safeVerificationUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export const serverKyc: KycSource = {
  current: async () => kycApi.current(token(), serverAuth.apiOptions()),
  start: async () => kycApi.start(token(), serverAuth.apiOptions()),
  open: async (url) => {
    await Linking.openURL(url);
  },
};
