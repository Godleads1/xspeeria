/**
 * ADR-036: payout accounts and choosing them for a deal (server builds). The server is a
 * fake `PayoutSource`; its rules are tested on the server (ADR-035).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { ServerMatch } from '../src/api/offersApi';
import type { ServerPayoutAccount } from '../src/api/payoutsApi';
import { dealStep } from '../src/features/market/MyDealsScreen';
import { AddPayoutAccountScreen, toNewAccount } from '../src/features/payouts/AddPayoutAccountScreen';
import { ChoosePayoutScreen, timeLeft } from '../src/features/payouts/ChoosePayoutScreen';
import { PayoutAccountsScreen } from '../src/features/payouts/PayoutAccountsScreen';
import type { PayoutSource } from '../src/features/payouts/serverPayouts';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const NOW = Date.UTC(2026, 9, 18, 18, 0, 0);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const acct = (over: Partial<ServerPayoutAccount> = {}): ServerPayoutAccount => ({
  payout_account_id: 'a1',
  currency: 'NGN',
  bank_name: 'Zenith Bank',
  account_last4: '6789',
  account_type: null,
  account_name: 'DEV ACCOUNT HOLDER',
  validation_state: 'validated',
  payout_hold_until: '2026-10-19T18:00:00Z',
  created_at: '2026-10-18T18:00:00Z',
  ...over,
});

const deal = (over: Partial<ServerMatch> = {}): ServerMatch => ({
  match_id: 'm1',
  offer_id: 'o1',
  currency: 'USD',
  counter_currency: 'NGN',
  allocated_amount: '200.00',
  agreed_rate: '1320.50',
  accepted_at: new Date(NOW - 5 * 60_000).toISOString(),
  server_order_key: '1',
  your_role: 'offer_owner',
  you_receive_currency: 'NGN',
  you_receive_amount: '264100.00',
  preparation_state: 'awaiting_payout_accounts',
  preparation_deadline: new Date(NOW + 25 * 60_000).toISOString(),
  you_chose_payout_accounts: false,
  other_side_chose_payout_accounts: false,
  ...over,
});

function fake(accounts: ServerPayoutAccount[] = [acct()], m: ServerMatch = deal()): jest.Mocked<PayoutSource> {
  return {
    list: jest.fn(async () => accounts),
    add: jest.fn(async (_a, _c: string) => acct({ payout_account_id: 'new' })),
    remove: jest.fn(async (_id: string, _c: string) => undefined),
    match: jest.fn(async (_id: string) => m),
    choose: jest.fn(async (_id: string, _l, _c: string) => deal({ you_chose_payout_accounts: true })),
  };
}

describe('deal step wording', () => {
  it('says what to do and how long is left', () => {
    expect(dealStep(deal(), NOW)).toEqual({ text: 'Choose your payout account — 25 min left.', canChoose: true });
    expect(dealStep(deal({ you_chose_payout_accounts: true }), NOW).text).toMatch(/Waiting for the other side/);
    expect(dealStep(deal({ preparation_state: 'funding_ready' }), NOW).canChoose).toBe(false);
    expect(dealStep(deal({ preparation_state: 'expired' }), NOW).text).toMatch(/Nothing was paid/);
    expect(timeLeft(deal().preparation_deadline, NOW)).toBe('25 min left');
    expect(timeLeft(new Date(NOW - 1).toISOString(), NOW)).toBeNull();
  });
});

describe('Payout accounts list', () => {
  it('shows only the last 4 digits and the bank status', async () => {
    await render(
      <PayoutAccountsScreen
        source={fake([acct(), acct({ payout_account_id: 'a2', validation_state: 'pending', account_last4: '1111' })])}
        onBack={jest.fn()}
        onAdd={jest.fn()}
      />,
    );
    await flush();
    expect(screen.getByTestId('payout-account-a1')).toHaveTextContent(/Zenith Bank •••• 6789/);
    expect(screen.getByTestId('payout-account-a1')).toHaveTextContent(/Confirmed/);
    expect(screen.getByTestId('payout-account-a2')).toHaveTextContent(/Bank check pending/);
  });

  it('removing asks for the authenticator code', async () => {
    const src = fake();
    await render(<PayoutAccountsScreen source={src} onBack={jest.fn()} onAdd={jest.fn()} />);
    await flush();
    await fireEvent.press(screen.getByTestId('payout-account-a1-remove'));
    await fireEvent.changeText(screen.getByTestId('server-code-input'), '123456');
    await fireEvent.press(screen.getByTestId('server-code-confirm'));
    await flush();
    expect(src.remove).toHaveBeenCalledWith('a1', '123456');
    expect(screen.getByTestId('payout-accounts-notice')).toHaveTextContent('Account removed.');
  });
});

describe('Add payout account', () => {
  it('maps the approved form to the server request', () => {
    expect(toNewAccount('USD', { bankName: ' Chase ', accountNumber: '1234', routingNumber: '021000021', accountType: 'Checking' })).toEqual({
      currency: 'USD',
      bank_name: 'Chase',
      account_number: '1234',
      routing_number: '021000021',
      account_type: 'Checking',
    });
  });

  it('checks the format, then sends details with the code', async () => {
    const src = fake();
    const onAdded = jest.fn();
    await render(<AddPayoutAccountScreen source={src} onBack={jest.fn()} onAdded={onAdded} />);
    await fireEvent.changeText(screen.getByTestId('field-bankName'), 'Zenith Bank');
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '12345');
    await fireEvent.changeText(screen.getByTestId('add-payout-code'), '123456');
    await fireEvent.press(screen.getByTestId('add-payout-save'));
    expect(src.add).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-accountNumber')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '0123456789');
    await fireEvent.changeText(screen.getByTestId('add-payout-code'), '123456');
    await fireEvent.press(screen.getByTestId('add-payout-save'));
    await flush();
    expect(src.add).toHaveBeenCalledWith({ currency: 'NGN', bank_name: 'Zenith Bank', account_number: '0123456789' }, '123456');
    expect(onAdded).toHaveBeenCalled();
  });

  it('shows the server’s refusal', async () => {
    const src = fake();
    src.add.mockRejectedValueOnce(new ApiError('AUTH_403_FORBIDDEN', 403, 'Please confirm with your authenticator code first.'));
    await render(<AddPayoutAccountScreen source={src} onBack={jest.fn()} onAdded={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('field-bankName'), 'Zenith Bank');
    await fireEvent.changeText(screen.getByTestId('field-accountNumber'), '0123456789');
    await fireEvent.changeText(screen.getByTestId('add-payout-code'), '000000');
    await fireEvent.press(screen.getByTestId('add-payout-save'));
    await flush();
    expect(screen.getByTestId('add-payout-error')).toHaveTextContent(/authenticator code/);
  });
});

describe('Choose payout accounts for a deal', () => {
  async function open(src: PayoutSource) {
    await render(<ChoosePayoutScreen matchId="m1" source={src} onBack={jest.fn()} onAddAccount={jest.fn()} now={() => NOW} />);
    await flush();
  }

  it('defaults to the first account getting everything, and confirms with the code', async () => {
    const src = fake([acct(), acct({ payout_account_id: 'a2', account_last4: '2222' }), acct({ payout_account_id: 'u1', currency: 'USD' })]);
    await open(src);
    expect(screen.getByTestId('choose-summary')).toHaveTextContent(/You receive 264,100.00 NGN/);
    expect(screen.getByTestId('choose-summary')).toHaveTextContent(/25 min left/);
    expect(screen.queryByTestId('choose-amount-u1')).toBeNull(); // wrong currency is not offered
    expect(screen.getByTestId('choose-left')).toHaveTextContent('All assigned.');
    await fireEvent.changeText(screen.getByTestId('choose-code'), '123456');
    await fireEvent.press(screen.getByTestId('choose-confirm'));
    await flush();
    expect(src.choose).toHaveBeenCalledWith('m1', [{ payout_account_id: 'a1', amount: '264100.00' }], '123456');
    expect(screen.getByTestId('choose-status')).toHaveTextContent(/Waiting for the other side/);
  });

  it('splits across accounts and must add up exactly', async () => {
    const src = fake([acct(), acct({ payout_account_id: 'a2', account_last4: '2222' })]);
    await open(src);
    await fireEvent.changeText(screen.getByTestId('choose-amount-a1'), '200000');
    expect(screen.getByTestId('choose-left')).toHaveTextContent('Left to assign: 64,100.00 NGN');
    await fireEvent.changeText(screen.getByTestId('choose-code'), '123456');
    expect(screen.getByTestId('choose-confirm')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('choose-amount-a2'), '64100.01');
    expect(screen.getByTestId('choose-left')).toHaveTextContent('0.01 NGN more than you receive');
    await fireEvent.changeText(screen.getByTestId('choose-amount-a2'), '64100');
    await fireEvent.press(screen.getByTestId('choose-confirm'));
    await flush();
    expect(src.choose).toHaveBeenCalledWith(
      'm1',
      [
        { payout_account_id: 'a1', amount: '200000.00' },
        { payout_account_id: 'a2', amount: '64100.00' },
      ],
      '123456',
    );
  });

  it('offers to add an account when none fits', async () => {
    const onAdd = jest.fn();
    await render(<ChoosePayoutScreen matchId="m1" source={fake([])} onBack={jest.fn()} onAddAccount={onAdd} now={() => NOW} />);
    await flush();
    expect(screen.getByTestId('choose-no-accounts')).toHaveTextContent(/no confirmed NGN payout account/);
    await fireEvent.press(screen.getByTestId('choose-add-account'));
    expect(onAdd).toHaveBeenCalledWith('NGN');
  });

  it('shows the outcome once the deal is ready or expired', async () => {
    await open(fake([acct()], deal({ preparation_state: 'expired' })));
    expect(screen.getByTestId('choose-status')).toHaveTextContent(/cancelled/);
  });
});
