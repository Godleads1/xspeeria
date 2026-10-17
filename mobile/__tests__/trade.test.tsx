import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ReceiptScreen } from '../src/features/history/ReceiptScreen';
import { OFFERS, REQUESTS } from '../src/features/market/data';
import { BENEFICIARIES } from '../src/features/profile/data';
import { ConfirmTradeSheet } from '../src/features/trade/ConfirmTradeSheet';
import { TradeScreen, countdown } from '../src/features/trade/TradeScreen';
import {
  DEMO_STEP_MS,
  EXTENSION_MS,
  FUNDING_WINDOW_MS,
  ngnFor,
  progressFor,
  toHistoryItem,
  tradeStore,
  transferFor,
} from '../src/features/trade/tradeStore';

const T0 = new Date(2026, 9, 17, 12, 9).getTime();
let seed = 5;
const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => (seed = (seed * 37 + 11) % 256));
const PAYOUT = { id: 'b3', name: 'David Peters', bank: 'Chase', last4: '4410' };
const offer = OFFERS[0]; // 200.00 USD at 1,325.00 (repriced under the CBN official rate, ADR-020)

beforeEach(() => {
  seed = 5;
  tradeStore.reset();
  jest.restoreAllMocks();
});

const make = (side: 'buy' | 'sell' = 'buy', amountMinor = 20000) =>
  tradeStore.create({ side, listing: side === 'buy' ? offer : REQUESTS[0], amountMinor, payout: PAYOUT, now: T0, random: rnd });

describe('trade money (integers only)', () => {
  it('each side transfers its amount plus a 1% fee in its own currency (ADR-021)', () => {
    expect(ngnFor(20000, 189300)).toBe(37860000); // 200.00 USD × 1,893.00 = 378,600.00 NGN (pure arithmetic)
    expect(transferFor('buy', 'USD', 20000, 189300)).toEqual({ minor: 37860000 + 378600, currency: 'NGN', feeMinor: 378600 }); // + 1%
    expect(transferFor('sell', 'USD', 20000, 189300)).toEqual({ minor: 20200, currency: 'USD', feeMinor: 200 });
  });

  it('never resizes an amount silently and refuses bad amounts', () => {
    expect(() => make('buy', offer.availableMinor + 1)).toThrow(/more than this listing/);
    expect(() => make('buy', 0)).toThrow();
    expect(() => make('buy', 1.5)).toThrow();
  });
});

describe('trade phases', () => {
  it('runs accepted → paid → counterparty → released → paid out', () => {
    const t = make();
    expect(t.phase).toBe('awaiting_payment');
    expect(t.deadline).toBe(T0 + FUNDING_WINDOW_MS);
    expect(tradeStore.markPaid(t.id, T0 + 1000)).toBe(true);
    for (const phase of ['awaiting_counterparty', 'releasing', 'completed']) {
      tradeStore.tick(t.id, (tradeStore.get(t.id)?.phaseSince ?? 0) + DEMO_STEP_MS);
      expect(tradeStore.get(t.id)?.phase).toBe(phase);
    }
    const done = tradeStore.get(t.id);
    expect(done?.events.map((e) => e.label)).toEqual([
      'You accepted the offer',
      'You are matched with Seller',
      'Payment made to escrow by you',
      'Payment made to escrow by Seller',
      'Partner bank released the funds',
      'Paid to your account ending 4410',
      'Confirmation sent to you and the Seller',
    ]);
    expect(done && toHistoryItem(done)).toMatchObject({ status: 'completed', payouts: [{ last4: '4410', amountMinor: 20000 }] });
  });

  it('expires when the window ends without payment; paying late is refused', () => {
    const t = make();
    tradeStore.tick(t.id, T0 + FUNDING_WINDOW_MS + 1);
    expect(tradeStore.get(t.id)?.phase).toBe('expired');
    expect(tradeStore.markPaid(t.id, T0 + FUNDING_WINDOW_MS + 2)).toBe(false);
    expect(toHistoryItem(tradeStore.get(t.id)!).status).toBe('failed');
  });

  it('one extension, approved by the other side, adds time', () => {
    const t = make();
    expect(tradeStore.requestExtension(t.id, T0 + 1000)).toBe(true);
    expect(tradeStore.requestExtension(t.id, T0 + 2000)).toBe(false);
    tradeStore.tick(t.id, T0 + 1000 + DEMO_STEP_MS);
    expect(tradeStore.get(t.id)).toMatchObject({ extension: 'approved', deadline: T0 + FUNDING_WINDOW_MS + EXTENSION_MS });
    expect(progressFor(tradeStore.get(t.id)!).map((s) => s.label)).toContain('Extension approved by Seller');
  });

  it('can be cancelled only before paying', () => {
    const a = make();
    expect(tradeStore.cancel(a.id, T0)).toBe(true);
    const b = make();
    tradeStore.markPaid(b.id, T0);
    expect(tradeStore.cancel(b.id, T0)).toBe(false);
  });

  it('sell side: matched with Buyer, user transfers the foreign currency', () => {
    const t = make('sell');
    expect(t).toMatchObject({ payCurrency: 'USD', transferMinor: 20200, feeMinor: 200, counterparty: 'Buyer' });
    expect(t.events[0].label).toBe('You accepted the request');
  });

  it('rating is 1–5 stars and feedback is capped', () => {
    const t = make();
    tradeStore.markPaid(t.id, T0);
    for (let i = 1; i <= 3; i++) tradeStore.tick(t.id, T0 + i * DEMO_STEP_MS);
    expect(tradeStore.rate(t.id, 0, '')).toBe(false);
    expect(tradeStore.rate(t.id, 5, 'x'.repeat(900))).toBe(true);
    expect(tradeStore.get(t.id)?.rating?.feedback).toHaveLength(500);
  });

  it('references use an unambiguous alphabet', () => {
    expect(make().reference).toMatch(/^[2-9A-HJ-NP-Z]{10}$/);
  });
});

describe('Confirm trade sheet', () => {
  const own = BENEFICIARIES.filter((b) => b.name === 'David Peters' && b.currency === 'USD');

  it('shows amount, rate, fee and total before accepting', async () => {
    const onAccept = jest.fn();
    await render(<ConfirmTradeSheet side="buy" requestedMinor={20000} parts={[{ listing: offer, amountMinor: 20000 }]} payoutOptions={own} onAccept={onAccept} onClose={jest.fn()} onAddAccount={jest.fn()} />);
    expect(screen.getByText('200.00 USD')).toBeTruthy();
    expect(screen.getByText('2,650.00 NGN')).toBeTruthy(); // 1% of 265,000.00
    expect(screen.getByText('267,650.00 NGN')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-accept'));
    expect(onAccept).toHaveBeenCalledWith([{ listing: offer, amountMinor: 20000 }], [{ id: 'b3', name: 'David Peters', bank: 'Chase', last4: '4410', amountMinor: 20000 }]);
  });

  it('says plainly when the match fills less than asked', async () => {
    await render(<ConfirmTradeSheet side="buy" requestedMinor={79900} parts={[{ listing: offer, amountMinor: 20000 }]} payoutOptions={own} onAccept={jest.fn()} onClose={jest.fn()} onAddAccount={jest.fn()} />);
    expect(screen.getByTestId('confirm-partial').props.children.join('')).toMatch(/You asked for 799.00 USD.*This offer fills.*200.00 USD/);
  });

  it('cannot accept without an own payout account', async () => {
    const onAccept = jest.fn();
    const onAdd = jest.fn();
    await render(<ConfirmTradeSheet side="buy" requestedMinor={20000} parts={[{ listing: offer, amountMinor: 20000 }]} payoutOptions={[]} onAccept={onAccept} onClose={jest.fn()} onAddAccount={onAdd} />);
    expect(screen.getByTestId('confirm-accept').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('confirm-add-account'));
    expect(onAdd).toHaveBeenCalled();
  });
});

describe('Transaction screens', () => {
  it('shows Figma content, demo warning, countdown and I Have Paid', async () => {
    jest.useFakeTimers();
    const t = make();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let now = T0;
    await render(<TradeScreen id={t.id} onBack={jest.fn()} onReceipt={jest.fn()} onFinish={jest.fn()} onSupport={jest.fn()} now={() => now} />);
    expect(screen.getByText('Transaction In Progress')).toBeTruthy();
    expect(screen.getByText('Please Note:')).toBeTruthy();
    expect(screen.getByTestId('trade-amount').props.children).toBe('NGN 267,650.00');
    expect(screen.getByText(/Do not send real money/)).toBeTruthy();
    expect(screen.getByTestId('trade-expires').props.children.join('')).toBe('Expires in 05:00 mins');

    await fireEvent.press(screen.getByTestId('trade-paid'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Yes, I have paid')?.onPress?.());
    expect(screen.getByTestId('trade-confirming')).toBeTruthy();

    now += DEMO_STEP_MS;
    await act(async () => jest.advanceTimersByTime(1000));
    expect(screen.getByTestId('trade-received')).toBeTruthy();
    jest.useRealTimers();
  });

  it('completed view: receipt link and rating', async () => {
    const t = make();
    tradeStore.markPaid(t.id, T0);
    for (let i = 1; i <= 3; i++) tradeStore.tick(t.id, T0 + i * DEMO_STEP_MS);
    const onReceipt = jest.fn();
    await render(<TradeScreen id={t.id} onBack={jest.fn()} onReceipt={onReceipt} onFinish={jest.fn()} onSupport={jest.fn()} now={() => T0 + 4 * DEMO_STEP_MS} />);
    expect(screen.getByText('Transaction Completed')).toBeTruthy();
    expect(screen.getByTestId('trade-done-text').props.children.join('')).toContain(t.reference);
    await fireEvent.press(screen.getByTestId('trade-receipt'));
    expect(onReceipt).toHaveBeenCalled();
    expect(screen.getByTestId('trade-submit-feedback').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('trade-star-4'));
    await fireEvent.press(screen.getByTestId('trade-submit-feedback'));
    expect(screen.getByTestId('trade-rated')).toBeTruthy();
    expect(tradeStore.get(t.id)?.rating?.stars).toBe(4);
  });

  it('formats countdowns', () => {
    expect(countdown(300000)).toBe('05:00');
    expect(countdown(61000)).toBe('01:01');
    expect(countdown(-5)).toBe('00:00');
  });
});

describe('Sell flow (ADR-015)', () => {
  const ownNgn = BENEFICIARIES.filter((b) => b.name === 'David Peters' && b.currency === 'NGN');

  it('confirm sheet: the seller pays 1% in the currency they send', async () => {
    await render(<ConfirmTradeSheet side="sell" requestedMinor={20000} parts={[{ listing: REQUESTS[0], amountMinor: 20000 }]} payoutOptions={ownNgn} onAccept={jest.fn()} onClose={jest.fn()} onAddAccount={jest.fn()} />);
    expect(screen.getByText('2.00 USD')).toBeTruthy(); // 1% of 200.00 USD
    expect(screen.getByText('202.00 USD')).toBeTruthy();
    expect(screen.getByText('266,000.00 NGN')).toBeTruthy();
  });

  it('sell receipt follows Figma: amount to receive in NGN, amount to pay in USD', async () => {
    const t = make('sell');
    tradeStore.markPaid(t.id, T0);
    for (let i = 1; i <= 3; i++) tradeStore.tick(t.id, T0 + i * DEMO_STEP_MS);
    await render(<ReceiptScreen item={toHistoryItem(tradeStore.get(t.id)!)} onClose={jest.fn()} />);
    expect(screen.getByText('Amount to receive')).toBeTruthy();
    expect(screen.getByText('266,000.00 NGN')).toBeTruthy();
    expect(screen.getByText('Amount to pay')).toBeTruthy();
    expect(screen.getByText('200.00 USD')).toBeTruthy(); // transaction amount
    expect(screen.getByText('2.00 USD')).toBeTruthy(); // 1% fee in USD
    expect(screen.getByText('202.00 USD')).toBeTruthy(); // amount to pay, fee included
    expect(screen.getByText(/266,000 NGN/)).toBeTruthy(); // payout to the NGN account
  });
});
