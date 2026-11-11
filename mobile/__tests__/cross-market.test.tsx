/**
 * ADR-111 (owner 2026-11-11): any currency for any other. You pay with the currency of a
 * country where your identity check is approved — detected, never asked — and can't buy it.
 * Rates read quote per 1 base (GHS 11.604 per USD). The server checks all of it again.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import type { ServerMatch, ServerOffer } from '../src/api/offersApi';
import { MarketScreen } from '../src/features/market/MarketScreen';
import { TakeOfferScreen } from '../src/features/market/TakeOfferScreen';
import { ceilingKey, convertAtMilli, convertMinor, quoteOf } from '../src/features/market/pairs';
import { ceilingsFromServer } from '../src/features/market/rateCeiling';
import {
  payChoiceFrom,
  payCurrencyOf,
  toListing,
  type MarketServer,
  type PayChoice,
  type TakeSource,
} from '../src/features/market/serverOffers';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'k') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const NOW = Date.UTC(2026, 10, 11, 9, 0, 0);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function offer(over: Partial<ServerOffer> = {}): ServerOffer {
  return {
    offer_id: 'x1',
    source_currency: 'GHS',
    target_currency: 'USD',
    source_amount: '1150.00',
    matched_amount: '0.00',
    remaining_amount: '1150.00',
    desired_rate: '11.5',
    status: 'open',
    is_own: false,
    version: 1,
    created_at: new Date(NOW - 60_000).toISOString(),
    ...over,
  };
}

describe('pairs (same rules as the server)', () => {
  it('quotes every pair one way: naira per unit, else the weaker per 1 of the stronger', () => {
    expect(quoteOf('USD', 'NGN')).toEqual({ base: 'USD', quote: 'NGN' });
    expect(quoteOf('NGN', 'GHS')).toEqual({ base: 'GHS', quote: 'NGN' });
    expect(quoteOf('GHS', 'USD')).toEqual({ base: 'USD', quote: 'GHS' });
    expect(quoteOf('USD', 'EUR')).toEqual({ base: 'EUR', quote: 'USD' });
    expect(ceilingKey('GHS', 'USD')).toBe('USD/GHS');
    expect(ceilingKey('NGN', 'USD')).toBe('USD');
  });

  it('converts both ways exactly, half to even, whole units for UGX', () => {
    expect(convertMinor(10_000, 'USD', 'GHS', '11.5')).toBe(115_000); // 100 USD → 1,150 GHS
    expect(convertMinor(115_000, 'GHS', 'USD', '11.5')).toBe(10_000);
    expect(convertMinor(10_000, 'USD', 'UGX', '3700.255')).toBe(37_002_600); // 370,025.5 → 370,026 whole
    expect(convertAtMilli(10_000, 'USD', 'GHS', 11_604)).toBe(116_040);
    expect(convertMinor(100, 'USD', 'USD', '1')).toBeNull();
    expect(convertMinor(100, 'USD', 'GHS', '0')).toBeNull();
  });

  it('reads the server limits for pairs without naira', () => {
    const c = ceilingsFromServer(
      [{ currency: 'USD', max_rate: '1333.26' }],
      [{ base: 'USD', quote: 'GHS', max_rate: '11.604' }, { base: 'bad', quote: 'GHS', max_rate: '1' }],
    );
    expect(c).toEqual({ USD: 1_333_260, 'USD/GHS': 11_604 });
  });
});

describe('the pay currency is detected from approved checks', () => {
  const regions = [
    { country: 'US' as const, status: 'approved' as const },
    { country: 'GH' as const, status: 'approved' as const },
    { country: 'NG' as const, status: 'under_review' as const },
    { country: 'ZW' as const, status: 'approved' as const }, // also dollars: listed once
  ];

  it('uses the approved country the phone is in, else the first', () => {
    expect(payChoiceFrom(regions, 'GH')).toEqual({ currencies: ['USD', 'GHS'], here: 'GHS' });
    const travelling = payChoiceFrom(regions, 'NG'); // in Nigeria, not verified there yet
    expect(travelling).toEqual({ currencies: ['USD', 'GHS'], here: null });
    expect(payCurrencyOf(travelling, null)).toBe('USD');
    expect(payCurrencyOf(travelling, 'GHS')).toBe('GHS');
    expect(payCurrencyOf(travelling, 'NGN')).toBe('USD'); // not theirs to choose
    expect(payCurrencyOf({ currencies: [], here: null }, null)).toBeNull();
  });
});

function fakeServer(choice: PayChoice, rows: ServerOffer[] = [offer()]): jest.Mocked<MarketServer> {
  const listed = (request: boolean) =>
    rows.map((o, i) => toListing(o, NOW, i === 0, request)).filter((r): r is NonNullable<typeof r> => r !== null);
  return {
    offersFor: jest.fn(async (_c: string, _n: number, _p?: string) => listed(false)),
    requestsFor: jest.fn(async (_c: string, _n: number, _p?: string) => listed(true)),
    publishSell: jest.fn(async (_c: string, _a: number, _r: number, _k: string, _o?: string) => offer({ is_own: true })),
    publishBuy: jest.fn(async (_c: string, _a: number, _r: number, _k: string, _o?: string) => offer({ is_own: true })),
    newKey: jest.fn(() => 'key-1'),
    ceilings: jest.fn(async () => ({ USD: 1_333_260, GHS: 114_890, 'USD/GHS': 11_604 })),
    payChoice: jest.fn(async () => choice),
  };
}

describe('Market for someone verified in the US', () => {
  it('buys cedis with dollars, never dollars, under the worked-out limit', async () => {
    const server = fakeServer({ currencies: ['USD'], here: 'USD' });
    await render(<MarketScreen server={server} />);
    await flush();
    expect(screen.getByTestId('market-pay')).toHaveTextContent('You pay in USD', { exact: false });
    expect(screen.queryByTestId('market-pay-change')).toBeNull(); // only one
    await fireEvent.press(screen.getByTestId('market-currency'));
    expect(screen.queryByTestId('currency-USD')).toBeNull();
    expect(screen.getByTestId('currency-NGN')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('currency-GHS'));
    await flush();
    expect(server.offersFor).toHaveBeenLastCalledWith('GHS', expect.any(Number), 'USD');
    const row = within(screen.getByTestId('listing-x1'));
    expect(row.getByText(/1,150 GHS/)).toBeTruthy();
    expect(row.getByText('GHS ')).toBeTruthy();
    expect(row.getByText(' /USD')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('market-amount'), '1150');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '11.605');
    expect(screen.getByTestId('market-official')).toHaveTextContent('Maximum rate: GHS 11.604 per USD, worked out from the official naira rates.', { exact: false });
    expect(screen.getByTestId('market-rate-error')).toHaveTextContent('Your rate can’t be above GHS 11.604 per USD.', { exact: false });
    expect(screen.getByTestId('market-create').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('market-rate'), '11.5');
    await fireEvent.press(screen.getByTestId('market-create'));
    await flush();
    expect(server.publishBuy).toHaveBeenCalledWith('GHS', 115_000, 11_500, 'key-1', 'USD');
    expect(screen.getByTestId('market-notice')).toHaveTextContent('Your request to buy 1,150.00 GHS at GHS 11.50 per USD is live.', { exact: false });
  });

  it('sells dollars for naira as before on the Sell side', async () => {
    const server = fakeServer({ currencies: ['USD'], here: 'USD' }, [
      offer({ source_currency: 'NGN', target_currency: 'USD', remaining_amount: '132050.00', desired_rate: '1320.50' }),
    ]);
    await render(<MarketScreen server={server} initialSide="sell" />);
    await flush();
    expect(server.requestsFor).toHaveBeenLastCalledWith('USD', expect.any(Number));
    expect(within(screen.getByTestId('listing-x1')).getByText(/100 USD/)).toBeTruthy();
  });
});

describe('Market for someone verified in two countries', () => {
  it('pays with the first while travelling, and can change it', async () => {
    const server = fakeServer({ currencies: ['USD', 'GHS'], here: null });
    await render(<MarketScreen server={server} />);
    await flush();
    expect(screen.getByTestId('market-pay')).toHaveTextContent('You pay in USD', { exact: false });
    await fireEvent.press(screen.getByTestId('market-pay-change'));
    await fireEvent.press(screen.getByTestId('currency-GHS'));
    expect(screen.getByTestId('market-pay')).toHaveTextContent('You pay in GHS', { exact: false });
    await fireEvent.press(screen.getByTestId('market-currency'));
    expect(screen.queryByTestId('currency-GHS')).toBeNull();
    expect(screen.getByTestId('currency-USD')).toBeTruthy();
  });
});

describe('Market for someone verified in Nigeria', () => {
  it('sells naira on the Sell side: the currency to receive is chosen', async () => {
    const server = fakeServer({ currencies: ['NGN'], here: 'NGN' }, []);
    await render(<MarketScreen server={server} initialSide="sell" />);
    await flush();
    expect(screen.getByTestId('market-empty')).toHaveTextContent('Select the currency to receive to see requests', { exact: false });
    await fireEvent.press(screen.getByTestId('market-currency'));
    expect(screen.queryByTestId('currency-NGN')).toBeNull();
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await flush();
    expect(server.requestsFor).toHaveBeenLastCalledWith('NGN', expect.any(Number), 'USD');
    await fireEvent.changeText(screen.getByTestId('market-amount'), '132050');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '1320.5');
    await fireEvent.press(screen.getByTestId('market-create'));
    await flush();
    expect(server.publishSell).toHaveBeenCalledWith('NGN', 13_205_000, 1_320_500, 'key-1', 'USD');
  });
});

describe('Take offer between two other currencies', () => {
  const MATCH: ServerMatch = {
    match_id: 'm-1',
    offer_id: 'x2',
    currency: 'USD',
    counter_currency: 'GHS',
    allocated_amount: '100.00',
    counter_amount: '1150.00',
    agreed_rate: '11.5',
    accepted_at: '2026-11-11T09:05:00Z',
    server_order_key: '7',
    your_role: 'taker',
  };

  it('shows the pair’s rate and what you pay, and takes the dollars', async () => {
    const src: jest.Mocked<TakeSource> = {
      offer: jest.fn(async (_id: string) => offer({ offer_id: 'x2', source_currency: 'USD', target_currency: 'GHS', remaining_amount: '200.00' })),
      approve: jest.fn(async (_r: string): Promise<string | null> => 'approval'),
      accept: jest.fn(async (_o: string, _a: string, _r: string, _k: string, _t: string | null) => MATCH),
      newKey: jest.fn(() => 'key'),
    };
    await render(<TakeOfferScreen offerId="x2" source={src} onBack={jest.fn()} onDone={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('take-offer')).toHaveTextContent(/GHS 11\.50.*\/USD/);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '100');
    expect(screen.getByTestId('take-ngn')).toHaveTextContent('Works out to 1,150.00 GHS', { exact: false });
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledWith('Take 100.00 USD at GHS 11.50 per USD');
    expect(src.accept).toHaveBeenCalledWith('x2', '100.00', '11.5', 'key', 'approval');
    expect(screen.getByTestId('take-match')).toHaveTextContent(/Rate: GHS 11\.50 \/USD/);
    expect(screen.getByTestId('take-match')).toHaveTextContent(/Works out to 1,150\.00 GHS/);
  });
});
