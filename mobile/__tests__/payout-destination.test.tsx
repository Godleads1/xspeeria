/**
 * Payout Destination (Figma; ADR-022): own accounts only, amounts add up exactly, no
 * balance wording, last 4 digits only, new accounts paid at once (DEC-044), card not available.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { session } from '../src/features/auth/session';
import { OFFERS } from '../src/features/market/data';
import { beneficiaryStore } from '../src/features/profile/beneficiaryStore';
import type { Beneficiary } from '../src/features/profile/data';
import { orderDraft } from '../src/features/trade/orderDraft';
import { PayoutDestinationScreen, assignmentMessage, type Recipient } from '../src/features/trade/PayoutDestinationScreen';
import { orderReceiveMinor, placeOrder, receiveCurrency } from '../src/features/trade/placeOrder';
import { DEMO_STEP_MS, tradeStore } from '../src/features/trade/tradeStore';

const NOW = 1_760_000_000_000;
let seed = 5;
const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => (seed = (seed * 71 + 13) % 256));
const ACC = (id: string, last4: string): Beneficiary => ({ id, name: 'David Peters', currency: 'USD', bank: `Bank ${id}`, accountLast4: last4, status: 'verified' });
const saved = [ACC('a', '1111'), ACC('b', '2222')];
const R = (id: string, amountMinor: number, extra: Partial<Recipient> = {}): Recipient => ({
  key: id, id, name: 'David Peters', bank: `Bank ${id}`, last4: id.padStart(4, '0'), amountMinor, isNew: false, save: false, ...extra,
});

function screenWith(onContinue = jest.fn(), accounts = saved): Promise<unknown> {
  return render(
    <PayoutDestinationScreen totalMinor={50000} currency="USD" ownerName="David Peters" savedAccounts={accounts} onBack={jest.fn()} onContinue={onContinue} />,
  );
}

beforeEach(() => {
  tradeStore.reset();
  beneficiaryStore.reset();
  orderDraft.reset();
});

describe('Payout Destination screen', () => {
  it('shows the total, Fund Card, Fund Account and saved own accounts; Continue starts disabled', async () => {
    await screenWith();
    expect(screen.getByTestId('payout-total').props.children).toBe('500.00 USD');
    expect(screen.getByText('Fund Card')).toBeTruthy();
    expect(screen.getByText('Fund Account')).toBeTruthy();
    expect(screen.getByTestId('payout-saved-a')).toBeTruthy();
    expect(screen.getByTestId('payout-message').props.children).toBe('Add an account to receive 500.00 USD.');
    expect(screen.getByTestId('payout-continue').props.accessibilityState.disabled).toBe(true);
  });

  it('never uses balance or wallet wording, and shows last 4 digits only', async () => {
    await screenWith();
    await fireEvent.press(screen.getByTestId('payout-saved-a'));
    await fireEvent.press(screen.getByTestId('payout-new'));
    const all = JSON.stringify(screen.toJSON());
    expect(all).not.toMatch(/balance|wallet/i);
    expect(all).toMatch(/•••• 1111/);
  });

  it('one saved account takes the full amount; Continue sends it', async () => {
    const onContinue = jest.fn();
    await screenWith(onContinue);
    await fireEvent.press(screen.getByTestId('payout-saved-a'));
    expect(screen.getByTestId('payout-amount-a').props.children).toBe('500.00 USD');
    expect(screen.queryByTestId('payout-message')).toBeNull();
    await fireEvent.press(screen.getByTestId('payout-continue'));
    expect(onContinue).toHaveBeenCalledWith([expect.objectContaining({ id: 'a', amountMinor: 50000, isNew: false })]);
  });

  it('split across two accounts (230 + 270), as in Figma', async () => {
    const onContinue = jest.fn();
    await screenWith(onContinue);
    await fireEvent.press(screen.getByTestId('payout-saved-a'));
    // Change a's amount to 230, which leaves 270 for b.
    await fireEvent.press(screen.getByTestId('payout-menu-a'));
    await fireEvent.press(screen.getByText('Change amount'));
    await fireEvent.changeText(screen.getByTestId('payout-amount-input'), '230');
    await fireEvent.press(screen.getByTestId('payout-amount-save'));
    expect(screen.getByTestId('payout-message').props.children).toBe('Left to assign: 270.00 USD.');
    await fireEvent.press(screen.getByTestId('payout-saved-b'));
    expect(screen.getByTestId('payout-amount-b').props.children).toBe('270.00 USD');
    await fireEvent.press(screen.getByTestId('payout-continue'));
    expect(onContinue).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a', amountMinor: 23000 }),
      expect.objectContaining({ id: 'b', amountMinor: 27000 }),
    ]);
  });

  it('an amount above what is left is refused', async () => {
    await screenWith();
    await fireEvent.press(screen.getByTestId('payout-saved-a'));
    await fireEvent.press(screen.getByTestId('payout-menu-a'));
    await fireEvent.press(screen.getByText('Change amount'));
    await fireEvent.changeText(screen.getByTestId('payout-amount-input'), '600');
    await fireEvent.press(screen.getByTestId('payout-amount-save'));
    expect(screen.getByTestId('payout-amount-error').props.children).toMatch(/At most 500.00 USD/);
  });

  it('removing an account frees its amount', async () => {
    await screenWith();
    await fireEvent.press(screen.getByTestId('payout-saved-a'));
    await fireEvent.press(screen.getByTestId('payout-menu-a'));
    await fireEvent.press(screen.getByText('Remove'));
    expect(screen.queryByTestId('payout-recipient-a')).toBeNull();
    expect(screen.getByTestId('payout-continue').props.accessibilityState.disabled).toBe(true);
  });

  it('new recipient: validated bank details, own name only, code-confirmed, last 4 kept', async () => {
    const onContinue = jest.fn();
    await screenWith(onContinue, []);
    expect(screen.getByTestId('payout-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('payout-new'));
    expect(screen.getByTestId('payout-new-left').props.children).toBe('Left to assign: 500.00 USD');
    await fireEvent.press(screen.getByTestId('payout-new-add'));
    expect(screen.getByTestId('error-routingNumber')).toBeTruthy(); // nothing typed yet

    await fireEvent.changeText(screen.getByTestId('field-routingNumber'), '021000021');
    await fireEvent.changeText(screen.getByTestId('field-bankName'), 'Chase');
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '000123456789');
    await fireEvent.press(screen.getByTestId('field-accountType'));
    await fireEvent.press(screen.getByText('Checking'));
    await fireEvent(screen.getByTestId('payout-new-full'), 'valueChange', true);
    await fireEvent(screen.getByTestId('payout-new-save'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('payout-new-add'));

    expect(screen.getByTestId('payout-hold-new-1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('payout-continue'));
    const sent = onContinue.mock.calls[0][0][0] as Recipient;
    expect(sent).toMatchObject({ name: 'David Peters', bank: 'Chase', last4: '6789', amountMinor: 50000, isNew: true, save: true });
    expect(JSON.stringify(sent)).not.toMatch(/000123456789/);
  });

  it('a new recipient cannot take more than is left', async () => {
    await screenWith();
    await fireEvent.press(screen.getByTestId('payout-saved-a')); // takes all 500
    await fireEvent.press(screen.getByTestId('payout-new'));
    await fireEvent.changeText(screen.getByTestId('payout-new-amount'), '10');
    await fireEvent.press(screen.getByTestId('payout-new-add'));
    expect(screen.getByTestId('payout-new-amount-error').props.children).toMatch(/Nothing is left to assign/);
  });

  it('Fund Card explains cards are not available', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await screenWith();
    await fireEvent.press(screen.getByTestId('payout-card'));
    expect(alert).toHaveBeenCalledWith('Cards aren’t available yet', expect.any(String));
    alert.mockRestore();
  });

  it('assignment message covers empty, under, over and exact', () => {
    expect(assignmentMessage(100, [], 'USD')).toMatch(/Add an account/);
    expect(assignmentMessage(10000, [R('a', 4000)], 'USD')).toBe('Left to assign: 60.00 USD.');
    expect(assignmentMessage(10000, [R('a', 12000)], 'USD')).toBe('That is 20.00 USD more than you receive.');
    expect(assignmentMessage(10000, [R('a', 10000)], 'USD')).toBeNull();
  });
});

describe('placing the order', () => {
  const draft = { side: 'buy' as const, requestedMinor: 70000, parts: [{ listing: OFFERS[0], amountMinor: 20000 }, { listing: OFFERS[3], amountMinor: 50000 }] };

  it('creates one trade per listing, paying the accounts exactly', () => {
    expect(orderReceiveMinor(draft)).toBe(70000);
    expect(receiveCurrency(draft)).toBe('USD');
    const res = placeOrder({ draft, recipients: [R('a', 23000), R('b', 47000)], now: NOW, random: rnd });
    expect(res).toMatchObject({ failed: 0 });
    const trades = res.created.map((id) => tradeStore.get(id)!);
    expect(trades.map((t) => t.payouts.reduce((s, p) => s + p.amountMinor, 0))).toEqual([20000, 50000]);
    expect(new Set(trades.map((t) => t.orderId)).size).toBe(1);
  });

  it('refuses a split that does not add up (nothing created)', () => {
    expect(() => placeOrder({ draft, recipients: [R('a', 1000)], now: NOW, random: rnd })).toThrow(/add up/);
    expect(tradeStore.all()).toHaveLength(0);
  });

  it('a listing taken meanwhile fails alone; the rest go ahead', () => {
    tradeStore.create({ side: 'buy', listing: OFFERS[0], amountMinor: 20000, payout: { id: 'x', name: 'D', bank: 'B', last4: '0000' }, now: NOW, random: rnd });
    const res = placeOrder({ draft, recipients: [R('a', 70000)], now: NOW, random: rnd });
    expect(res.failed).toBe(1);
    expect(res.created).toHaveLength(1);
  });

  it('saves a new account only when asked, as pending', () => {
    const before = beneficiaryStore.get().length;
    placeOrder({ draft, recipients: [R('new-1', 30000, { isNew: true, save: true, last4: '6789', bank: 'Chase' }), R('new-2', 40000, { isNew: true })], now: NOW, random: rnd });
    const added = beneficiaryStore.get().slice(before);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ bank: 'Chase', accountLast4: '6789', status: 'pending', currency: 'USD' });
  });

  it('a new account is paid at once (DEC-044)', () => {
    const one = { side: 'buy' as const, requestedMinor: 20000, parts: [{ listing: OFFERS[0], amountMinor: 20000 }] };
    const [id] = placeOrder({ draft: one, recipients: [R('new-1', 20000, { isNew: true, last4: '6789' })], now: NOW, random: rnd }).created;
    tradeStore.markPaid(id, NOW);
    for (let i = 1; i <= 3; i++) tradeStore.tick(id, NOW + i * DEMO_STEP_MS);
    expect(tradeStore.get(id)!.events.map((e) => e.label)).toContain('200.00 USD to your new account ending 6789');
  });

  it('the order draft is cleared on log-out', () => {
    orderDraft.set(draft);
    session.logOut();
    expect(orderDraft.get()).toBeNull();
  });
});
