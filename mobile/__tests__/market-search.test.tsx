/**
 * ADR-059 Decision 1: market search on Home. The server is a fake; its rules (allow-listed
 * sorts, exact decimals, bounds) are tested on the server itself.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import { offersApi, searchQuery, type ServerOffer } from '../src/api/offersApi';
import { serverAuth } from '../src/features/auth/serverAuth';
import { HomeSearchBar } from '../src/features/home/HomeSearchBar';
import type { Listing } from '../src/features/market/data';
import { SearchScreen } from '../src/features/search/SearchScreen';
import {
  activeChips,
  DEFAULT_SEARCH,
  filterProblem,
  isSearchCurrency,
  pairFor,
  readQuery,
  SEARCH_CURRENCIES,
  shownSearchCurrencies,
  toParams,
  type SearchState,
} from '../src/features/search/searchModel';
import { completedAgo, serverSearch, toTradeRow, type SearchSource } from '../src/features/search/serverSearch';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function row(over: Partial<Listing> = {}): Listing {
  return { id: 'o1', currency: 'USD', availableMinor: 150000, rateMilli: 1320500, meta: 'Offer time: 8 mins ago', best: true, ...over };
}

function fake(result: Awaited<ReturnType<SearchSource['run']>> = { kind: 'offers', rows: [row()] }) {
  const calls: SearchState[] = [];
  const source: SearchSource = {
    run: jest.fn(async (s: SearchState) => {
      calls.push(s);
      return result;
    }),
  };
  return { source, calls };
}

async function renderSearch(over: Partial<Parameters<typeof SearchScreen>[0]> = {}) {
  const f = fake();
  const props = {
    source: f.source,
    now: () => NOW,
    onBack: jest.fn(),
    onTake: jest.fn(),
    onPostRequest: jest.fn(),
    ...over,
  };
  await render(<SearchScreen {...props} />);
  return { ...props, calls: f.calls };
}

describe('search model', () => {
  it('offers the currencies with an official rate; the yuan only when the server offers it', () => {
    expect(SEARCH_CURRENCIES).toEqual([
      'USD', 'GBP', 'EUR', 'CAD', 'CNY',
      'EGP', 'ZAR', 'MAD', 'ETB', 'KES', 'XOF', 'GHS', 'UGX', 'ZMW', 'TZS',
    ]);
    // Demo builds and before the server answers: the yuan and the African currencies are hidden.
    expect(shownSearchCurrencies()).toEqual(['USD', 'GBP', 'EUR', 'CAD']);
    // ADR-107: the African currencies show when the server offers them (on for testing).
    expect(shownSearchCurrencies(new Set(['USD', 'KES', 'UGX']))).toEqual(['USD', 'KES', 'UGX']);
    expect(shownSearchCurrencies(new Set(['USD', 'GBP', 'EUR', 'CAD', 'CNY']))).toEqual(['USD', 'GBP', 'EUR', 'CAD', 'CNY']);
    // A currency switched off on the server has no rate limit there, so it isn't shown.
    expect(shownSearchCurrencies(new Set(['USD', 'GBP']))).toEqual(['USD', 'GBP']);
    expect(isSearchCurrency('CAD')).toBe(true);
    expect(isSearchCurrency('JPY')).toBe(false);
    expect(readQuery('500 yuan')).toEqual({ currency: 'CNY', minAmount: '500' });
    expect(isSearchCurrency('usd')).toBe(false);
    expect(isSearchCurrency(undefined)).toBe(false);
  });

  it('reads a currency and an amount from the search box', () => {
    expect(readQuery('500 USD')).toEqual({ currency: 'USD', minAmount: '500' });
    expect(readQuery('£1,200.50')).toEqual({ currency: 'GBP', minAmount: '1200.50' });
    expect(readQuery('euros')).toEqual({ currency: 'EUR' });
    expect(readQuery('0 usd')).toEqual({ currency: 'USD' });
    expect(readQuery('drop table; 1e9')).toEqual({});
    expect(readQuery('9'.repeat(200))).toEqual({});
  });

  it('flags bad or crossed filters before sending', () => {
    expect(filterProblem(DEFAULT_SEARCH)).toBeNull();
    expect(filterProblem({ ...DEFAULT_SEARCH, minRate: '1300', maxRate: '1350.5' })).toBeNull();
    expect(filterProblem({ ...DEFAULT_SEARCH, minRate: '1350', maxRate: '1300' })).toMatch(/lowest rate/);
    expect(filterProblem({ ...DEFAULT_SEARCH, minRate: '1.2.3' })).toMatch(/up to 3 decimal/);
    expect(filterProblem({ ...DEFAULT_SEARCH, maxRate: '0' })).toMatch(/more than zero/);
    expect(filterProblem({ ...DEFAULT_SEARCH, minAmount: '10.001' })).toMatch(/as a number/);
    expect(filterProblem({ ...DEFAULT_SEARCH, minAmount: '900', maxAmount: '100' })).toMatch(/smallest amount/);
    // Compared as whole numbers, not floats: 0.1 + 0.2 style traps do not apply.
    expect(filterProblem({ ...DEFAULT_SEARCH, minAmount: '0.30', maxAmount: '0.3' })).toBeNull();
  });

  it('builds the pair and the query string the server expects', () => {
    expect(pairFor(DEFAULT_SEARCH)).toBe('USD/NGN');
    expect(pairFor({ ...DEFAULT_SEARCH, side: 'sell', currency: 'GBP' })).toBe('NGN/GBP');
    const params = toParams({ ...DEFAULT_SEARCH, sort: 'newest', minRate: '1,300', minAmount: '500' });
    expect(params).toEqual({ sort: 'newest', status: 'available', min_rate: '1300', max_rate: undefined, min_amount: '500', max_amount: undefined });
    expect(searchQuery(params)).toBe('&sort=newest&filter%5Bstatus%5D=available&filter%5Bmin_rate%5D=1300&filter%5Bmin_amount%5D=500');
  });

  it('shows what is switched on as chips', () => {
    expect(activeChips(DEFAULT_SEARCH)).toEqual(['Best rate', 'USD']);
    expect(activeChips({ ...DEFAULT_SEARCH, status: 'success', minRate: '1300', maxRate: '1350', minAmount: '500' })).toEqual([
      'Best rate', 'USD', 'Success', 'NGN 1,300–1,350', '500+ USD',
    ]);
  });
});

describe('server answers', () => {
  it('turns a completed trade into a row with no id or name', () => {
    const t = toTradeRow({ currency: 'USD', amount: '200.00', rate: '1320.50', completed_at: new Date(NOW - 4 * 60_000).toISOString() }, 0, NOW);
    expect(t).toMatchObject({ currency: 'USD', amountMinor: 20000, rateLabel: '1,320.50', when: 'Completed 4 mins ago' });
    expect(toTradeRow({ currency: 'USD', amount: '1e3', rate: '1320', completed_at: '' }, 0, NOW)).toBeNull();
    expect(toTradeRow({ currency: 'usd!', amount: '1.00', rate: '1320', completed_at: '' }, 0, NOW)).toBeNull();
    expect(completedAgo(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe('Completed 3 hours ago');
  });

  it('asks the server with the search and maps both kinds of answer', async () => {
    jest.spyOn(serverAuth, 'accessToken').mockReturnValue('t');
    const offer: ServerOffer = {
      offer_id: 'a1', source_currency: 'USD', target_currency: 'NGN', source_amount: '500.00', matched_amount: '0.00',
      remaining_amount: '500.00', desired_rate: '1320.50', status: 'open', is_own: false, version: 1,
      created_at: new Date(NOW - 60_000).toISOString(),
    };
    const spy = jest.spyOn(offersApi, 'search').mockResolvedValue({ status: 'available', items: [offer], trades: [], limit: 50, offset: 0, next_offset: null });
    const got = await serverSearch.run({ ...DEFAULT_SEARCH, sort: 'newest' }, NOW);
    expect(spy).toHaveBeenCalledWith('t', 'USD/NGN', expect.objectContaining({ sort: 'newest' }), 50, expect.anything());
    expect(got.kind).toBe('offers');
    // "Best rate" is only marked when the list is in best-rate order.
    expect(got.kind === 'offers' && got.rows[0].best).toBeFalsy();
    spy.mockResolvedValue({ status: 'success', items: [], trades: [{ currency: 'USD', amount: '200.00', rate: '1320.50', completed_at: new Date(NOW).toISOString() }], limit: 50, offset: 0, next_offset: null });
    const trades = await serverSearch.run({ ...DEFAULT_SEARCH, status: 'success' }, NOW);
    expect(trades.kind).toBe('trades');
    expect(trades.rows).toHaveLength(1);
    spy.mockRestore();
  });
});

describe('search screen', () => {
  it('shows offers with rate, amount and a Buy action that opens Take', async () => {
    const p = await renderSearch();
    await flush();
    expect(screen.getByTestId('search-heading').props.children).toBe('1 offers selling USD');
    expect(screen.getByText('NGN 1,320.50 / USD')).toBeTruthy();
    expect(screen.getByText('Up to 1,500.00 USD')).toBeTruthy();
    expect(screen.getAllByText('Best rate')).toHaveLength(2); // the sort chip and the row's tag
    await fireEvent.press(screen.getByTestId('search-take-o1'));
    expect(p.onTake).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
  });

  it('never offers to take your own offer', async () => {
    const f = fake({ kind: 'offers', rows: [row({ own: true, meta: 'Your offer' })] });
    await renderSearch({ source: f.source });
    await flush();
    expect(screen.queryByTestId('search-take-o1')).toBeNull();
    expect(screen.getByText('Your offer')).toBeTruthy();
  });

  it('reads the search box and searches again', async () => {
    const p = await renderSearch();
    await flush();
    await fireEvent.changeText(screen.getByTestId('search-input'), '200 pounds');
    await fireEvent(screen.getByTestId('search-input'), 'submitEditing');
    await flush();
    expect(p.calls.at(-1)).toMatchObject({ currency: 'GBP', minAmount: '200' });
  });

  it('switches to buy requests (Sell side)', async () => {
    const p = await renderSearch();
    await flush();
    await fireEvent.press(screen.getByTestId('search-side-sell'));
    await flush();
    expect(p.calls.at(-1)?.side).toBe('sell');
    expect(screen.getByTestId('search-take-o1').props.accessibilityLabel).toMatch(/^Sell/);
  });

  it('applies sort and filters from the sheet only when they are valid', async () => {
    const p = await renderSearch({ openFilters: true });
    await flush();
    await fireEvent.press(screen.getByTestId('filter-sort-oldest'));
    await fireEvent.press(screen.getByTestId('filter-currency-EUR'));
    await fireEvent.changeText(screen.getByTestId('filter-min-rate'), '1500');
    await fireEvent.changeText(screen.getByTestId('filter-max-rate'), '1400');
    expect(screen.getByTestId('filter-problem')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('filter-apply'));
    await flush();
    expect(p.calls.at(-1)?.sort).toBe('best_rate'); // not applied while invalid
    await fireEvent.changeText(screen.getByTestId('filter-max-rate'), '1,520abc');
    expect(screen.queryByTestId('filter-problem')).toBeNull();
    await fireEvent.press(screen.getByTestId('filter-apply'));
    await flush();
    expect(p.calls.at(-1)).toMatchObject({ sort: 'oldest', currency: 'EUR', minRate: '1500', maxRate: '1,520' });
    expect(screen.getByText('NGN 1,500–1,520')).toBeTruthy();
  });

  it('lists completed trades under Success with nothing to take', async () => {
    const f = fake({ kind: 'trades', rows: [{ key: 'k', currency: 'USD', amountMinor: 100000, rateLabel: '1,322.00', when: 'Completed 4 mins ago' }] });
    await renderSearch({ source: f.source, initial: { ...DEFAULT_SEARCH, status: 'success' } });
    await flush();
    expect(screen.getByTestId('search-heading').props.children).toBe('Recent completed USD trades');
    expect(screen.getByTestId('search-trade')).toBeTruthy();
    expect(screen.getByText('Completed 4 mins ago')).toBeTruthy();
    expect(screen.queryByText('Buy')).toBeNull();
  });

  it('offers to post a buy request or clear filters when nothing matches', async () => {
    const f = fake({ kind: 'offers', rows: [] });
    const p = await renderSearch({ source: f.source, initial: { ...DEFAULT_SEARCH, minAmount: '10000' } });
    await flush();
    expect(screen.getByText('No offers match')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('search-post-request'));
    expect(p.onPostRequest).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('search-clear-filters'));
    await flush();
    expect((f.source.run as jest.Mock).mock.calls.at(-1)[0]).toMatchObject({ minAmount: '', currency: 'USD' });
  });

  it('shows the server error and retries', async () => {
    const source: SearchSource = { run: jest.fn().mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 422, 'That sort order is not available.')).mockResolvedValue({ kind: 'offers', rows: [] }) };
    await renderSearch({ source });
    await flush();
    expect(screen.getByText('That sort order is not available.')).toBeTruthy();
  });

  it('ignores an older answer that arrives after a newer one', async () => {
    let first: (v: Awaited<ReturnType<SearchSource['run']>>) => void = () => undefined;
    const source: SearchSource = {
      run: jest
        .fn()
        .mockImplementationOnce(() => new Promise((r) => { first = r; }))
        .mockResolvedValue({ kind: 'offers', rows: [row({ id: 'new' })] }),
    };
    await renderSearch({ source });
    await fireEvent.press(screen.getByTestId('search-side-sell'));
    await flush();
    first({ kind: 'offers', rows: [row({ id: 'old' })] });
    await flush();
    expect(screen.queryByTestId('search-row-old')).toBeNull();
    expect(screen.getByTestId('search-row-new')).toBeTruthy();
  });
});

describe('search screen without a clock (as the route renders it)', () => {
  it('searches once, not on every render', async () => {
    const run = jest.fn(async () => ({ kind: 'offers' as const, rows: [] }));
    await render(<SearchScreen source={{ run }} onBack={jest.fn()} onTake={jest.fn()} onPostRequest={jest.fn()} />);
    await flush();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('Home search bar', () => {
  it('sends the text, a currency chip, or opens filters', async () => {
    const onSearch = jest.fn();
    await render(<HomeSearchBar onSearch={onSearch} />);
    await fireEvent.changeText(screen.getByTestId('home-search-input'), '500 USD');
    await fireEvent(screen.getByTestId('home-search-input'), 'submitEditing');
    expect(onSearch).toHaveBeenLastCalledWith({ query: '500 USD' });
    await fireEvent.press(screen.getByTestId('home-search-GBP'));
    expect(onSearch).toHaveBeenLastCalledWith({ query: '', currency: 'GBP' });
    await fireEvent.press(screen.getByTestId('home-search-filters'));
    expect(onSearch).toHaveBeenLastCalledWith({ query: '500 USD', filters: true });
    expect(screen.getByTestId('home-search-CAD')).toBeTruthy();
    expect(screen.queryByTestId('home-search-CNY')).toBeNull();
  });
});
