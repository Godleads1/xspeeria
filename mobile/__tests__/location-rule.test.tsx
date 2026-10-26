/**
 * ADR-059 Decision 2 (rule A): nobody sees listings selling their own country's currency.
 * The server enforces it; the app sends only a country code and explains what is hidden.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import { offersApi, type ListingsPage } from '../src/api/offersApi';
import { serverAuth } from '../src/features/auth/serverAuth';
import { countryHeaders, makeViewerCountry, viewerCountry } from '../src/features/location/viewerCountry';
import { locatedPage } from '../src/features/market/serverOffers';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { DEFAULT_SEARCH, type SearchState } from '../src/features/search/searchModel';
import { serverSearch, type SearchResult, type SearchSource } from '../src/features/search/serverSearch';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

function page(over: Partial<ListingsPage> = {}): ListingsPage {
  return { status: 'available', items: [], trades: [], limit: 50, offset: 0, next_offset: null, ...over };
}

afterEach(() => {
  jest.restoreAllMocks();
  viewerCountry.reset();
});

describe('viewer country', () => {
  it('keeps only a found country and asks only when told to', async () => {
    const detect = jest.fn().mockResolvedValueOnce({ status: 'denied' }).mockResolvedValueOnce({ status: 'found', country: 'NG' });
    const vc = makeViewerCountry(detect);
    expect(await vc.get({ ask: false })).toBeNull();
    expect(await vc.get({ ask: true })).toBe('NG');
    expect(await vc.get({ ask: true })).toBe('NG'); // remembered for this session
    expect(detect).toHaveBeenCalledTimes(2);
    expect(detect.mock.calls.map((c) => c[0].ask)).toEqual([false, true]);
  });

  it('never throws, and forgets on reset', async () => {
    const vc = makeViewerCountry(jest.fn().mockRejectedValue(new Error('gps off')));
    expect(await vc.get({ ask: true })).toBeNull();
    vc.reset();
  });

  it('sends only a clean two-letter code', () => {
    expect(countryHeaders('NG')).toEqual({ 'X-Device-Country': 'NG' });
    expect(countryHeaders(null)).toEqual({});
    expect(countryHeaders('ng')).toEqual({});
    expect(countryHeaders('NGA')).toEqual({});
  });
});

describe('Market and search use the rule', () => {
  beforeEach(() => {
    jest.spyOn(serverAuth, 'accessToken').mockReturnValue('t');
    jest.spyOn(viewerCountry, 'get').mockResolvedValue('NG');
  });

  it('sends the country header with listings', async () => {
    const spy = jest.spyOn(offersApi, 'listings').mockResolvedValue(page());
    await locatedPage('USD/NGN', true);
    expect(spy.mock.calls[0][4]?.headers).toEqual({ 'X-Device-Country': 'NG' });
    expect(viewerCountry.get).toHaveBeenCalledWith({ ask: true });
  });

  it('explains a hidden side and a missing country on the Market', async () => {
    jest.spyOn(offersApi, 'listings').mockResolvedValueOnce(page({ hidden: true })).mockResolvedValueOnce(page({ needs_location: true }));
    await expect(locatedPage('NGN/USD', true)).rejects.toMatchObject({ code: 'LISTINGS_HIDDEN', message: 'Listings that sell NGN aren’t shown in your country.' });
    await expect(locatedPage('USD/NGN', true)).rejects.toBeInstanceOf(ApiError);
  });

  it('search reports blocked answers without rows', async () => {
    jest.spyOn(offersApi, 'search').mockResolvedValueOnce(page({ hidden: true })).mockResolvedValueOnce(page({ needs_location: true }));
    expect(await serverSearch.run(DEFAULT_SEARCH, 0)).toEqual({ kind: 'blocked', reason: 'hidden', rows: [] });
    expect(await serverSearch.run(DEFAULT_SEARCH, 0)).toEqual({ kind: 'blocked', reason: 'needs_location', rows: [] });
  });
});

describe('search screen', () => {
  function screenWith(answer: (s: SearchState) => SearchResult) {
    const calls: SearchState[] = [];
    const source: SearchSource = {
      run: jest.fn(async (s: SearchState) => {
        calls.push(s);
        return answer(s);
      }),
    };
    return { source, calls };
  }

  it('in Nigeria, switches away from requests selling naira and turns that side off', async () => {
    const { source, calls } = screenWith((s) =>
      s.side === 'sell' ? { kind: 'blocked', reason: 'hidden', rows: [] } : { kind: 'offers', rows: [] },
    );
    await render(<SearchScreen initial={{ ...DEFAULT_SEARCH, side: 'sell' }} source={source} onBack={jest.fn()} onTake={jest.fn()} onPostRequest={jest.fn()} />);
    await flush();
    await flush();
    expect(calls.at(-1)?.side).toBe('buy');
    expect(screen.getByTestId('search-side-sell').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('search-hidden-note').props.children).toBe('Listings that sell NGN aren’t shown in your country.');
  });

  it('asks to turn on location when no country is known, and tries again', async () => {
    const { source, calls } = screenWith(() => ({ kind: 'blocked', reason: 'needs_location', rows: [] }));
    await render(<SearchScreen source={source} onBack={jest.fn()} onTake={jest.fn()} onPostRequest={jest.fn()} />);
    await flush();
    expect(screen.getByText('Turn on location to see deals')).toBeTruthy();
    expect(screen.queryByTestId('search-empty')).toBeNull();
    const before = calls.length;
    await fireEvent.press(screen.getByTestId('search-location'));
    await flush();
    expect(calls.length).toBe(before + 1);
  });
});
