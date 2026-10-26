/**
 * Market search against the server (ADR-059 Decision 1). Offers become the Market's rows
 * (exact integers, ADR-030); "Success" trades become read-only rows with nothing to take.
 */

import { ApiError } from '../../api/client';
import { offersApi, type CompletedTrade } from '../../api/offersApi';
import { tr } from '../../i18n';
import { serverAuth } from '../auth/serverAuth';
import type { Listing } from '../market/data';
import { exactHundredths, groupedRate, toListing } from '../market/serverOffers';
import { pairFor, toParams, type SearchState } from './searchModel';

/** A completed trade as shown: no id, no names. */
export interface TradeRow {
  readonly key: string;
  readonly currency: string;
  readonly amountMinor: number;
  readonly rateLabel: string;
  readonly when: string;
}

export type SearchResult =
  | { readonly kind: 'offers'; readonly rows: readonly Listing[] }
  | { readonly kind: 'trades'; readonly rows: readonly TradeRow[] };

export interface SearchSource {
  run(state: SearchState, now: number): Promise<SearchResult>;
}

/** "Completed 4 mins ago" from the server's time. */
export function completedAgo(iso: string, now: number): string {
  const at = Date.parse(iso);
  const mins = Number.isNaN(at) ? 0 : Math.max(0, Math.floor((now - at) / 60_000));
  if (mins < 1) return tr('Completed just now');
  if (mins < 60) return mins === 1 ? tr('Completed 1 min ago') : tr('Completed {{count}} mins ago', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? tr('Completed 1 hour ago') : tr('Completed {{count}} hours ago', { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? tr('Completed 1 day ago') : tr('Completed {{count}} days ago', { count: days });
}

/** A server trade as a row, or null for anything the app cannot show exactly. */
export function toTradeRow(t: CompletedTrade, index: number, now: number): TradeRow | null {
  const amountMinor = exactHundredths(t.amount);
  if (amountMinor === null || !/^[0-9]+(\.[0-9]{1,6})?$/.test(t.rate) || !/^[A-Z]{3}$/.test(t.currency)) return null;
  return {
    key: `${index}-${t.completed_at}`,
    currency: t.currency,
    amountMinor,
    rateLabel: groupedRate(t.rate),
    when: completedAgo(t.completed_at, now),
  };
}

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr('Please log in again.'));
  return t;
}

export const serverSearch: SearchSource = {
  async run(state, now) {
    const page = await offersApi.search(token(), pairFor(state), toParams(state), 50, serverAuth.apiOptions());
    if (state.status === 'success') {
      const rows: TradeRow[] = [];
      (page.trades ?? []).forEach((t, i) => {
        const row = toTradeRow(t, i, now);
        if (row) rows.push(row);
      });
      return { kind: 'trades', rows };
    }
    const rows: Listing[] = [];
    page.items.forEach((o) => {
      // "Best rate" marks the first row only when the list is in best-rate order.
      const row = toListing(o, now, rows.length === 0 && state.sort === 'best_rate');
      if (row) rows.push(row);
    });
    return { kind: 'offers', rows };
  },
};
