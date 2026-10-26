/** My deals and current market prices from the real server (ADR-045), with a small hook. */

import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../../api/client';
import { offersApi, type ServerMatch, type ServerOffer } from '../../api/offersApi';
import { serverAuth } from '../auth/serverAuth';
import { countryHeaders, viewerCountry } from '../location/viewerCountry';
import { tr } from "../../i18n";

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr("Please log in again."));
  return t;
}

export interface DealsSource {
  deals(): Promise<ServerMatch[]>;
  /** Open offers for one pair, e.g. "USD/NGN". */
  offers(pair: string): Promise<ServerOffer[]>;
}

export const serverDeals: DealsSource = {
  deals: async () => offersApi.myMatches(token(), serverAuth.apiOptions()),
  // Home's best rates: the location rule applies (ADR-059 D2), without asking for permission.
  offers: async (pair) => {
    const country = await viewerCountry.get({ ask: false });
    return (await offersApi.listings(token(), pair, 50, 0, { ...serverAuth.apiOptions(), headers: countryHeaders(country) })).items;
  },
};

/** Loads once on mount and on `reload()`; `null` while loading, `error` when it failed. */
export function useServerData<T>(load: (() => Promise<T>) | null): {
  data: T | null;
  error: unknown;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(() => {
    if (!load) return;
    setError(null);
    load().then(setData, setError);
  }, [load]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}
