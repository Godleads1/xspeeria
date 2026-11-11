/**
 * ADR-111 step 4: the other screens for deals without naira — Search and "Find a deal",
 * My Offers, My Deals, History and receipts. The server checks every figure again.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ServerMatch, ServerOffer } from '../src/api/offersApi';
import { ReceiptScreen } from '../src/features/history/ReceiptScreen';
import { HistoryRow } from '../src/features/history/HistoryScreen';
import { dealToHistory } from '../src/features/history/serverHistory';
import { HomeSearchBar } from '../src/features/home/HomeSearchBar';
import { dealHeadline, dealRate } from '../src/features/market/MyDealsScreen';
import { MyOffersScreen } from '../src/features/market/MyOffersScreen';
import type { Listing } from '../src/features/market/data';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { activeChips, DEFAULT_SEARCH, pairFor, searchCurrencies, type SearchState } from '../src/features/search/searchModel';
import type { SearchSource } from '../src/features/search/serverSearch';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'k') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const MATCH: ServerMatch = {
  match_id: 'abcdef12-0000-4000-8000-000000000000',
  offer_id: 'x1',
  currency: 'USD',
  counter_currency: 'GHS',
  allocated_amount: '100.00',
  counter_amount: '1150.00',
  agreed_rate: '11.5',
  accepted_at: '2026-11-11T09:05:00Z',
  server_order_key: '7',
  your_role: 'taker',
  you_receive_currency: 'USD',
  you_receive_amount: '100.00',
};

describe('Search paying with another currency', () => {
  const usd: SearchState = { ...DEFAULT_SEARCH, currency: 'GHS', pay: 'USD' };

  it('asks for offers selling the currency for the one you pay with', () => {
    expect(pairFor(usd)).toBe('GHS/USD');
    expect(pairFor({ ...usd, side: 'sell' })).toBe('GHS/USD'); // the same deal from either side
    expect(pairFor({ ...DEFAULT_SEARCH, currency: 'GHS' })).toBe('GHS/NGN'); // naira as before
    expect(searchCurrencies('USD', new Set(['USD', 'GHS']))).toEqual(['NGN', 'GHS']);
    expect(searchCurrencies(undefined, new Set(['USD', 'GHS']))).toEqual(['USD', 'GHS']);
    expect(activeChips({ ...usd, minRate: '11', maxRate: '11.6' })).toContain('GHS 11–11.6');
    expect(activeChips({ ...DEFAULT_SEARCH, minRate: '1300', maxRate: '1333' })).toContain('NGN 1,300–1,333');
  });

  it('has no Sell side, never your own currency, and the pair’s rate label', async () => {
    const calls: SearchState[] = [];
    const row: Listing = {
      id: 'o1', currency: 'GHS', availableMinor: 115_000, rateMilli: 11_500, meta: 'Offer time: 1 min ago',
      rateQuote: 'GHS', rateBase: 'USD',
    };
    const source: SearchSource = {
      run: jest.fn(async (s: SearchState) => {
        calls.push(s);
        return { kind: 'offers' as const, rows: [row] };
      }),
    };
    await render(
      <SearchScreen
        initial={{ ...DEFAULT_SEARCH, currency: 'USD' }}
        source={source}
        pay="USD"
        offered={new Set(['USD', 'GBP', 'GHS'])}
        onBack={jest.fn()}
        onTake={jest.fn()}
        onPostRequest={jest.fn()}
      />,
    );
    await flush();
    expect(calls.at(-1)).toMatchObject({ currency: 'NGN', pay: 'USD', side: 'buy' }); // not your own
    expect(screen.queryByTestId('search-side-sell')).toBeNull();
    expect(screen.getByText('You pay USD and get NGN.')).toBeTruthy();
    expect(screen.getByTestId('search-row-o1')).toHaveTextContent(/GHS 11\.50 \/ USD/);
    await fireEvent.press(screen.getByTestId('search-filters'));
    expect(screen.queryByTestId('filter-currency-USD')).toBeNull();
    expect(screen.getByText('RATE RANGE (NGN PER USD)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('filter-currency-GHS'));
    expect(screen.getByText('RATE RANGE (GHS PER USD)')).toBeTruthy();
  });

  it('leaves the currency you pay with out of “Find a deal”', async () => {
    await render(<HomeSearchBar onSearch={jest.fn()} offered={new Set(['USD', 'GBP'])} pay="USD" />);
    expect(screen.queryByTestId('home-search-USD')).toBeNull();
    expect(screen.getByTestId('home-search-GBP')).toBeTruthy();
  });
});

describe('My Offers for a pair without naira', () => {
  it('reads the rate quote per base, also when editing', async () => {
    const o: ServerOffer = {
      offer_id: 'x1', source_currency: 'USD', target_currency: 'GHS', source_amount: '100.00',
      matched_amount: '0.00', remaining_amount: '100.00', desired_rate: '11.5', status: 'open',
      is_own: true, version: 1, created_at: '2026-11-11T09:00:00Z',
    };
    const source = {
      list: jest.fn(async () => [o]),
      withdraw: jest.fn(async (_id: string) => o),
      edit: jest.fn(async (x: ServerOffer, _a: number, _r: number) => x),
    };
    await render(<MyOffersScreen source={source} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('my-offer-x1')).toHaveTextContent(/Sell 100\.00 USD → GHS/);
    expect(screen.getByTestId('my-offer-x1')).toHaveTextContent(/Rate: GHS 11\.50 \/USD/);
    await fireEvent.press(screen.getByTestId('my-offer-x1-edit'));
    expect(screen.getByText('Rate (GHS per USD)')).toBeTruthy();
  });
});

describe('My Deals, History and the receipt for a dollar-for-cedi deal', () => {
  it('shows both sides and the pair’s rate in My Deals', () => {
    expect(dealHeadline(MATCH)).toBe('You get 100.00 USD for 1,150.00 GHS');
    expect(dealRate(MATCH)).toBe('Rate: GHS 11.50 /USD');
    expect(dealRate({ ...MATCH, counter_currency: 'NGN', agreed_rate: '1320.5' })).toBe('Rate: NGN 1,320.50 /USD');
  });

  it('becomes a “bought” row from your side, with what you paid', async () => {
    const mine = dealToHistory(MATCH);
    expect(mine).toMatchObject({
      side: 'buy', currency: 'USD', amountMinor: 10_000, rateMilli: 11_500,
      cross: { payCurrency: 'GHS', payMinor: 115_000, quote: 'GHS', base: 'USD' },
    });
    const theirs = dealToHistory({ ...MATCH, your_role: 'offer_owner', you_receive_currency: 'GHS', you_receive_amount: '1150.00' });
    expect(theirs).toMatchObject({ currency: 'GHS', amountMinor: 115_000, cross: { payCurrency: 'USD', payMinor: 10_000 } });
    expect(dealToHistory({ ...MATCH, you_receive_currency: undefined })).toBeNull();

    if (!mine) throw new Error('no row');
    await render(<HistoryRow item={mine} />);
    expect(screen.getByTestId(`history-${MATCH.match_id}`)).toHaveTextContent(/Rate - GHS 11\.50\/USD/);
  });

  it('receipt: paid in cedis with its 1% fee, received in dollars', async () => {
    const item = dealToHistory(MATCH);
    if (!item) throw new Error('no row');
    await render(<ReceiptScreen item={item} onClose={jest.fn()} />);
    const text = JSON.stringify(screen.toJSON());
    expect(text).toContain('100.00 USD');
    expect(text).toContain('1,150.00 GHS'); // transaction amount
    expect(text).toContain('11.50 GHS'); // 1% fee, in cedis
    expect(text).toContain('1,161.50 GHS'); // amount to pay
    expect(text).toContain('GHS 11.50/USD');
    expect(text).not.toContain(' NGN');
  });
});
