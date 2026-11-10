/**
 * Rates to 3 decimals (owner 2026-11-10: "3 decimal not 6") and amounts per currency: the
 * CFA franc and the Ugandan shilling have no cents (backend `offer_rules.SCALE`).
 */
import {
  amountDecimals,
  amountText,
  exactRate,
  formatAmount,
  formatRate,
  formatRateCompact,
  parseAmount,
  parseRate,
  quoteMinor,
  rateText,
} from '../src/features/market/money';
import { ceilingsFromServer, rateProblem } from '../src/features/market/rateCeiling';
import { foreignMinorFor } from '../src/features/market/serverOffers';
import { rateMilliOf } from '../src/features/history/serverHistory';

describe('rates to 3 decimals', () => {
  it('parses typed rates into thousandths', () => {
    expect(parseRate('1,320.5')).toBe(1320500);
    expect(parseRate('2.273')).toBe(2273);
    expect(parseRate('0.306')).toBe(306);
    expect(parseRate('1320')).toBe(1320000);
  });

  it('refuses a 4th decimal, never rounding it', () => {
    expect(parseRate('2.2733')).toBeNull();
    expect(parseRate('0.306904')).toBeNull();
    expect(parseRate('0')).toBeNull();
    expect(parseRate('1,50')).toBeNull(); // a decimal comma is never guessed (FIN-07)
    expect(parseRate('')).toBeNull();
  });

  it('shows 2 decimals, and the 3rd only when it is not 0', () => {
    expect(formatRate(1320500)).toBe('1,320.50');
    expect(formatRate(2273)).toBe('2.273');
    expect(formatRate(306)).toBe('0.306');
    expect(formatRate(1320120)).toBe('1,320.12');
    expect(formatRateCompact(1893000)).toBe('1,893');
    expect(formatRateCompact(2273)).toBe('2.273');
    expect(rateText(1320500)).toBe('1320.50');
    expect(rateText(2273)).toBe('2.273');
  });

  it('reads server rates exactly, or not at all', () => {
    expect(exactRate('1320.50')).toBe(1320500);
    expect(exactRate('2.273')).toBe(2273);
    expect(exactRate('0.306904')).toBeNull(); // stored before the rule: the caller keeps the text
  });

  it('works out the naira exactly, half to even', () => {
    // 100.00 USD at ₦1,320.505 = ₦132,050.50
    expect(quoteMinor(10000, 1320505)).toBe(13205050);
    // 1,000,000 XOF at ₦2.273 = ₦2,273,000.00
    expect(quoteMinor(100_000_000, 2273)).toBe(227300000);
    // 1 cent at ₦0.005 = 0.005 kobo → 0 (half to even)
    expect(quoteMinor(1, 500)).toBe(0);
  });

  it('checks the limit in thousandths; server limits are rounded down', () => {
    const live = ceilingsFromServer([
      { currency: 'UGX', max_rate: '0.306' },
      { currency: 'XOF', max_rate: '2.273' },
      { currency: 'USD', max_rate: '1333.26' },
      { currency: 'KES', max_rate: '10.2599' }, // more decimals than expected: cut down
    ]);
    expect(live).toEqual({ UGX: 306, XOF: 2273, USD: 1333260, KES: 10259 });
    expect(rateProblem('UGX', 306, live)).toBeNull();
    expect(rateProblem('UGX', 307, live)).toBe('above-official');
    expect(rateProblem('XOF', 2273, live)).toBeNull();
    expect(rateProblem('XOF', 2274, live)).toBe('above-official');
  });

  it('keeps an older History rate rather than dropping the deal', () => {
    expect(rateMilliOf('1320.50')).toBe(1320500);
    expect(rateMilliOf('0.306904')).toBe(306);
    expect(() => rateMilliOf('abc')).toThrow();
  });
});

describe('amounts per currency', () => {
  it('knows which currencies have no cents', () => {
    expect(amountDecimals('UGX')).toBe(0);
    expect(amountDecimals('XOF')).toBe(0);
    expect(amountDecimals('USD')).toBe(2);
    expect(amountDecimals('KES')).toBe(2);
  });

  it('takes whole numbers only for UGX and XOF', () => {
    expect(parseAmount('UGX', '500,000')).toBe(50_000_000);
    expect(parseAmount('UGX', '500000.50')).toBeNull();
    expect(parseAmount('XOF', '1000.')).toBeNull();
    expect(parseAmount('USD', '250.50')).toBe(25050);
  });

  it('shows and sends them without ".00"', () => {
    expect(formatAmount('UGX', 50_000_000)).toBe('500,000');
    expect(amountText('XOF', 100_000)).toBe('1000');
    expect(formatAmount('USD', 25050)).toBe('250.50');
    expect(amountText('GBP', 25050)).toBe('250.50');
  });

  it('works out a request’s foreign amount in whole shillings', () => {
    // ₦153,000.00 at ₦0.306 = 500,000 UGX exactly
    expect(foreignMinorFor(15_300_000, '0.306', 'UGX')).toBe(50_000_000);
    // ₦100.00 at ₦0.306 = 326.797… → 327 UGX
    expect(foreignMinorFor(10_000, '0.306', 'UGX')).toBe(32_700);
    // The same in dollars keeps cents: ₦1,320.50 at ₦1,320.50 = 1.00 USD
    expect(foreignMinorFor(132_050, '1320.50', 'USD')).toBe(100);
  });
});
