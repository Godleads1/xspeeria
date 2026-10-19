/** ADR-045: History rows, Home activity and best prices from real deals. No floats. */
import type { ServerMatch, ServerOffer } from '../src/api/offersApi';
import { bestRates, dealStatus, dealsToActivity, dealsToHistory, toMinor } from '../src/features/history/serverHistory';

const deal = (over: Partial<ServerMatch> = {}): ServerMatch => ({
  match_id: '0b6d1f3e-8a2c-4d5e-9f10-112233445566',
  offer_id: 'o1',
  currency: 'USD',
  counter_currency: 'NGN',
  allocated_amount: '200.00',
  counter_amount: '264100.00',
  agreed_rate: '1320.50',
  accepted_at: '2026-10-19T11:12:00+00:00',
  server_order_key: '1',
  your_role: 'taker',
  you_receive_currency: 'USD',
  you_receive_amount: '200.00',
  preparation_state: 'funding_ready',
  settlement_phase: 'COMPLETED',
  ...over,
});

describe('amounts as text', () => {
  it('turns decimal text into minor units exactly', () => {
    expect(toMinor('264100.00')).toBe(26410000);
    expect(toMinor('0.1')).toBe(10);
    expect(toMinor('1320.5')).toBe(132050);
    expect(() => toMinor('1e3')).toThrow();
    expect(() => toMinor('1.234')).toThrow();
    expect(() => toMinor('-5')).toThrow();
  });
});

describe('deal status', () => {
  it('follows the escrow phase', () => {
    expect(dealStatus({ settlement_phase: 'COMPLETED' })).toBe('completed');
    expect(dealStatus({ settlement_phase: 'CANCELLED' })).toBe('failed');
    expect(dealStatus({ settlement_phase: 'CLOSED_UNWOUND' })).toBe('failed');
    expect(dealStatus({ settlement_phase: null, preparation_state: 'expired' })).toBe('failed');
    expect(dealStatus({ settlement_phase: 'AWAITING_FUNDING' })).toBe('pending');
    expect(dealStatus({ settlement_phase: null, preparation_state: 'awaiting_payout_accounts' })).toBe('pending');
  });
});

describe('History rows', () => {
  it('shows the foreign side, the rate and the date', () => {
    const [h] = dealsToHistory([deal()]);
    expect(h).toMatchObject({
      side: 'buy',
      currency: 'USD',
      amountMinor: 20000,
      rateHundredths: 132050,
      date: '2026-10-19',
      status: 'completed',
    });
  });

  it('works when the offer sells naira, and for the seller of the foreign currency', () => {
    const [h] = dealsToHistory([
      deal({
        currency: 'NGN',
        counter_currency: 'GBP',
        allocated_amount: '176500.00',
        counter_amount: '100.00',
        you_receive_currency: 'NGN',
        you_receive_amount: '176500.00',
      }),
    ]);
    expect(h).toMatchObject({ side: 'sell', currency: 'GBP', amountMinor: 10000 });
  });

  it('skips rows it cannot read rather than showing them wrong', () => {
    expect(dealsToHistory([deal({ counter_amount: undefined }), deal({ agreed_rate: 'abc' })])).toEqual([]);
  });
});

describe('Home', () => {
  it('lists the three newest deals and flags a missing payout account', () => {
    const items = dealsToActivity([
      deal({ match_id: 'a', settlement_phase: null, preparation_state: 'awaiting_payout_accounts', you_chose_payout_accounts: false }),
      deal({ match_id: 'b' }),
      deal({ match_id: 'c', settlement_phase: 'CANCELLED' }),
      deal({ match_id: 'd' }),
    ]);
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(items[0]).toMatchObject({ title: 'NGN → USD', nextAction: 'Add your payout account', statusTone: 'warning' });
    expect(items[1]).toMatchObject({ status: 'Completed', amountMinor: 20000, currency: 'USD' });
    expect(items[2].statusTone).toBe('error');
  });

  it('shows the lowest price to buy each currency, ignoring my own offers', () => {
    const offer = (rate: string, over: Partial<ServerOffer> = {}): ServerOffer => ({
      offer_id: rate,
      source_currency: 'USD',
      target_currency: 'NGN',
      source_amount: '100.00',
      matched_amount: '0.00',
      remaining_amount: '100.00',
      desired_rate: rate,
      status: 'open',
      is_own: false,
      version: 1,
      created_at: '2026-10-19T10:00:00Z',
      ...over,
    });
    const rates = bestRates(
      [offer('1330.00'), offer('1325.50'), offer('1300.00', { is_own: true }), offer('1760.00', { source_currency: 'GBP' })],
      ['USD', 'GBP', 'EUR'],
    );
    expect(rates).toEqual([
      { id: 'ngn-usd', base: 'NGN', quote: 'USD', rate: '1325.50' },
      { id: 'ngn-gbp', base: 'NGN', quote: 'GBP', rate: '1760.00' },
    ]);
  });
});
