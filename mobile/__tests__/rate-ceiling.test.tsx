/**
 * The official rate is the maximum (product owner, 2026-10-17; Standing Standards §7.2;
 * ADR-020). Valid: 0 < rate ≤ official. Above: hard block. No floor.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { listingsFor, OFFERS } from '../src/features/market/data';
import { MarketScreen } from '../src/features/market/MarketScreen';
import { ceilingsFromServer, OFFICIAL_RATE, officialRateFor, rateProblem } from '../src/features/market/rateCeiling';
import { tradeStore } from '../src/features/trade/tradeStore';

const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 53 + 7) % 256);
const PAYOUT = { id: 'b3', name: 'David Peters', bank: 'Chase', last4: '4410' };

beforeEach(() => tradeStore.reset());

describe('rate rule', () => {
  const usd = OFFICIAL_RATE.USD;

  it('accepts the official rate and anything below it, with no floor', () => {
    expect(rateProblem('USD', usd)).toBeNull();
    expect(rateProblem('USD', usd - 1)).toBeNull();
    expect(rateProblem('USD', 1)).toBeNull();
  });

  it('blocks a rate above the official rate, even by one kobo', () => {
    expect(rateProblem('USD', usd + 1)).toBe('above-official');
  });

  it('uses the CBN snapshot of 17 Oct 2026 for USD, GBP and EUR', () => {
    expect(OFFICIAL_RATE).toEqual({ USD: 133326, GBP: 176511, EUR: 149120, CAD: 94470 });
    // ADR-101: CAD = USD ceiling ÷ 1.4113 (Bank of Canada, 6 Nov 2026), half to even.
    expect(Math.round(OFFICIAL_RATE.USD / 1.4113)).toBe(OFFICIAL_RATE.CAD);
    expect(rateProblem('GBP', 176511)).toBeNull();
    expect(rateProblem('GBP', 176512)).toBe('above-official');
    expect(rateProblem('EUR', 149120)).toBeNull();
    expect(rateProblem('EUR', 149121)).toBe('above-official');
  });

  it('checks positivity first, and fails closed with no official rate', () => {
    expect(rateProblem('USD', 0)).toBe('not-positive');
    expect(rateProblem('XYZ', 0)).toBe('not-positive');
    expect(rateProblem('XYZ', 100)).toBe('official-unavailable');
    expect(officialRateFor('XYZ')).toBeNull();
  });
});

describe('ceilings from the server (ADR-102)', () => {
  it('reads decimal text exactly, rounding extra decimals down, and skips nonsense', () => {
    expect(ceilingsFromServer([
      { currency: 'USD', max_rate: '1347.29' },
      { currency: 'GBP', max_rate: '1802.9' },
      { currency: 'EUR', max_rate: '1503.549' }, // never rounded up past the server's figure
      { currency: 'CAD', max_rate: 'abc' },
    ])).toEqual({ USD: 134729, GBP: 180290, EUR: 150354 });
  });

  it('uses the live figures when given, and the snapshot otherwise', () => {
    expect(officialRateFor('USD', { USD: 134729 })).toBe(134729);
    expect(officialRateFor('GBP', { USD: 134729 })).toBeNull(); // not in force: no rate accepted
    expect(officialRateFor('USD')).toBe(133326);
    expect(rateProblem('USD', 134729, { USD: 134729 })).toBeNull();
    expect(rateProblem('USD', 134730, { USD: 134729 })).toBe('above-official');
  });
});

describe('listings above the official rate', () => {
  it('every mock listing shown is at or below the official rate', () => {
    for (const code of ['USD', 'GBP', 'EUR']) {
      const shown = listingsFor('buy', code);
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.every((l) => l.rateHundredths <= OFFICIAL_RATE[code])).toBe(true);
    }
  });

  it('a currency with no official rate shows no listings (fail closed)', () => {
    expect(OFFERS.some((l) => l.currency === 'CAD')).toBe(true);
    expect(listingsFor('buy', 'CAD')).toEqual([]);
  });

  it('cannot be accepted above the official rate, even if reached directly', () => {
    const above = { ...OFFERS[0], id: 'above', rateHundredths: OFFICIAL_RATE.USD + 1 };
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
    const onCreate = await fill('buy', '1,333.26');
    expect(screen.getByTestId('market-official').props.children).toMatch(/Official rate \(CBN, 17 Oct 2026\): NGN 1,333.26 per USD/);
    expect(screen.queryByTestId('market-rate-error')).toBeNull();
    await fireEvent.press(screen.getByTestId('market-create'));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ rateHundredths: 133326 }));
  });

  it.each(['buy', 'sell'] as const)('%s: a rate above the official rate is refused', async (side) => {
    const onCreate = await fill(side, '1333.27');
    expect(screen.getByTestId('market-rate-error').props.children).toMatch(/can’t be above the official rate of NGN 1,333.26/);
    expect(screen.getByTestId('market-create').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('market-potential')).toBeNull(); // no "match potential" for a refused rate
    await fireEvent.press(screen.getByTestId('market-create'));
    expect(onCreate).not.toHaveBeenCalled();
  });
});
