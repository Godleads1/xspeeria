/**
 * 1% coordination fee and split payouts (product owner, 2026-10-17; ADR-021).
 */

import { coordinationFeeMinor } from '../src/features/history/data';
import { OFFERS, REQUESTS } from '../src/features/market/data';
import { allocatePayouts, splitProblem, type PayoutShare } from '../src/features/trade/payoutSplit';
import { DEMO_STEP_MS, FUNDING_WINDOW_MS, toHistoryItem, tradeStore, transferFor } from '../src/features/trade/tradeStore';

const NOW = 1_760_000_000_000;
let seed = 3;
const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => (seed = (seed * 61 + 17) % 256));
const share = (id: string, amountMinor: number): PayoutShare => ({ id, name: 'David Peters', bank: `Bank ${id}`, last4: id.padStart(4, '0'), amountMinor });

beforeEach(() => tradeStore.reset());

describe('1% coordination fee', () => {
  it('is 1% of what each side sends, in integers, rounded half to even', () => {
    expect(coordinationFeeMinor(26500000)).toBe(265000); // ₦265,000.00 → ₦2,650.00
    expect(coordinationFeeMinor(20000)).toBe(200); // $200.00 → $2.00
    expect(coordinationFeeMinor(50)).toBe(0); // 0.5 kobo → 0 (even)
    expect(coordinationFeeMinor(150)).toBe(2); // 1.5 → 2 (even)
    expect(() => coordinationFeeMinor(-1)).toThrow();
  });

  it('buyer pays it in NGN, seller in the foreign currency, on top of the amount', () => {
    expect(transferFor('buy', 'USD', 20000, 1325000)).toEqual({ minor: 26500000 + 265000, currency: 'NGN', feeMinor: 265000 });
    expect(transferFor('sell', 'GBP', 30000, 1760000)).toEqual({ minor: 30300, currency: 'GBP', feeMinor: 300 });
  });

  it('each trade of a multi-offer order has its own fee and its own 5-minute window', () => {
    const a = tradeStore.create({ side: 'buy', listing: OFFERS[0], amountMinor: 20000, payout: { id: 'b3', name: 'D', bank: 'B', last4: '4410' }, now: NOW, random: rnd, orderId: 'o-x' });
    const b = tradeStore.create({ side: 'buy', listing: OFFERS[3], amountMinor: 30000, payout: { id: 'b3', name: 'D', bank: 'B', last4: '4410' }, now: NOW + 1000, random: rnd, orderId: 'o-x' });
    expect(a.feeMinor).toBe(coordinationFeeMinor(26500000));
    expect(b.feeMinor).toBe(coordinationFeeMinor(39750000));
    expect(a.deadline).toBe(NOW + FUNDING_WINDOW_MS);
    expect(b.deadline).toBe(NOW + 1000 + FUNDING_WINDOW_MS);
  });
});

describe('split payouts', () => {
  it('a split must be positive, unique and add up exactly', () => {
    expect(splitProblem(100, [])).toBe('none-selected');
    expect(splitProblem(100, [{ id: 'a', amountMinor: 60 }, { id: 'b', amountMinor: 40 }])).toBeNull();
    expect(splitProblem(100, [{ id: 'a', amountMinor: 60 }, { id: 'b', amountMinor: 30 }])).toBe('under');
    expect(splitProblem(100, [{ id: 'a', amountMinor: 60 }, { id: 'b', amountMinor: 50 }])).toBe('over');
    expect(splitProblem(100, [{ id: 'a', amountMinor: 100 }, { id: 'b', amountMinor: 0 }])).toBe('empty-amount');
    expect(splitProblem(100, [{ id: 'a', amountMinor: null }])).toBe('empty-amount');
    expect(splitProblem(100, [{ id: 'a', amountMinor: 50 }, { id: 'a', amountMinor: 50 }])).toBe('duplicate');
  });

  it('spreads an order-level split over its trades, exactly', () => {
    // Trades receive 250, 250, 250, 250; accounts get 600 and 400.
    const per = allocatePayouts([25000, 25000, 25000, 25000], [share('1', 60000), share('2', 40000)]);
    expect(per.map((t) => t.reduce((s, p) => s + p.amountMinor, 0))).toEqual([25000, 25000, 25000, 25000]);
    expect(per.flat().filter((p) => p.id === '1').reduce((s, p) => s + p.amountMinor, 0)).toBe(60000);
    expect(per.flat().filter((p) => p.id === '2').reduce((s, p) => s + p.amountMinor, 0)).toBe(40000);
    expect(per[2]).toEqual([share('1', 10000), share('2', 15000)]);
    expect(() => allocatePayouts([100], [share('1', 99)])).toThrow();
  });

  it('a trade refuses payouts that do not add up to what is received', () => {
    expect(() =>
      tradeStore.create({ side: 'buy', listing: OFFERS[0], amountMinor: 20000, payouts: [share('1', 10000)], now: NOW, random: rnd }),
    ).toThrow(/add up/);
  });

  it('the bank pays each account, and both sides get a confirmation', () => {
    const t = tradeStore.create({ side: 'sell', listing: REQUESTS[0], amountMinor: 20000, payouts: [share('1', 16000000), share('2', 10600000)], now: NOW, random: rnd });
    tradeStore.markPaid(t.id, NOW);
    for (let i = 1; i <= 3; i++) tradeStore.tick(t.id, NOW + i * DEMO_STEP_MS);
    const labels = tradeStore.get(t.id)!.events.map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining([
      'Paid 160,000.00 NGN to your account ending 0001',
      'Paid 106,000.00 NGN to your account ending 0002',
      'Confirmation sent to you and the Buyer',
    ]));
    expect(toHistoryItem(tradeStore.get(t.id)!).payouts.map((p) => p.amountMinor)).toEqual([16000000, 10600000]);
  });
});
