/**
 * Part 3, step 3 (ADR-107): deal, trade, payout and receipt amounts in a currency with no
 * cents (the CFA franc, the Ugandan shilling) are whole units, and its 1% fee is charged in
 * whole units, half to even, as on the server (`coordination_fee_minor`).
 */
import { coordinationFeeIn } from '../src/features/history/data';
import { totalText } from '../src/features/history/dealTotals';
import { amountText, formatAmount } from '../src/features/market/money';
import { transferFor } from '../src/features/trade/tradeStore';

describe('whole-unit fees', () => {
  it('charges 1% in whole shillings, half to even', () => {
    expect(coordinationFeeIn('UGX', 100_100)).toBe(1_000); // 1% of 1,001 = 10.01 → 10
    expect(coordinationFeeIn('UGX', 105_000)).toBe(1_000); // 1% of 1,050 = 10.5 → 10 (even)
    expect(coordinationFeeIn('UGX', 115_000)).toBe(1_200); // 1% of 1,150 = 11.5 → 12 (even)
    expect(coordinationFeeIn('USD', 100_100)).toBe(1_001); // cents are kept
  });

  it('a seller of shillings pays the amount and a whole-unit fee', () => {
    expect(transferFor('sell', 'UGX', 100_100, 306)).toEqual({ minor: 101_100, currency: 'UGX', feeMinor: 1_000 });
    // A buyer pays naira; the fee stays in kobo.
    expect(transferFor('buy', 'UGX', 100_000, 306)).toEqual({ minor: 30_906, currency: 'NGN', feeMinor: 306 });
  });
});

describe('whole-unit amounts on screens', () => {
  it('shows totals without ".00"', () => {
    expect(totalText({ currency: 'UGX', minor: 50_000_000 })).toBe('UGX 500,000');
    expect(totalText({ currency: 'USD', minor: 50_000 })).toBe('USD 500.00');
  });

  it('never hides a fraction a whole-unit amount should not have', () => {
    expect(formatAmount('XOF', 100_050)).toBe('1,000.50');
    expect(amountText('XOF', 100_000)).toBe('1000');
  });
});
