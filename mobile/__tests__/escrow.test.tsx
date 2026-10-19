/**
 * ADR-037: the escrow steps of a deal (server builds). The server is a fake `EscrowSource`;
 * its money rules are tested on the server.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { ServerSettlement } from '../src/api/escrowApi';
import type { ServerMatch } from '../src/api/offersApi';
import { countdown, EscrowScreen, escrowStatus, escrowSteps } from '../src/features/escrow/EscrowScreen';
import type { EscrowSource } from '../src/features/escrow/serverEscrow';
import { dealStep, MyDealsScreen } from '../src/features/market/MyDealsScreen';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

const settlement = (over: Partial<ServerSettlement> = {}, pay: Partial<ServerSettlement['you_pay']> = {}): ServerSettlement => ({
  settlement_id: 's1',
  phase: 'AWAITING_FUNDING',
  closure_reason: null,
  simulated: true,
  funding_deadline: new Date(NOW + 4 * 60_000 + 30_000).toISOString(),
  on_hold: false,
  you_pay: {
    leg_id: 'l1',
    currency: 'USD',
    amount: '200.00',
    fee: '2.00',
    total: '202.00',
    state: 'ESCROW_PROVISIONED',
    pay_in: { bank_name: 'Pretend Bank USA', account_name: 'Xspeeria Escrow (pretend)', account_number: '9912345678', reference: 'XSP-ABCD1234' },
    ...pay,
  },
  you_receive: { currency: 'NGN', amount: '264100.00', state: 'ESCROW_PROVISIONED' },
  ...over,
});

function fake(first: ServerSettlement = settlement(), after?: ServerSettlement): jest.Mocked<EscrowSource> {
  return {
    get: jest.fn(async (_id: string) => first),
    simulateTransfer: jest.fn(async (_id: string) => after ?? first),
  };
}

describe('escrow wording', () => {
  it('counts down the 5-minute window', () => {
    expect(countdown(new Date(NOW + 299_500).toISOString(), NOW)).toBe('5:00');
    expect(countdown(new Date(NOW + 61_000).toISOString(), NOW)).toBe('1:01');
    expect(countdown(new Date(NOW - 1).toISOString(), NOW)).toBeNull();
    expect(countdown(null, NOW)).toBeNull();
  });

  it('tells each side what to do, in plain words', () => {
    expect(escrowStatus(settlement(), NOW).title).toBe('Pay 202.00 USD into escrow');
    expect(escrowStatus(settlement(), NOW).detail).toMatch(/^4:30 left/);
    expect(escrowStatus(settlement({}, { state: 'FUNDED', pay_in: null }), NOW).title).toBe('Your payment arrived');
    expect(escrowStatus(settlement({ phase: 'RELEASING' }), NOW).detail).toBe('The bank is paying 264,100.00 NGN into your account.');
    expect(escrowStatus(settlement({ phase: 'COMPLETED' }), NOW)).toMatchObject({ title: 'Done', done: true });
    expect(escrowStatus(settlement({ phase: 'CANCELLED', closure_reason: 'TIMEOUT' }), NOW).detail).toMatch(/Nothing was paid/);
    expect(escrowStatus(settlement({ phase: 'CANCELLED', closure_reason: 'PROVISION_FAILED' }), NOW).detail).toMatch(/could not open escrow/);
    expect(escrowStatus(settlement({ phase: 'CLOSED_UNWOUND' }, { state: 'RETURNED' }), NOW).detail).toBe(
      'Your 202.00 USD was returned in full, fee included.',
    );
    expect(escrowStatus(settlement({ phase: 'UNWINDING' }, { state: 'FUNDED' }), NOW).detail).toMatch(/returned in full, fee included/);
    expect(escrowStatus(settlement({ on_hold: true }), NOW).title).toBe('Paused for a check');
  });

  it('never says "balance" or "wallet"', () => {
    const phases = ['INITIALIZING', 'AWAITING_FUNDING', 'RELEASING', 'COMPLETED', 'UNWINDING', 'CLOSED_UNWOUND', 'CANCELLED'] as const;
    for (const phase of phases) {
      const { title, detail } = escrowStatus(settlement({ phase }), NOW);
      expect(`${title} ${detail}`).not.toMatch(/balance|wallet/i);
    }
  });

  it('marks steps done only from the bank-confirmed states', () => {
    expect(escrowSteps(settlement()).map((s) => s.done)).toEqual([true, false, false, false]);
    const paid = settlement({ phase: 'COMPLETED', you_receive: { currency: 'NGN', amount: '1.00', state: 'PAID_OUT' } }, { state: 'PAID_OUT' });
    expect(escrowSteps(paid).every((s) => s.done)).toBe(true);
  });
});

describe('Escrow screen', () => {
  it('shows amount, 1% fee, total and where to transfer', async () => {
    await render(<EscrowScreen matchId="m1" source={fake()} onBack={jest.fn()} now={() => NOW} pollMs={60_000} />);
    await flush();
    expect(screen.getByTestId('escrow-total')).toHaveTextContent('202.00 USD');
    expect(screen.getByTestId('escrow-you-pay')).toHaveTextContent(/2\.00 USD/);
    expect(screen.getByTestId('escrow-account-number')).toHaveTextContent('9912345678');
    expect(screen.getByTestId('escrow-reference')).toHaveTextContent('XSP-ABCD1234');
    expect(screen.getByTestId('escrow-you-receive')).toHaveTextContent(/264,100\.00 NGN/);
    expect(screen.getByTestId('escrow-simulated')).toBeTruthy();
  });

  it('simulates my transfer through the server and shows the result', async () => {
    const src = fake(settlement(), settlement({}, { state: 'FUNDED', pay_in: null }));
    await render(<EscrowScreen matchId="m1" source={src} onBack={jest.fn()} now={() => NOW} pollMs={60_000} />);
    await flush();
    await fireEvent.press(screen.getByTestId('escrow-simulate'));
    await flush();
    expect(src.simulateTransfer).toHaveBeenCalledWith('m1');
    expect(screen.getByTestId('escrow-title')).toHaveTextContent('Your payment arrived');
    expect(screen.queryByTestId('escrow-simulate')).toBeNull();
    expect(screen.queryByTestId('escrow-pay-in')).toBeNull();
  });

  it('has no simulate button with a real bank, or after the window', async () => {
    await render(<EscrowScreen matchId="m1" source={fake(settlement({ simulated: false }))} onBack={jest.fn()} now={() => NOW} pollMs={60_000} />);
    await flush();
    expect(screen.queryByTestId('escrow-simulate')).toBeNull();
    expect(screen.queryByTestId('escrow-simulated')).toBeNull();
    await screen.unmount();
    await render(<EscrowScreen matchId="m1" source={fake()} onBack={jest.fn()} now={() => NOW + 10 * 60_000} pollMs={60_000} />);
    await flush();
    expect(screen.queryByTestId('escrow-simulate')).toBeNull();
  });

  it('shows the server error when the simulated transfer is refused', async () => {
    const src = fake();
    src.simulateTransfer.mockRejectedValueOnce(
      new ApiError('RES_409_INVALID_SETTLEMENT_STATE', 409, 'There is nothing to pay into escrow for this deal right now.'),
    );
    await render(<EscrowScreen matchId="m1" source={src} onBack={jest.fn()} now={() => NOW} pollMs={60_000} />);
    await flush();
    await fireEvent.press(screen.getByTestId('escrow-simulate'));
    await flush();
    expect(screen.getByTestId('escrow-error')).toHaveTextContent(/nothing to pay/);
  });

  it('keeps checking with the server until the deal is finished', async () => {
    jest.useFakeTimers();
    try {
      const src = fake();
      await render(<EscrowScreen matchId="m1" source={src} onBack={jest.fn()} now={() => NOW} pollMs={3_000} />);
      await flush();
      expect(src.get).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(3_000);
      });
      expect(src.get).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows a load error with retry', async () => {
    const src = fake();
    src.get.mockRejectedValueOnce(new ApiError('RES_404_SETTLEMENT_NOT_FOUND', 404, 'The escrow steps for this deal have not started.'));
    await render(<EscrowScreen matchId="m1" source={src} onBack={jest.fn()} now={() => NOW} pollMs={60_000} />);
    await flush();
    expect(screen.getByText('The escrow steps for this deal have not started.')).toBeTruthy();
  });
});

describe('My Deals → escrow', () => {
  const ready: ServerMatch = {
    match_id: 'm1',
    offer_id: 'o1',
    currency: 'USD',
    counter_currency: 'NGN',
    allocated_amount: '200.00',
    agreed_rate: '1320.50',
    accepted_at: new Date(NOW).toISOString(),
    server_order_key: '1',
    your_role: 'offer_owner',
    you_receive_currency: 'NGN',
    you_receive_amount: '264100.00',
    preparation_state: 'funding_ready',
    preparation_deadline: null,
    you_chose_payout_accounts: true,
    other_side_chose_payout_accounts: true,
  };

  it('a ready deal leads to the escrow steps', async () => {
    expect(dealStep(ready, NOW)).toMatchObject({ text: 'Payout accounts chosen by both sides. Next: pay into escrow.', canOpenEscrow: true });
    const onEscrow = jest.fn();
    await render(<MyDealsScreen source={{ list: async () => [ready] }} onBack={jest.fn()} onEscrow={onEscrow} />);
    await flush();
    await fireEvent.press(screen.getByTestId('deal-m1-escrow'));
    expect(onEscrow).toHaveBeenCalledWith('m1');
  });
});
