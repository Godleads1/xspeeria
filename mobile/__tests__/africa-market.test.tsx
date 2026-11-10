/**
 * ADR-107 part 3, step 4: the African currencies in the Market and "Find a deal", shown only
 * while the server offers them (its rate limits include them; on for testing, off on the
 * live server until a Super Admin switches them on, ADR-106). The server checks everything.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ServerOffer } from '../src/api/offersApi';
import { HomeSearchBar } from '../src/features/home/HomeSearchBar';
import { BUYABLE, buyableNow } from '../src/features/market/data';
import { MarketScreen } from '../src/features/market/MarketScreen';
import { toListing, type MarketServer } from '../src/features/market/serverOffers';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'k') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const AFRICAN = ['EGP', 'ZAR', 'MAD', 'ETB', 'KES', 'XOF', 'GHS', 'UGX', 'ZMW', 'TZS'];
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const flush = () => act(async () => { await Promise.resolve(); });

const UGX_OFFER: ServerOffer = {
  offer_id: 'u1',
  source_currency: 'UGX',
  target_currency: 'NGN',
  source_amount: '500000',
  matched_amount: '0',
  remaining_amount: '500000',
  desired_rate: '0.305',
  status: 'open',
  is_own: false,
  version: 1,
  created_at: new Date(NOW - 5 * 60_000).toISOString(),
};

function fakeServer(live: Record<string, number>): jest.Mocked<MarketServer> {
  return {
    offersFor: jest.fn(async (_c: string, now: number) => [toListing(UGX_OFFER, now, true)].filter((r): r is NonNullable<typeof r> => r !== null)),
    requestsFor: jest.fn(async (_c: string, _n: number) => []),
    publishSell: jest.fn(async (_c: string, _a: number, _r: number, _k: string) => ({ ...UGX_OFFER, is_own: true })),
    publishBuy: jest.fn(async (_c: string, _a: number, _r: number, _k: string) => ({ ...UGX_OFFER, is_own: true })),
    newKey: jest.fn(() => 'key-1'),
    ceilings: jest.fn(async () => live),
  };
}

describe('which currencies can be bought', () => {
  it('lists the ten African currencies, each only while the server offers it', () => {
    expect(AFRICAN.every((c) => BUYABLE.some((b) => b.code === c))).toBe(true);
    const codes = (live: Record<string, number> | null) => buyableNow(live).map((c) => c.code);
    expect(codes(null)).toEqual(['USD', 'GBP', 'CAD', 'EUR', 'AUD']); // demo build: none of them
    expect(codes({ USD: 1333260, KES: 10259, UGX: 306 })).toEqual(['USD', 'GBP', 'CAD', 'EUR', 'AUD', 'KES', 'UGX']);
    // A built-in currency with no limit right now (stale feed) stays listed, taking no rate.
    expect(codes({ KES: 10259 })).toContain('USD');
  });
});

describe('Market with the African currencies on', () => {
  it('shows a shilling offer, its derived limit, and takes whole shillings at 3 decimals', async () => {
    const server = fakeServer({ USD: 1333260, UGX: 306 });
    await render(<MarketScreen server={server} />);
    await flush();
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-UGX'));
    await flush();
    expect(server.offersFor).toHaveBeenCalledWith('UGX', expect.any(Number));
    expect(screen.getByTestId('listing-u1')).toHaveTextContent(/500,000 UGX/);
    await fireEvent.changeText(screen.getByTestId('market-amount'), '500000');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '0.306');
    expect(screen.getByTestId('market-official')).toHaveTextContent(
      'Maximum rate: NGN 0.306 per UGX, worked out from a CBN rate and a published exchange rate. Your rate must be this or lower.',
    );
    expect(screen.queryByTestId('market-rate-error')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('market-rate'), '0.307');
    expect(screen.getByTestId('market-rate-error')).toBeTruthy();
  });

  it('hides them when the server has them switched off', async () => {
    await render(<MarketScreen server={fakeServer({ USD: 1333260 })} />);
    await flush();
    await fireEvent.press(screen.getByTestId('market-currency'));
    expect(screen.queryByTestId('currency-UGX')).toBeNull();
    expect(screen.queryByTestId('currency-KES')).toBeNull();
    expect(screen.getByTestId('currency-USD')).toBeTruthy();
  });
});

describe('Find a deal', () => {
  it('shows a chip for each offered African currency, scrolling sideways', async () => {
    const onSearch = jest.fn();
    await render(<HomeSearchBar onSearch={onSearch} offered={new Set(['USD', 'GBP', 'EUR', 'CAD', 'KES', 'XOF'])} />);
    expect(screen.getByTestId('home-search-chips')).toBeTruthy();
    expect(screen.getByTestId('home-search-input').props.placeholder).toBe('Search USD, GBP, EUR, CAD… offers');
    await fireEvent.press(screen.getByTestId('home-search-KES'));
    expect(onSearch).toHaveBeenCalledWith({ query: '', currency: 'KES' });
    expect(screen.queryByTestId('home-search-UGX')).toBeNull();
  });
});
