import { fireEvent, render, screen } from '@testing-library/react-native';

import { MarketScreen } from '../src/features/market/MarketScreen';
import { SelectMatchScreen } from '../src/features/market/SelectMatchScreen';
import { listingsFor } from '../src/features/market/data';
import {
  formatCompact,
  formatHundredths,
  matchPotential,
  parseToHundredths,
  quoteMinor,
} from '../src/features/market/money';

describe('market money helpers (integers only)', () => {
  it('parses typed amounts to minor units without floats', () => {
    expect(parseToHundredths('799')).toBe(79900);
    expect(parseToHundredths('1,644.5')).toBe(164450);
    expect(parseToHundredths(' 0.01 ')).toBe(1);
    // 0.1 + 0.2 style float error must not appear.
    expect(parseToHundredths('0.29')).toBe(29);
  });

  it('rejects malformed, negative, zero and over-precise input', () => {
    for (const bad of ['', 'abc', '-5', '0', '0.00', '1.234', '1e3', '1.2.3', '99999999999999999']) {
      expect(parseToHundredths(bad)).toBeNull();
    }
  });

  it('formats hundredths with grouping', () => {
    expect(formatHundredths(127159000)).toBe('1,271,590.00');
    expect(formatCompact(189300)).toBe('1,893');
    expect(formatCompact(164450)).toBe('1,644.50');
  });

  it('computes the amount to pay exactly (Figma: 799 USD at 1,644 = 1,313,556.00 NGN)', () => {
    expect(quoteMinor(79900, 164400)).toBe(131355600);
    // Half-up rounding at the last kobo: 0.01 USD at 1,644.55 = 16.4455 NGN -> 16.45
    expect(quoteMinor(1, 164455)).toBe(1645);
  });

  it('keeps match potential within 0–100 and directional by side', () => {
    const band = { low: 165089, high: 189999 };
    expect(matchPotential('buy', 189999, band)).toBe(100);
    expect(matchPotential('buy', 100000, band)).toBe(0);
    expect(matchPotential('sell', 165089, band)).toBe(100);
    expect(matchPotential('sell', 200000, band)).toBe(0);
  });
});

describe('Market screen (ADR-005)', () => {
  it('starts on Buy with the Figma empty state and no offers', async () => {
    await render(<MarketScreen onCreate={jest.fn()} />);
    expect(screen.getByText('Create request')).toBeTruthy();
    expect(screen.getByTestId('market-empty')).toBeTruthy();
    expect(screen.getByTestId('market-advert')).toBeTruthy();
  });

  it('keeps Create disabled until currency, amount and rate are valid', async () => {
    const onCreate = jest.fn();
    await render(<MarketScreen onCreate={onCreate} />);
    await fireEvent.press(screen.getByTestId('market-create'));
    expect(onCreate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    await fireEvent.changeText(screen.getByTestId('market-amount'), '799');
    await fireEvent.changeText(screen.getByTestId('market-rate'), '1,644');
    await fireEvent.press(screen.getByTestId('market-create'));

    expect(onCreate).toHaveBeenCalledWith({
      side: 'buy',
      currency: 'USD',
      amountMinor: 79900,
      rateHundredths: 164400,
    });
  });

  it('shows offers, the market band and match potential once a currency is chosen', async () => {
    await render(<MarketScreen onCreate={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('market-currency'));
    await fireEvent.press(screen.getByTestId('currency-USD'));
    expect(screen.getByTestId('market-listings')).toBeTruthy();
    expect(screen.getByText(/1,650\.89 - 1,899\.99 NGN = 1 USD/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('market-rate'), '1,800');
    expect(screen.getByTestId('market-potential')).toBeTruthy();
  });

  it('switches to Sell with Create Offer and buy requests', async () => {
    await render(<MarketScreen onCreate={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('market-sell'));
    expect(screen.getByText('Create Offer')).toBeTruthy();
    expect(screen.getAllByText('Sell').length).toBeGreaterThan(1);
    expect(screen.queryByTestId('market-advert')).toBeNull();
  });

  it('never shows a balance or wallet', async () => {
    await render(<MarketScreen onCreate={jest.fn()} />);
    expect(screen.queryByText(/balance|wallet/i)).toBeNull();
  });
});

describe('Select Match (Figma 106:1150)', () => {
  const request = { side: 'buy' as const, currency: 'USD', amountMinor: 79900, rateHundredths: 164400 };

  it('summarises the request with the exact amount to pay', async () => {
    await render(
      <SelectMatchScreen request={request} onBack={jest.fn()} onCancel={jest.fn()} onTakeListing={jest.fn()} />,
    );
    expect(screen.getByText('1,313,556.00 NGN')).toBeTruthy();
    expect(screen.getAllByTestId(/^listing-o\d$/).length).toBe(listingsFor('buy', 'USD').length);
  });

  it('cancels back to Market', async () => {
    const onCancel = jest.fn();
    await render(
      <SelectMatchScreen request={request} onBack={jest.fn()} onCancel={onCancel} onTakeListing={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId('select-match-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('Market ⋮ menu', () => {
  it('opens My Requests, My Offers, Disputes, AI Rate Forecasting and Cancel', async () => {
    const onMenu = jest.fn();
    await render(<MarketScreen onCreate={jest.fn()} onMenu={onMenu} />);
    await fireEvent.press(screen.getByTestId('market-more'));
    expect(screen.getByText(/My Requests/)).toBeTruthy();
    expect(screen.getByText(/My Offers/)).toBeTruthy();
    expect(screen.getByText('Disputes')).toBeTruthy();
    expect(screen.getByText('AI Rate Forecasting')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('market-menu-disputes'));
    expect(onMenu).toHaveBeenCalledWith('disputes');
  });
});
