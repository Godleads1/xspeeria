/** ADR-107 part 3, step 1: exact money for every currency — 6-decimal rates, whole-unit amounts. */
import {
  ceilingsMicrosFromServer,
  decimalsOf,
  foreignFor,
  formatMinor,
  formatRateMicros,
  minorToText,
  nairaFor,
  onePercent,
  parseAmountMinor,
  parseRateMicros,
  rateMicrosToText,
  rateTextToMicros,
} from '../src/features/market/units';

describe('amounts in each currency’s own decimals', () => {
  it('parses cents where a currency has them and whole units where it does not', () => {
    expect(parseAmountMinor('10.5', 'KES')).toBe(1050);
    expect(parseAmountMinor('1,644.50', 'USD')).toBe(164450);
    expect(parseAmountMinor('500,000', 'UGX')).toBe(500000);
    expect(parseAmountMinor('5000.5', 'UGX')).toBeNull(); // no cents
    expect(parseAmountMinor('5000.', 'XOF')).toBeNull();
    expect(parseAmountMinor('10.505', 'KES')).toBeNull(); // too many decimals
    expect(parseAmountMinor('1,50', 'USD')).toBeNull(); // a misplaced comma is never guessed
    expect(parseAmountMinor('0', 'USD')).toBeNull();
    expect(parseAmountMinor('', 'USD')).toBeNull();
  });

  it('formats with grouping and the currency’s decimals', () => {
    expect(formatMinor(500000, 'UGX')).toBe('500,000');
    expect(formatMinor(164450, 'USD')).toBe('1,644.50');
    expect(formatMinor(5, 'KES')).toBe('0.05');
    expect(minorToText(164450, 'USD')).toBe('1644.50');
    expect(minorToText(2500, 'XOF')).toBe('2500');
    expect(decimalsOf('UGX')).toBe(0);
    expect(decimalsOf('JPY?')).toBe(2);
  });
});

describe('rates to 3 decimals (owner: "3 decimal not 6")', () => {
  it('parses and formats', () => {
    expect(parseRateMicros('0.307')).toBe(307000);
    expect(parseRateMicros('2.273')).toBe(2273000);
    expect(parseRateMicros('1,320.5')).toBe(1320500000);
    expect(parseRateMicros('0.3069')).toBeNull(); // 4 decimals: refused, never rounded
    expect(parseRateMicros('0.306904')).toBeNull();
    expect(parseRateMicros('0')).toBeNull();
    expect(parseRateMicros('1000000')).toBeNull(); // above 999,999.999999
    expect(formatRateMicros(1320500000)).toBe('1,320.50');
    expect(formatRateMicros(307000)).toBe('0.307');
    expect(formatRateMicros(2273000)).toBe('2.273');
    // Server text is read exactly, so a rate stored before the rule still shows its figure.
    expect(formatRateMicros(306904)).toBe('0.306904');
    expect(rateMicrosToText(1320500000)).toBe('1320.50');
    expect(rateMicrosToText(307000)).toBe('0.307');
    expect(rateTextToMicros('0.306904')).toBe(306904);
    expect(rateTextToMicros('1333.26')).toBe(1333260000);
    expect(ceilingsMicrosFromServer([{ currency: 'UGX', max_rate: '0.306' }, { currency: 'X', max_rate: 'bad' }])).toEqual({ UGX: 306000 });
  });
});

describe('conversions, half to even like the server', () => {
  it('naira for a foreign amount', () => {
    expect(nairaFor(20000, 'USD', 1320500000)).toBe(26410000); // $200 at ₦1,320.50 = ₦264,100.00
    expect(nairaFor(500000, 'UGX', 306000)).toBe(15300000); // 500,000 UGX at ₦0.306 = ₦153,000.00
    expect(nairaFor(1_000_000, 'XOF', 2273000)).toBe(227300000); // 1,000,000 XOF at ₦2.273 = ₦2,273,000.00
    expect(nairaFor(1, 'UGX', 305000)).toBe(30); // 0.305 → 30.5 kobo → 30 (half to even)
    expect(nairaFor(1, 'UGX', 315000)).toBe(32); // 31.5 kobo → 32
  });

  it('a foreign amount for naira', () => {
    expect(foreignFor(26410000, 'USD', 1320500000)).toBe(20000);
    expect(foreignFor(15300000, 'UGX', 306000)).toBe(500000);
    expect(foreignFor(100, 'UGX', 0)).toBeNull();
  });

  it('the flat 1% fee', () => {
    expect(onePercent(20000)).toBe(200);
    expect(onePercent(50)).toBe(0); // 0.5 → 0 (half to even)
    expect(onePercent(150)).toBe(2); // 1.5 → 2
  });
});
