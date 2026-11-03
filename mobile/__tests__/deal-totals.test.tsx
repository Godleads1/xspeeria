/** ADR-097: totals of completed deals at the top of History (never on Home), never a balance. */

import { render, screen } from '@testing-library/react-native';

import type { ServerMatch } from '../src/api/offersApi';
import { dealTotals, totalText } from '../src/features/history/dealTotals';
import { HistoryScreen } from '../src/features/history/HistoryScreen';

function deal(over: Partial<ServerMatch>): ServerMatch {
  return {
    match_id: 'm-' + Math.random().toString(36).slice(2),
    offer_id: 'o-1',
    currency: 'USD',
    counter_currency: 'NGN',
    allocated_amount: '100.00',
    counter_amount: '160000.00',
    agreed_rate: '1600.00',
    accepted_at: '2026-11-01T10:00:00Z',
    server_order_key: '1',
    your_role: 'taker',
    you_receive_currency: 'USD',
    you_receive_amount: '100.00',
    settlement_phase: 'COMPLETED',
    ...over,
  };
}

describe('deal totals', () => {
  it('adds up completed deals only, per currency, in minor units', () => {
    const t = dealTotals([
      deal({}),
      deal({ allocated_amount: '50.25', counter_amount: '80400.00', you_receive_amount: '50.25' }),
      // I sell dollars here: I receive naira and send dollars.
      deal({ your_role: 'offer_owner', you_receive_currency: 'NGN', you_receive_amount: '32000.00', allocated_amount: '20.00', counter_amount: '32000.00' }),
      deal({ settlement_phase: 'AWAITING_FUNDING' }), // not completed: not counted
      deal({ settlement_phase: 'CANCELLED' }),
      deal({ settlement_phase: null }),
    ]);
    expect(t.completed).toBe(3);
    expect(t.received.map(totalText)).toEqual(['NGN 32,000.00', 'USD 150.25']);
    expect(t.sent.map(totalText)).toEqual(['NGN 240,400.00', 'USD 20.00']);
  });

  it('skips a malformed row instead of guessing', () => {
    const t = dealTotals([deal({ you_receive_amount: '1e5' }), deal({ counter_amount: null }), deal({})]);
    expect(t.completed).toBe(1);
    expect(t.received.map(totalText)).toEqual(['USD 100.00']);
  });

  it('nothing completed: no totals', () => {
    expect(dealTotals([deal({ settlement_phase: 'RELEASING' })])).toEqual({ completed: 0, received: [], sent: [] });
  });
});

describe('History shows them, labelled as deal history', () => {
  it('above the list, with the "not money held" note', async () => {
    await render(<HistoryScreen items={[]} totals={dealTotals([deal({})])} />);
    expect(screen.getByTestId('history-totals')).toBeTruthy();
    expect(screen.getByText('1 completed deal')).toBeTruthy();
    expect(screen.getByTestId('history-totals-received').props.children).toBe('USD 100.00');
    expect(screen.getByTestId('history-totals-sent').props.children).toBe('NGN 160,000.00');
    expect(screen.getByText('Deal history, not money held by Xspeeria. Fees are not included.')).toBeTruthy();
  });

  it('not before the first completed deal, and not in the demo', async () => {
    await render(<HistoryScreen items={[]} totals={dealTotals([])} />);
    expect(screen.queryByTestId('history-totals')).toBeNull();
    await render(<HistoryScreen items={[]} />);
    expect(screen.queryByTestId('history-totals')).toBeNull();
  });
});
