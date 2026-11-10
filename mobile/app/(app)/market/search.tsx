import type { ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { SearchScreen } from '../../../src/features/search/SearchScreen';
import { DEFAULT_SEARCH, isSearchCurrency, readQuery } from '../../../src/features/search/searchModel';
import { serverSearch } from '../../../src/features/search/serverSearch';
import { queueAction } from '../../../src/features/market/queueActions';
import { queueServer } from '../../../src/features/market/serverOffers';
import { useThemeMode } from '../../../src/theme';
import { useOfferedCurrencies } from '../../../src/features/market/offeredCurrencies';

/**
 * Market search (ADR-059 Decision 1). Server builds only. Route params are untrusted: the
 * text is cut short and only read for a currency and an amount; the currency must be one of
 * the listed ones; anything else is ignored. The server checks every filter again.
 */
export default function SearchRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; currency?: string; filters?: string }>();
  const offered = useOfferedCurrencies();
  if (!SERVER_MODE) return <Redirect href="/marketplace" />;
  const query = typeof params.q === 'string' ? params.q.slice(0, 40) : '';
  const read = readQuery(query);
  const currency = isSearchCurrency(params.currency) ? params.currency : (read.currency ?? DEFAULT_SEARCH.currency);
  return (
    <SearchScreen
      initial={{ ...DEFAULT_SEARCH, currency, minAmount: read.minAmount ?? '' }}
      initialQuery={query}
      openFilters={params.filters === '1'}
      source={serverSearch}
      onBack={() => router.back()}
      onTake={(listing) => router.push({ pathname: '/market/take', params: { offer: listing.id } })}
      onPostRequest={() => router.push('/marketplace')}
      onQueue={(listing) => queueAction(listing, queueServer)}
      offered={offered}
    />
  );
}
