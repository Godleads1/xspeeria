/**
 * The official rate is the maximum (product owner, 2026-10-17; Standing Standards §7.2;
 * ADR-020). Valid: 0 < rate ≤ official. Above: hard block. No floor.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { listingsFor, OFFERS } from '../src/features/market/data';
import { MarketScreen } from '../src/features/market/MarketScreen';
import { OFFICIAL_RATE_DEMO, officialRateFor, rateProblem } from '../src/features/market/rateCeiling';
import { tradeStore } from '../src/features/trade/tradeStore';

const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 53 + 7) % 256);
const PAYOUT = { id: 'b3', name: 'David Peters', bank: 'Chase', last4: '4410' };

beforeEach(() => tradeStore.reset());

describe('rate rule', () => {
  const usd = OFFICIAL_RATE_DEMO.USD;

  it('accepts the official rate and anything below it, with no floor', () => {
    expect(rateProblem('USD', usd)).toBeNull();
    expect(rateProblem('USD', usd - 1)).toBeNull();
    expect(rateProblem('USD', 1)).toBeNull();
  });

  it('blocks a rate above the official rate, even by one kobo', () => {
    expect(rateProblem('USD', usd + 1)).toBe('above-official');
  });

  it('checks positivity first, and fails closed with no official rate', () => {
    expect(rateProblem('USD', 0)).toBe('not-positive');
    expect(rateProblem('XYZ', 0)).toBe('not-positive');
    expect(rateProblem('XYZ', 100)).toBe('official-unavailable');
    expect(officialRateFor('XYZ')).toBeNull();
  });
});

describe('listings above the official rate', () => {
  it('are not shown as matches', () => {
    const shown = listingsFor('buy', 'USD');
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((l) => l.rateHundredths <= OFFICIAL_RATE_DEMO.USD)).toBe(true);
    expect(OFFERS.some((l) => l.currency === 'USD' && l.rateHundredths > OFFICIAL_RATE_DEMO.USD)).toBe(true);
  });

  it('cannot be accepted, even if reached directly', () => {
    const above = OFFERS.find((l) => l.currency === 'USD' && l.rateHundredths > OFFICIAL_RATE_DEMO.USD)!;
    expect(() => tradeStore.create({ side: 'buy', listing: above, amountMinor: 100, payout: PAYOUT, now: 0, random: rnd })).toThrow(/official rate/);
  });
});

describe('Market screen', () => {
  async function fill(side: 'buy' | 'sell', rate: string): Promise<jest.Mock> {
    const onCreate = jest.fn();
    await render(<MarketScreen initialSide={side} onCreate={onCreate} />);
    if (side === 'buy') {
      await fireEvent.press(screen.getByTestId('market-currency'));
      await fireEvent.press(screen.getByTestId('currency-USD'));
    }
    await fireEvent.changeText(screen.getByTestId('market-amount'), '100');
    await fireEvent.changeText(screen.getByTestId('market-rate'), rate);
    return onCreate;
  }

  it('shows the official rate and allows a rate equal to it', async () => {
    const onCreate = await fill('buy', '1,899.99');
    expect(screen.getByTestId('market-official').props.children).toMatch(/Official rate \(demo\): NGN 1,899.99 per USD/);
    expect(screen.queryByTestId('market-rate-error')).toBeNull();
    await fireEvent.press(screen.getByTestId('market-create'));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ rateHundredths: 189999 }));
  });

  it.each(['buy', 'sell'] as const)('%s: a rate above the official rate is refused', async (side) => {
    const onCreate = await fill(side, '1900');
    expect(screen.getByTestId('market-rate-error').props.children).toMatch(/can’t be above the official rate of NGN 1,899.99/);
    expect(screen.getByTestId('market-create').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('market-potential')).toBeNull(); // no "match potential" for a refused rate
    await fireEvent.press(screen.getByTestId('market-create'));
    expect(onCreate).not.toHaveBeenCalled();
  });
});
