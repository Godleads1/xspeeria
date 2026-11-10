/**
 * Market and Take offer with 3-decimal rates (owner 2026-11-10: "3 decimal not 6") and
 * whole-unit amounts (the CFA franc and the Ugandan shilling have no cents, ADR-107).
 * The server checks everything again; these tests cover what the screens accept and send.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ServerMatch, ServerOffer } from '../src/api/offersApi';
import { MarketScreen } from '../src/features/market/MarketScreen';
import { TakeOfferScreen } from '../src/features/market/TakeOfferScreen';
import { toListing, type MarketServer, type TakeSource } from '../src/features/market/serverOffers';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'k') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const flush = () => act(async () => { await Promise.resolve(); });

function offer(over: Partial<ServerOffer> = {}): ServerOffer {
  return {
    offer_id: 'a1',
    source_currency: 'USD',
    target_currency: 'NGN',
    source_amount: '500.00',
    matched_amount: '0.00',
    remaining_amount: '500.00',
    desired_rate: '1320.125',
    status: 'open',
    is_own: false,
    version: 1,
    created_at: new Date(NOW - 5 * 60_000).toISOString(),
    ...over,
  };
}

function fakeServer(rows: ServerOffer[] = [offer()]): jest.Mocked<MarketServer> {
  return {
    offersFor: jest.fn(async (_c: string, now: number) =>
      rows.map((o, i) => toListing(o, now, i === 0)).filter((r): r is NonNullable<typeof r> => r !== null)),
    requestsFor: jest.fn(async (_c: string, _n: number) => []),
    publishSell: jest.fn(async (_c: string, _a: number, _r: number, _k: string) => offer({ is_own: true })),
    publishBuy: jest.fn(async (_c: string, _a: number, _r: number, _k: string) => offer({ is_own: true })),
    newKey: jest.fn(() => 'key-1'),
    ceilings: jest.fn(async () => ({ USD: 1333260 })),
  };
}

describe('Market: rates to 3 decimals', () => {
  it('takes a 3rd decimal and sends it exactly', async () => {
    const server = fakeServer();
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-sell'));
    await flush();
    await fireEvent.changeText(screen.getByTestId('market-amount'), '500');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '1,320.125');
    expect(screen.getByTestId('market-create').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('market-create'));
    await flush();
    expect(server.publishSell).toHaveBeenCalledWith('USD', 50000, 1320125, 'key-1');
    expect(screen.getByTestId('market-notice')).toHaveTextContent(/at NGN 1,320\.125 is live/);
  });

  it('refuses a 4th decimal rather than rounding it', async () => {
    const server = fakeServer();
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-sell'));
    await flush();
    await fireEvent.changeText(screen.getByTestId('market-amount'), '500');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '1320.1255');
    expect(screen.getByTestId('market-create').props.accessibilityState.disabled).toBe(true);
    expect(server.publishSell).not.toHaveBeenCalled();
  });

  it('shows a listing’s 3-decimal rate', async () => {
    const server = fakeServer();
    await render(<MarketScreen server={server} />);
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await flush();
    expect(screen.getByTestId('listing-a1')).toHaveTextContent(/1,320\.125/);
  });
});

const UGX_OFFER = offer({
  offer_id: 'u1',
  source_currency: 'UGX',
  source_amount: '500000',
  remaining_amount: '500000',
  desired_rate: '0.306',
});

const UGX_MATCH: ServerMatch = {
  match_id: 'm-1',
  offer_id: 'u1',
  currency: 'UGX',
  counter_currency: 'NGN',
  allocated_amount: '1000',
  agreed_rate: '0.306',
  accepted_at: '2026-11-10T12:05:00Z',
  server_order_key: '7',
  your_role: 'taker',
};

function takeSource(o: ServerOffer = UGX_OFFER): jest.Mocked<TakeSource> {
  return {
    offer: jest.fn(async (_id: string) => o),
    approve: jest.fn(async (_r: string): Promise<string | null> => 'approval-1'),
    accept: jest.fn(async (_o: string, _a: string, _r: string, _k: string, _t: string | null) => UGX_MATCH),
    newKey: jest.fn(() => 'key-1'),
  };
}

describe('Take offer: Ugandan shillings in whole units', () => {
  it('shows what is left without ".00" and works out the naira at a 3-decimal rate', async () => {
    const src = takeSource();
    await render(<TakeOfferScreen offerId="u1" source={src} onBack={jest.fn()} onDone={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('take-offer')).toHaveTextContent(/500,000 UGX/);
    expect(screen.getByTestId('take-offer')).toHaveTextContent(/NGN 0\.306/);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '1000');
    // 1,000 UGX at ₦0.306 = ₦306.00
    expect(screen.getByTestId('take-ngn')).toHaveTextContent('Works out to NGN 306.00');
  });

  it('refuses cents for a currency that has none', async () => {
    const src = takeSource();
    await render(<TakeOfferScreen offerId="u1" source={src} onBack={jest.fn()} onDone={jest.fn()} />);
    await flush();
    await fireEvent.changeText(screen.getByTestId('take-amount'), '1000.50');
    expect(screen.getByTestId('take-submit').props.accessibilityState.disabled).toBe(true);
  });

  it('sends whole shillings to the server, never "1000.00"', async () => {
    const src = takeSource();
    await render(<TakeOfferScreen offerId="u1" source={src} onBack={jest.fn()} onDone={jest.fn()} />);
    await flush();
    await fireEvent.changeText(screen.getByTestId('take-amount'), '1,000');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledWith('Take 1,000 UGX at NGN 0.306');
    expect(src.accept).toHaveBeenCalledWith('u1', '1000', '0.306', 'key-1', 'approval-1');
  });

  it('“Take all” fills the whole shillings left', async () => {
    const src = takeSource();
    await render(<TakeOfferScreen offerId="u1" source={src} onBack={jest.fn()} onDone={jest.fn()} />);
    await flush();
    await fireEvent.press(screen.getByTestId('take-all'));
    expect(screen.getByTestId('take-amount').props.value).toBe('500000');
  });

  it('a request in shillings shows the foreign amount rounded to whole units', async () => {
    // A buy request pays ₦100.00 at ₦0.306: 326.79… shillings → 327 (half to even, as the server).
    const request = offer({
      offer_id: 'r1',
      source_currency: 'NGN',
      target_currency: 'UGX',
      source_amount: '100.00',
      remaining_amount: '100.00',
      desired_rate: '0.306',
    });
    await render(<TakeOfferScreen offerId="r1" source={takeSource(request)} onBack={jest.fn()} onDone={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('take-offer')).toHaveTextContent(/327 UGX/);
  });
});
