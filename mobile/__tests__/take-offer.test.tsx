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
    approve: jest.fn(async (_reason: string): Promise<string | null> => `approval-${++n}`),
    accept: jest.fn(async (_o: string, _a: string, _r: string, _k: string, _t: string | null) => MATCH),
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

describe('Fee shown before confirming (ADR-098)', () => {
  const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  it('asks the server for the fee on the naira the taker sends and shows it', async () => {
    const src = source();
    src.feeQuote = jest.fn(async (currency: string, amount: string) => ({
      currency, amount, side: 'taker' as const, fee: '2641.00', total: '266741.00',
    }));
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    expect(screen.queryByTestId('take-fee')).toBeNull(); // not until the server answers
    await wait(350);
    expect(src.feeQuote).toHaveBeenLastCalledWith('NGN', '264100.00');
    expect(screen.getByTestId('take-fee')).toHaveTextContent(
      'Xspeeria fee: 2,641.00 NGN. You pay 266,741.00 NGN into escrow.',
    );
  });

  it('shows no fee line when the quote fails or the amount is too much', async () => {
    const src = source();
    src.feeQuote = jest.fn(async () => { throw new ApiError('NETWORK', 0, 'x'); });
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    await wait(350);
    expect(screen.queryByTestId('take-fee')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('take-amount'), '500.01');
    await wait(350);
    expect(src.feeQuote).toHaveBeenCalledTimes(1);
  });
});

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
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledWith('Take 200.00 USD at NGN 1,320.50');
    expect(src.accept).toHaveBeenCalledWith('o-1', '200.00', '1320.50', expect.stringMatching(/^key-/), expect.stringMatching(/^approval-/));
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
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(screen.getByTestId('take-error')).toHaveTextContent(/Can’t reach/);
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledTimes(1);
    const [first, second] = src.accept.mock.calls;
    expect(second[3]).toBe(first[3]);
    expect(second[4]).toBe(first[4]);
    expect(screen.getByTestId('take-match')).toBeTruthy();
  });

  it('asks again when the approval is refused, and shows server refusals', async () => {
    const src = source();
    src.accept
      .mockRejectedValueOnce(new ApiError('AUTH_403_FORBIDDEN', 403, 'Please confirm it\'s you first.'))
      .mockRejectedValueOnce(new ApiError('RES_409_INSUFFICIENT_REMAINING', 409, 'Only 100.00 USD is left on this offer.'));
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(screen.getByTestId('take-error')).toHaveTextContent(/confirm it's you/);
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('take-error')).toHaveTextContent('Only 100.00 USD is left on this offer.');
  });

  it('cancelling "Confirm it’s you" records nothing', async () => {
    const src = source();
    src.approve.mockResolvedValueOnce(null);
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.accept).not.toHaveBeenCalled();
    expect(screen.queryByTestId('take-error')).toBeNull();
  });

  it('a new amount is a new take (new key)', async () => {
    const src = source();
    src.accept.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'x'));
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '200');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    await fireEvent.changeText(screen.getByTestId('take-amount'), '150');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    const [first, second] = src.accept.mock.calls;
    expect(second[3]).not.toBe(first[3]);
  });

  it('shows a load error with retry', async () => {
    const src = source();
    src.offer.mockRejectedValueOnce(new ApiError('RES_404_NOT_FOUND', 404, 'That offer was not found.'));
    await open(src);
    expect(screen.getByText('That offer was not found.')).toBeTruthy();
  });
});

describe('Selling to a buy request (ADR-056)', () => {
  const REQUEST: ServerOffer = {
    ...OFFER,
    offer_id: 'r-1',
    source_currency: 'NGN',
    target_currency: 'USD',
    source_amount: '1330000.00',
    remaining_amount: '1330000.00',
    desired_rate: '1330.00',
  };
  const SOLD: ServerMatch = {
    ...MATCH,
    offer_id: 'r-1',
    currency: 'NGN',
    counter_currency: 'USD',
    allocated_amount: '532000.00',
    agreed_rate: '1330.00',
    counter_amount: '400.00',
  };

  function requestSource(): jest.Mocked<TakeSource> {
    const src = source();
    src.offer.mockResolvedValue(REQUEST);
    src.accept.mockResolvedValue(SOLD);
    return src;
  }

  it('is typed in the foreign currency and sent in naira', async () => {
    const src = requestSource();
    await open(src);
    expect(screen.getByTestId('take-offer')).toHaveTextContent(/1,000\.00 USD/);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '400');
    expect(screen.getByTestId('take-ngn')).toHaveTextContent('Works out to NGN 532,000.00');
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.approve).toHaveBeenCalledWith('Sell 400.00 USD at NGN 1,330.00');
    expect(src.accept).toHaveBeenCalledWith('r-1', '532000.00', '1330.00', expect.any(String), expect.any(String));
    expect(screen.getByTestId('take-match')).toHaveTextContent(/400\.00 USD/);
  });

  it('"take all" sends exactly the naira left; more than wanted is refused', async () => {
    const src = requestSource();
    await open(src);
    await fireEvent.changeText(screen.getByTestId('take-amount'), '1000.01');
    expect(screen.getByTestId('take-too-much')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('take-all'));
    await fireEvent.press(screen.getByTestId('take-submit'));
    await flush();
    expect(src.accept).toHaveBeenCalledWith('r-1', '1330000.00', '1330.00', expect.any(String), expect.any(String));
  });
});
