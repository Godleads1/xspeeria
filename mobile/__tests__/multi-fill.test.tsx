/**
 * One request filled from several listings (product owner, 2026-10-17; ADR-019).
 * "User A may need $1000 and 4 users have $250."
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { COORDINATION_FEE_KOBO } from '../src/features/history/data';
import type { Listing } from '../src/features/market/data';
import { SelectMatchScreen } from '../src/features/market/SelectMatchScreen';
import { BENEFICIARIES } from '../src/features/profile/data';
import { ConfirmTradeSheet } from '../src/features/trade/ConfirmTradeSheet';
import { addToPlan, planTotals, plannedMinor, removeFromPlan, type FillPlan } from '../src/features/trade/fillPlan';
import { TradeScreen } from '../src/features/trade/TradeScreen';
import { tradeStore } from '../src/features/trade/tradeStore';

const NOW = 1_760_000_000_000;
let seed = 9;
const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => (seed = (seed * 29 + 13) % 256));
const own = BENEFICIARIES.filter((b) => b.name === 'David Peters' && b.currency === 'USD');
const PAYOUT = { id: 'b3', name: 'David Peters', bank: 'Chase', last4: '4410' };

// Four sellers with 250.00 USD each, at slightly different rates.
const SELLERS: readonly Listing[] = [132500, 132700, 133000, 133326].map((rate, i) => ({
  id: `s${i + 1}`,
  currency: 'USD',
  availableMinor: 25000,
  rateHundredths: rate,
  meta: `User ${i + 1}`,
}));
const remaining = (l: Listing): number => tradeStore.remainingMinor(l);

beforeEach(() => {
  seed = 9;
  tradeStore.reset();
});

describe('fill plan', () => {
  it('fills 1,000 USD from four 250 USD listings, each an explicit part', () => {
    let plan: FillPlan = [];
    for (const l of SELLERS) plan = addToPlan(plan, l, 100000, remaining);
    expect(plan.map((p) => p.amountMinor)).toEqual([25000, 25000, 25000, 25000]);
    expect(plannedMinor(plan)).toBe(100000);
  });

  it('takes only what is still needed from the last listing, and nothing once full', () => {
    let plan: FillPlan = [];
    plan = addToPlan(plan, SELLERS[0], 30000, remaining);
    plan = addToPlan(plan, SELLERS[1], 30000, remaining);
    expect(plan.map((p) => p.amountMinor)).toEqual([25000, 5000]);
    expect(addToPlan(plan, SELLERS[2], 30000, remaining)).toBe(plan); // already covered
  });

  it('never adds the same listing twice, a sold-out listing, or another currency', () => {
    let plan: FillPlan = addToPlan([], SELLERS[0], 100000, remaining);
    expect(addToPlan(plan, SELLERS[0], 100000, remaining)).toBe(plan);
    expect(addToPlan(plan, { ...SELLERS[1], currency: 'EUR' }, 100000, remaining)).toBe(plan);
    tradeStore.create({ side: 'buy', listing: SELLERS[1], amountMinor: 25000, payout: PAYOUT, now: NOW, random: rnd });
    expect(addToPlan(plan, SELLERS[1], 100000, remaining)).toBe(plan);
    plan = removeFromPlan(plan, SELLERS[0].id);
    expect(plan).toEqual([]);
  });

  it('totals use each listing’s own rate and one fee per trade (integers)', () => {
    let plan: FillPlan = [];
    for (const l of SELLERS) plan = addToPlan(plan, l, 100000, remaining);
    const t = planTotals('buy', plan);
    // 250 × (1,325 + 1,327 + 1,330 + 1,333.26) = 1,328,815.00 NGN
    expect(t.ngnMinor).toBe(132881500);
    expect(t.feeKobo).toBe(4 * COORDINATION_FEE_KOBO);
    expect(t.transferMinor).toBe(132881500 + 4 * COORDINATION_FEE_KOBO);
    expect(t.payCurrency).toBe('NGN');
    expect(planTotals('sell', plan)).toMatchObject({ feeKobo: null, transferMinor: 100000, payCurrency: 'USD' });
  });
});

describe('Select Match with a selection', () => {
  const request = { side: 'buy' as const, currency: 'USD', amountMinor: 100000, rateHundredths: 133000 };

  it('shows what is taken from each listing and the progress', async () => {
    const plan: FillPlan = [{ listing: { ...SELLERS[0], id: 'o1' }, amountMinor: 20000 }];
    const onReview = jest.fn();
    await render(
      <SelectMatchScreen request={request} plan={plan} onBack={jest.fn()} onCancel={jest.fn()} onToggleListing={jest.fn()} onReview={onReview} />,
    );
    expect(screen.getByTestId('listing-o1-taking').props.children).toBe('Taking 200.00 USD');
    expect(screen.getByTestId('select-match-selected').props.children).toBe('Selected 200.00 of 1,000.00 USD from 1 offer');
    await fireEvent.press(screen.getByTestId('select-match-review'));
    expect(onReview).toHaveBeenCalled();
  });

  it('a listing with nothing left is shown as taken and cannot be tapped', async () => {
    const onToggle = jest.fn();
    await render(
      <SelectMatchScreen request={request} remainingOf={(l) => (l.id === 'o1' ? 0 : l.availableMinor)} onBack={jest.fn()} onCancel={jest.fn()} onToggleListing={onToggle} onReview={jest.fn()} />,
    );
    const action = screen.getByTestId('listing-o1-action');
    expect(action.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(action);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('Confirm sheet for several trades', () => {
  function fourParts(): FillPlan {
    let plan: FillPlan = [];
    for (const l of SELLERS) plan = addToPlan(plan, l, 100000, remaining);
    return plan;
  }

  it('lists each part, a fee per trade and the total, then accepts them together', async () => {
    const onAccept = jest.fn();
    const plan = fourParts();
    await render(<ConfirmTradeSheet side="buy" requestedMinor={100000} parts={plan} payoutOptions={own} onAccept={onAccept} onClose={jest.fn()} onAddAccount={jest.fn()} />);
    expect(screen.getByText('Confirm 4 trades')).toBeTruthy();
    expect(screen.getByText('1,000.00 USD')).toBeTruthy();
    expect(screen.getByText('Coordination fee (4 × 375.00)')).toBeTruthy();
    expect(screen.getByText('1,500.00 NGN')).toBeTruthy();
    expect(screen.getByText('1,330,315.00 NGN')).toBeTruthy(); // 1,328,815.00 + 1,500
    expect(screen.queryByTestId('confirm-partial')).toBeNull();
    await fireEvent.press(screen.getByTestId('confirm-accept'));
    expect(onAccept).toHaveBeenCalledWith(plan, own[0]);
  });

  it('says plainly when the parts fill less than asked', async () => {
    const plan = fourParts().slice(0, 3);
    await render(<ConfirmTradeSheet side="buy" requestedMinor={100000} parts={plan} payoutOptions={own} onAccept={jest.fn()} onClose={jest.fn()} onAddAccount={jest.fn()} />);
    expect(screen.getByTestId('confirm-partial').props.children.join('')).toMatch(/You asked for 1,000.00 USD.*These 3 offers fill.*750.00 USD/);
  });

  it('refuses to accept if a listing was taken meanwhile — never shrinks a part silently', async () => {
    const plan = fourParts();
    tradeStore.create({ side: 'buy', listing: SELLERS[2], amountMinor: 10000, payout: PAYOUT, now: NOW, random: rnd });
    const onAccept = jest.fn();
    await render(<ConfirmTradeSheet side="buy" requestedMinor={100000} parts={plan} payoutOptions={own} onAccept={onAccept} onClose={jest.fn()} onAddAccount={jest.fn()} />);
    expect(screen.getByTestId('confirm-stale')).toBeTruthy();
    expect(screen.getByTestId('confirm-accept').props.accessibilityState.disabled).toBe(true);
  });
});

describe('Trades of one order', () => {
  it('each trade links to the others in its order', async () => {
    const orderId = 'o-test';
    const made = SELLERS.slice(0, 3).map((l) =>
      tradeStore.create({ side: 'buy', listing: l, amountMinor: 25000, payout: PAYOUT, now: NOW, random: rnd, orderId }),
    );
    const onOpen = jest.fn();
    await render(
      <TradeScreen id={made[0].id} onBack={jest.fn()} onReceipt={jest.fn()} onFinish={jest.fn()} onSupport={jest.fn()} onOpenTrade={onOpen} now={() => NOW} />,
    );
    expect(screen.getByText('This order has 3 trades. Pay each one separately.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`trade-order-${made[1].id}`));
    expect(onOpen).toHaveBeenCalledWith(made[1].id);
    expect(screen.queryByTestId(`trade-order-${made[0].id}`)).toBeNull();
  });

  it('a single trade shows no order strip', async () => {
    const t = tradeStore.create({ side: 'buy', listing: SELLERS[0], amountMinor: 25000, payout: PAYOUT, now: NOW, random: rnd });
    await render(<TradeScreen id={t.id} onBack={jest.fn()} onReceipt={jest.fn()} onFinish={jest.fn()} onSupport={jest.fn()} now={() => NOW} />);
    expect(screen.queryByTestId('trade-order')).toBeNull();
  });
});
