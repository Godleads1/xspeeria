/** ADR-033: My Deals (server builds). The server is a fake source. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { ServerMatch } from '../src/api/offersApi';
import { MarketScreen } from '../src/features/market/MarketScreen';
import { dealHeadline, MyDealsScreen } from '../src/features/market/MyDealsScreen';
import type { MarketServer } from '../src/features/market/serverOffers';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'k') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const deal = (over: Partial<ServerMatch> = {}): ServerMatch => ({
  match_id: 'm1',
  offer_id: 'o1',
  currency: 'USD',
  counter_currency: 'NGN',
  allocated_amount: '200.00',
  agreed_rate: '1320.50',
  accepted_at: '2026-10-18T16:05:00Z',
  server_order_key: '1',
  your_role: 'taker',
  ...over,
});

const flush = () => act(async () => { await Promise.resolve(); });

describe('deal headline', () => {
  it('says what you get or give, with the exact naira total', () => {
    expect(dealHeadline(deal())).toBe('You get 200.00 USD for NGN 264,100.00');
    expect(dealHeadline(deal({ your_role: 'offer_owner' }))).toBe('You give 200.00 USD for NGN 264,100.00');
  });

  it('leaves out a total it cannot compute exactly', () => {
    expect(dealHeadline(deal({ currency: 'NGN', counter_currency: 'USD', allocated_amount: '500000.00' }))).toBe(
      'You get 500,000.00 NGN',
    );
  });
});

describe('My Deals screen', () => {
  it('lists deals from both sides and says what comes next', async () => {
    const source = { list: jest.fn(async () => [deal(), deal({ match_id: 'm2', your_role: 'offer_owner' as const })]) };
    await render(<MyDealsScreen source={source} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('deal-m1')).toHaveTextContent(/You took an offer/);
    expect(screen.getByTestId('deal-m2')).toHaveTextContent(/Someone took your offer/);
    expect(screen.getByTestId('deal-m1')).toHaveTextContent(/then pay into escrow/);
  });

  it('shows an empty state and a load error', async () => {
    await render(<MyDealsScreen source={{ list: jest.fn(async () => []) }} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByText(/No deals yet/)).toBeTruthy();
    const failing = { list: jest.fn().mockRejectedValue(new ApiError('NETWORK', 0, 'Can’t reach Xspeeria.')) };
    await render(<MyDealsScreen source={failing} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByText('Can’t reach Xspeeria.')).toBeTruthy();
  });
});

describe('Market menu', () => {
  const server: MarketServer = {
    offersFor: jest.fn(async () => []),
    requestsFor: jest.fn(async () => []),
    publishSell: jest.fn(),
    publishBuy: jest.fn(),
    newKey: () => 'k',
  };

  it('offers My Deals in server builds only', async () => {
    const onMenu = jest.fn();
    await render(<MarketScreen server={server} onMenu={onMenu} />);
    await fireEvent.press(screen.getByTestId('market-more'));
    await fireEvent.press(screen.getByTestId('market-menu-deals'));
    expect(onMenu).toHaveBeenCalledWith('deals');
  });

  it('keeps the demo menu unchanged', async () => {
    await render(<MarketScreen onMenu={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('market-more'));
    expect(screen.queryByTestId('market-menu-deals')).toBeNull();
  });
});
