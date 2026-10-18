/**
 * ADR-032: taking an offer from the app (server builds). The server is a fake `TakeSource`;
 * the acceptance rules themselves are tested on the server (ADR-031).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { ServerMatch, ServerOffer } from '../src/api/offersApi';
import { ngnMinorFor, TakeOfferScreen } from '../src/features/market/TakeOfferScreen';
import type { TakeSource } from '../src/features/market/serverOffers';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'k') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const OFFER: ServerOffer = {
  offer_id: 'o-1',
  source_currency: 'USD',
  target_currency: 'NGN',
  source_amount: '500.00',
  matched_amount: '0.00',
  remaining_amount: '500.00',
  desired_rate: '1320.50',
  status: 'open',
  is_own: false,
  version: 1,
  created_at: '2026-10-18T12:00:00Z',
};

const MATCH: ServerMatch = {
  match_id: 'm-1',
  offer_id: 'o-1',
  currency: 'USD',
  counter_currency: 'NGN',
  allocated_amount: '200.00',
  agreed_rate: '1320.50',
  accepted_at: '2026-10-18T12:05:00Z',
  server_order_key: '7',
  your_role: 'taker',
};

function source(): jest.Mocked<TakeSource> {
  let n = 0;
  return {
    offer: jest.fn(async (_id: string) => OFFER),
    approve: jest.fn(async (_code: string) => `approval-${++n}`),
    accept: jest.fn(async (_o: string, _a: string, _k: string, _t: string | null) => MATCH),
    newKey: jest.fn(() => `key-${++n}`),
  };
}

const flush = () => act(async () => { await Promise.resolve(); });

async function open(src: TakeSource) {
  const onDone = jest.fn();
  await render(<TakeOfferScreen offerId="o-1" source={src} onBack={jest.fn()} onDone={onDone} />);
  await flush();
  return onDone;
}

describe('NGN amount (exact, half-even)', () => {
  it('works for 2- and 6-decimal rates', () => {
    expect(ngnMinorFor(20000, '1320.50')).toBe(26410000);
    expect(ngnMinorFor(1, '1320.125')).toBe(1320); // 0.01 USD × 1,320.125 = 1,320.125 kobo → 1,320
    expect(ngnMinorFor(1, '1320.5')).toBe(1320); // half to even
    expect(ngnMinorFor(1, '1321.5')).toBe(1322);
    expect(ngnMinorFor(100, 'x')).toBeNull();
  });
});

describe('Take offer screen (ADR-032)', () => {
  it('reads the offer fresh and records the deal with one approval and one key', async () => {
    const src = source();
    const onDone = await open(src);
    expect(src.offer).toHaveBeenCalledWith('o-1');
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    expect(screen.getByTestId('take-ngn')).toHaveTextContent('Works out to NGN 264,100.00');
    await fireEvent.changeText(screen.getByTestId('take-code'), '123456');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledWith('123456');
    expect(src.accept).toHaveBeenCalledWith('o-1', '200.00', expect.stringMatching(/^key-/), expect.stringMatching(/^approval-/));
    expect(screen.getByTestId('take-match')).toHaveTextContent(/200\.00 USD/);
    expect(screen.getByTestId('take-done-screen')).toHaveTextContent(/never holds your money/);
    await fireEvent.press(screen.getByTestId('take-done'));
    expect(onDone).toHaveBeenCalled();
  });

  it('blocks more than is available and offers "take all"', async () => {
    const src = source();
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '500.01');
    expect(screen.getByTestId('take-too-much')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('take-all'));
    expect(screen.queryByTestId('take-too-much')).toBeNull();
    expect(screen.getByTestId('take-ngn')).toHaveTextContent(/660,250\.00/);
  });

  it('retries a lost connection with the same key and the unused approval', async () => {
    const src = source();
    src.accept.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'Can’t reach Xspeeria.'));
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    await fireEvent.changeText(screen.getByTestId('take-code'), '123456');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(screen.getByTestId('take-error')).toHaveTextContent(/Can’t reach/);
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledTimes(1);
    const [first, second] = src.accept.mock.calls;
    expect(second[2]).toBe(first[2]);
    expect(second[3]).toBe(first[3]);
    expect(screen.getByTestId('take-match')).toBeTruthy();
  });

  it('asks for a new code when the approval is refused, and shows server refusals', async () => {
    const src = source();
    src.accept
      .mockRejectedValueOnce(new ApiError('AUTH_403_FORBIDDEN', 403, 'Please confirm with your authenticator code first.'))
      .mockRejectedValueOnce(new ApiError('RES_409_INSUFFICIENT_REMAINING', 409, 'Only 100.00 USD is left on this offer.'));
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    await fireEvent.changeText(screen.getByTestId('take-code'), '123456');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(screen.getByTestId('take-error')).toHaveTextContent(/authenticator code/);
    expect(screen.getByTestId('take-submit')).toBeDisabled(); // code cleared
    await fireEvent.changeText(screen.getByTestId('take-code'), '654321');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('take-error')).toHaveTextContent('Only 100.00 USD is left on this offer.');
  });

  it('a new amount is a new take (new key)', async () => {
    const src = source();
    src.accept.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'x'));
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    await fireEvent.changeText(screen.getByTestId('take-code'), '123456');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    await fireEvent.changeText(screen.getByTestId('take-amount'), '150');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    const [first, second] = src.accept.mock.calls;
    expect(second[2]).not.toBe(first[2]);
  });

  it('shows a load error with retry', async () => {
    const src = source();
    src.offer.mockRejectedValueOnce(new ApiError('RES_404_NOT_FOUND', 404, 'That offer was not found.'));
    await open(src);
    expect(screen.getByText('That offer was not found.')).toBeTruthy();
  });
});
