/**
 * ADR-030: the Market screens against the server's offers (Milestone 4.1C).
 * The server is a scripted fake `fetch`; its rules are tested on the server itself.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import { offersApi, type ServerOffer } from '../src/api/offersApi';
import { serverAuth } from '../src/features/auth/serverAuth';
import { MarketScreen } from '../src/features/market/MarketScreen';
import { MyOffersScreen } from '../src/features/market/MyOffersScreen';
import { exactHundredths, foreignMinorFor, marketServer, myOffers, toListing, type MarketServer } from '../src/features/market/serverOffers';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

function offer(over: Partial<ServerOffer> = {}): ServerOffer {
  return {
    offer_id: 'a1',
    source_currency: 'USD',
    target_currency: 'NGN',
    source_amount: '500.00',
    matched_amount: '0.00',
    remaining_amount: '500.00',
    desired_rate: '1320.50',
    status: 'open',
    is_own: false,
    version: 1,
    created_at: new Date(NOW - 5 * 60_000).toISOString(),
    ...over,
  };
}

const flush = () => act(async () => { await Promise.resolve(); });

describe('server offer → Market row', () => {
  it('converts strings to exact integers', () => {
    const row = toListing(offer(), NOW, true);
    expect(row).toMatchObject({ id: 'a1', currency: 'USD', availableMinor: 50000, rateHundredths: 132050, best: true });
    expect(row?.meta).toBe('Offer time: 5 mins ago');
    expect(row?.rateLabel).toBeUndefined();
  });

  it('keeps a rate with more than two decimals as exact text', () => {
    const row = toListing(offer({ desired_rate: '1320.125' }), NOW, false);
    expect(row?.rateLabel).toBe('1,320.125');
  });

  it('marks own offers and drops rows it cannot show exactly', () => {
    expect(toListing(offer({ is_own: true }), NOW, false)?.own).toBe(true);
    expect(toListing(offer({ remaining_amount: '1e3' }), NOW, false)).toBeNull();
    expect(toListing(offer({ desired_rate: '-1' }), NOW, false)).toBeNull();
    expect(exactHundredths('10.005')).toBeNull();
  });
});

describe('marketServer requests', () => {
  afterEach(() => {
    serverAuth.useFetch(undefined);
    serverAuth.reset();
  });

  it('needs a signed-in session', async () => {
    await expect(marketServer.offersFor('USD', NOW)).rejects.toBeInstanceOf(ApiError);
  });
});

function fakeServer(rows: ServerOffer[] = [offer()], requests: ServerOffer[] = []): jest.Mocked<MarketServer> {
  const listed = (list: ServerOffer[], now: number) =>
    list.map((o, i) => toListing(o, now, i === 0)).filter((r): r is NonNullable<typeof r> => r !== null);
  return {
    offersFor: jest.fn(async (_c: string, now: number) => listed(rows, now)),
    requestsFor: jest.fn(async (_c: string, now: number) => listed(requests, now)),
    publishSell: jest.fn(async (_c: string, _a: number, _r: number, _k: string) => offer({ is_own: true })),
    publishBuy: jest.fn(async (_c: string, _a: number, _r: number, _k: string) => offer({ is_own: true })),
    newKey: jest.fn(() => 'key-1'),
  };
}

describe('Market screen with a server (ADR-030)', () => {
  it('lists real offers for the chosen currency', async () => {
    const server = fakeServer([offer(), offer({ offer_id: 'b2', desired_rate: '1325.00' })]);
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await flush();
    expect(server.offersFor).toHaveBeenCalledWith('USD', expect.any(Number));
    expect(screen.getByTestId('listing-a1')).toBeTruthy();
    expect(screen.getByTestId('listing-b2')).toBeTruthy();
  });

  it('shows a load error with a retry', async () => {
    const server = fakeServer();
    server.offersFor.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'Can’t reach Xspeeria.'));
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await flush();
    expect(screen.getByTestId('market-load-error')).toHaveTextContent(/Can’t\ reach\ Xspeeria\./);
    await fireEvent.press(screen.getByTestId('market-retry'));
    await flush();
    expect(screen.getByTestId('listing-a1')).toBeTruthy();
  });

  it('offers the identity check when the server says KYC is needed (ADR-040)', async () => {
    const server = fakeServer();
    server.offersFor.mockRejectedValueOnce(
      new ApiError('AUTH_403_KYC_REQUIRED', 403, 'Please complete identity verification before using the marketplace.'),
    );
    const onVerifyIdentity = jest.fn();
    await render(<MarketScreen server={server} onVerifyIdentity={onVerifyIdentity} />);
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await flush();
    await fireEvent.press(screen.getByTestId('market-verify-identity'));
    expect(onVerifyIdentity).toHaveBeenCalled();
  });

  it('shows no identity link for other errors', async () => {
    const server = fakeServer();
    server.offersFor.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'Can’t reach Xspeeria.'));
    await render(<MarketScreen server={server} onVerifyIdentity={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await flush();
    expect(screen.queryByTestId('market-verify-identity')).toBeNull();
  });

  it('opens Take offer for someone else’s offer, but not for your own', async () => {
    const server = fakeServer([offer(), offer({ offer_id: 'own1', is_own: true, desired_rate: '1330.00' })]);
    const onTake = jest.fn();
    await render(<MarketScreen server={server} onTakeListing={onTake} />);
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await flush();
    await fireEvent.press(screen.getByTestId('listing-own1-action'));
    expect(screen.getByTestId('market-notice')).toHaveTextContent(/This is your offer/);
    expect(onTake).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('listing-a1-action'));
    expect(onTake).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), 'buy');
  });

  it('publishes a sell offer with exact strings and one key across retries', async () => {
    const server = fakeServer();
    server.publishSell.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'Can’t reach Xspeeria.'));
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-sell'));
    await fireEvent.changeText(screen.getByTestId('market-amount'), '500');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '1,320.5');
    await fireEvent.press(screen.getByTestId('market-create'));
    await flush();
    expect(screen.getByTestId('market-notice')).toHaveTextContent(/Can’t\ reach\ Xspeeria\./);
    await fireEvent.press(screen.getByTestId('market-create'));
    await flush();
    expect(server.publishSell).toHaveBeenCalledTimes(2);
    expect(server.publishSell).toHaveBeenNthCalledWith(1, 'USD', 50000, 132050, 'key-1');
    expect(server.publishSell).toHaveBeenNthCalledWith(2, 'USD', 50000, 132050, 'key-1');
    expect(server.newKey).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('market-notice')).toHaveTextContent(/is\ live/);
  });

  it('shows the server’s refusal (e.g. below the minimum)', async () => {
    const server = fakeServer();
    server.publishSell.mockRejectedValueOnce(
      new ApiError('VAL_422_AMOUNT_BELOW_MINIMUM', 422, 'The smallest offer is 10.00 USD.'),
    );
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-sell'));
    await fireEvent.changeText(screen.getByTestId('market-amount'), '5');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '1320');
    await fireEvent.press(screen.getByTestId('market-create'));
    await flush();
    expect(screen.getByTestId('market-notice')).toHaveTextContent(/The\ smallest\ offer\ is\ 10\.00\ USD\./);
  });

  it('does not publish a rate above the official rate', async () => {
    const server = fakeServer();
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-sell'));
    await fireEvent.changeText(screen.getByTestId('market-amount'), '500');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '2000');
    await fireEvent.press(screen.getByTestId('market-create'));
    expect(server.publishSell).not.toHaveBeenCalled();
  });

  it('publishes a buy request (ADR-056) and lists requests on the Sell side', async () => {
    const request = offer({
      offer_id: 'r1',
      source_currency: 'NGN',
      target_currency: 'USD',
      source_amount: '1330000.00',
      remaining_amount: '1330000.00',
      desired_rate: '1330.00',
    });
    const server = fakeServer([offer()], [request]);
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await fireEvent.changeText(screen.getByTestId('market-amount'), '1000');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '1330');
    await flush();
    await fireEvent.press(screen.getByTestId('market-create'));
    await flush();
    expect(server.publishBuy).toHaveBeenCalledWith('USD', 100000, 133000, 'key-1');
    expect(screen.getByTestId('market-notice')).toHaveTextContent(/request to buy 1,000\.00 USD/);
    await fireEvent.press(screen.getByTestId('market-sell'));
    await flush();
    expect(server.requestsFor).toHaveBeenCalledWith('USD', expect.any(Number));
    expect(screen.getByTestId('listing-r1')).toHaveTextContent(/1,000 USD/); // shown in USD
  });
});

describe('buy requests as offers paying naira (ADR-056)', () => {
  it('shows the foreign amount still wanted, rounded like the server', () => {
    expect(foreignMinorFor(133000000, '1330.00')).toBe(100000);
    expect(foreignMinorFor(133055, '1330.55')).toBe(100);
    expect(foreignMinorFor(100, 'abc')).toBeNull();
    expect(foreignMinorFor(100, '0')).toBeNull();
    const row = toListing(
      offer({ source_currency: 'NGN', target_currency: 'USD', remaining_amount: '665000.00', desired_rate: '1330.00', is_own: true }),
      NOW,
      true,
    );
    expect(row).toMatchObject({ currency: 'USD', availableMinor: 50000, own: true, meta: 'Your request' });
  });

  it('publishBuy needs a signed-in session and sends nothing without one', async () => {
    const publish = jest.spyOn(offersApi, 'publish');
    await expect(marketServer.publishBuy('USD', 100001, 133055, 'k-1')).rejects.toBeInstanceOf(ApiError);
    expect(publish).not.toHaveBeenCalled();
    publish.mockRestore();
  });
});

describe('My Offers (ADR-030)', () => {
  it('lists offers and withdraws only after a second tap', async () => {
    const source = {
      list: jest.fn(async () => [offer({ is_own: true }), offer({ offer_id: 'w9', status: 'withdrawn' as const, is_own: true })]),
      withdraw: jest.fn(async () => offer({ is_own: true, status: 'withdrawn' as const, version: 2 })),
    };
    await render(<MyOffersScreen source={source} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('my-offer-a1')).toBeTruthy();
    expect(screen.queryByTestId('my-offer-w9-withdraw')).toBeNull();
    await fireEvent.press(screen.getByTestId('my-offer-a1-withdraw'));
    expect(source.withdraw).not.toHaveBeenCalled();
    expect(screen.getByText('Tap again to withdraw')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('my-offer-a1-withdraw'));
    await flush();
    expect(source.withdraw).toHaveBeenCalledWith('a1');
    expect(screen.getByTestId('my-offers-notice')).toHaveTextContent(/Offer\ withdrawn\./);
    expect(screen.queryByTestId('my-offer-a1-withdraw')).toBeNull();
  });

  it('shows an error with retry', async () => {
    const source = {
      list: jest.fn().mockRejectedValueOnce(new ApiError('NETWORK', 0, 'Can’t reach Xspeeria.')).mockResolvedValue([]),
      withdraw: jest.fn(),
    };
    await render(<MyOffersScreen source={source} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByText('Can’t reach Xspeeria.')).toBeTruthy();
  });

  it('refuses without a session and sends nothing', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    serverAuth.useFetch((async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    }) as unknown as typeof fetch);
    await expect(myOffers.list()).rejects.toBeInstanceOf(ApiError); // not signed in
    expect(calls).toHaveLength(0);
    serverAuth.useFetch(undefined);
  });
});

describe('offersApi wire format', () => {
  it('sends strings, the bearer token and the Idempotency-Key', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, status: 201, json: async () => offer() } as unknown as Response;
    }) as unknown as typeof fetch;
    const x = { fetchImpl, baseUrl: 'http://127.0.0.1:8000' };
    await offersApi.publish(
      'acc',
      { source_currency: 'USD', target_currency: 'NGN', source_amount: '500.00', desired_rate: '1320.50' },
      'key-1',
      x,
    );
    await offersApi.listings('acc', 'USD/NGN', 50, 0, x);
    await offersApi.withdraw('acc', 'a/1', x);
    const [publish, listings, withdraw] = calls;
    expect(publish.url).toBe('http://127.0.0.1:8000/api/v1/offers');
    const headers = publish.init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('key-1');
    expect(headers.Authorization).toBe('Bearer acc');
    expect(JSON.parse(String(publish.init.body))).toEqual({
      source_currency: 'USD',
      target_currency: 'NGN',
      source_amount: '500.00',
      desired_rate: '1320.50',
    });
    expect(listings.url).toBe(
      'http://127.0.0.1:8000/api/v1/marketplace/listings?filter%5Bcurrency_pair%5D=USD%2FNGN&limit=50&offset=0',
    );
    expect(withdraw.init.method).toBe('DELETE');
    expect(withdraw.url).toBe('http://127.0.0.1:8000/api/v1/offers/a%2F1');
  });
});
