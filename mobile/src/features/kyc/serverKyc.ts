/** Identity checks against the real server (ADR-039/040). */

import * as Linking from 'expo-linking';

import { ApiError } from '../../api/client';
import { kycApi, type KycCountry, type ServerKycCase, type ServerRegions } from '../../api/kycApi';
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

/** The identity check for one country (ADR-042). */
export function serverKycFor(country: KycCountry): KycSource {
  return {
    current: async () => kycApi.current(token(), serverAuth.apiOptions(), country),
    start: async () => kycApi.start(token(), serverAuth.apiOptions(), country),
    open: async (url) => {
      await Linking.openURL(url);
    },
  };
}

export const serverKyc: KycSource = serverKycFor('NG');

/** My status per country and a suggested new country (ADR-042). */
export async function serverRegions(): Promise<ServerRegions> {
  return kycApi.regions(token(), serverAuth.apiOptions());
}
