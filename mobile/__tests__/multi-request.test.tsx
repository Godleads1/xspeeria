/**
 * ADR-059 Decision 5: a buy request in several currencies. The server enforces "only one can
 * ever be paid"; these test the form, the conversion and whole-amount taking.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import { offersApi, type ServerOffer } from '../src/api/offersApi';
import { serverAuth } from '../src/features/auth/serverAuth';
import { groupProblem, MultiRequestScreen, youGet, type MultiRequestSource } from '../src/features/market/MultiRequestScreen';
import { multiRequestServer, myOffers } from '../src/features/market/serverOffers';
import { TakeOfferScreen } from '../src/features/market/TakeOfferScreen';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

afterEach(() => jest.restoreAllMocks());

describe('form rules', () => {
  it('needs an amount, 2–5 different currencies and a rate each', () => {
    const two = [{ currency: 'USD', rate: '1320' }, { currency: 'GBP', rate: '1750' }];
    expect(groupProblem('1000000', two)).toBeNull();
    expect(groupProblem('', two)).toMatch(/naira amount/);
    expect(groupProblem('1000000', two.slice(0, 1))).toMatch(/at least 2/);
    expect(groupProblem('1000000', [two[0], two[0]])).toMatch(/once/);
    expect(groupProblem('1000000', [two[0], { currency: 'GBP', rate: 'abc' }])).toMatch(/rate/);
    expect(groupProblem('1000000', Array.from({ length: 6 }, (_, i) => ({ currency: `C${i}`, rate: '1' })))).toMatch(/up to 5/);
  });

  it('shows what you get per currency, half to even', () => {
    expect(youGet('1000000', '1320')).toBe(75758); // 757.58 USD
    expect(youGet('1,320,500.00', '1320.50')).toBe(100000);
    expect(youGet('', '1320')).toBeNull();
  });
});

describe('screen', () => {
  function src(over: Partial<MultiRequestSource> = {}): MultiRequestSource {
    return { publish: jest.fn(async () => ({})), newKey: jest.fn(() => 'k-1'), ...over };
  }

  it('posts one naira amount with each rate, then finishes', async () => {
    const s = src();
    const onDone = jest.fn();
    await render(<MultiRequestScreen source={s} onBack={jest.fn()} onDone={onDone} />);
    await fireEvent.changeText(screen.getByTestId('multi-naira'), '1,000,000');
    await fireEvent.changeText(screen.getByTestId('multi-rate-USD'), '1320');
    await fireEvent.changeText(screen.getByTestId('multi-rate-GBP'), '1750.50');
    expect(screen.getByText('You get 757.58 USD')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('multi-add'));
    await fireEvent.changeText(screen.getByTestId('multi-rate-EUR'), '1480');
    expect(screen.queryByTestId('multi-add')).toBeNull(); // only USD, GBP and EUR have rates
    await fireEvent.press(screen.getByTestId('multi-post'));
    await flush();
    expect(s.publish).toHaveBeenCalledWith(
      100000000,
      [
        { currency: 'USD', rateHundredths: 132000 },
        { currency: 'GBP', rateHundredths: 175050 },
        { currency: 'EUR', rateHundredths: 148000 },
      ],
      'k-1',
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('keeps at least two currencies and can remove a third', async () => {
    await render(<MultiRequestScreen source={src()} onBack={jest.fn()} onDone={jest.fn()} />);
    expect(screen.queryByTestId('multi-remove-USD')).toBeNull();
    await fireEvent.press(screen.getByTestId('multi-add'));
    await fireEvent.press(screen.getByTestId('multi-remove-USD'));
    expect(screen.queryByTestId('multi-line-USD')).toBeNull();
    expect(screen.getByTestId('multi-line-EUR')).toBeTruthy();
  });

  it('shows the server’s refusal and retries with the same key', async () => {
    const s = src({ publish: jest.fn().mockRejectedValueOnce(new ApiError('VAL_422_RATE_ABOVE_CEILING', 422, 'The rate can’t be above the official rate (NGN 1,765.11 per GBP).')).mockResolvedValue({}) });
    await render(<MultiRequestScreen source={s} onBack={jest.fn()} onDone={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('multi-naira'), '1000000');
    await fireEvent.changeText(screen.getByTestId('multi-rate-USD'), '1320');
    await fireEvent.changeText(screen.getByTestId('multi-rate-GBP'), '1900');
    await fireEvent.press(screen.getByTestId('multi-post'));
    await flush();
    expect(screen.getByTestId('multi-error').props.children).toMatch(/official rate/);
    await fireEvent.press(screen.getByTestId('multi-post'));
    await flush();
    expect(s.newKey).toHaveBeenCalledTimes(1);
  });

  it('cannot post an unfinished form', async () => {
    const s = src();
    await render(<MultiRequestScreen source={s} onBack={jest.fn()} onDone={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('multi-post'));
    expect(s.publish).not.toHaveBeenCalled();
  });
});

describe('server calls', () => {
  beforeEach(() => jest.spyOn(serverAuth, 'accessToken').mockReturnValue('t'));

  it('sends decimal text for the amount and each rate', async () => {
    const spy = jest.spyOn(offersApi, 'publishGroup').mockResolvedValue({ group_id: 'g', offers: [] });
    await multiRequestServer.publish(100000000, [{ currency: 'USD', rateHundredths: 132050 }, { currency: 'GBP', rateHundredths: 175000 }], 'k');
    expect(spy).toHaveBeenCalledWith(
      't',
      { source_amount: '1000000.00', currencies: [{ currency: 'USD', desired_rate: '1320.50' }, { currency: 'GBP', desired_rate: '1750.00' }] },
      'k',
      expect.anything(),
    );
  });

  it('edits only the rate of a request in several currencies', async () => {
    const spy = jest.spyOn(offersApi, 'edit').mockResolvedValue({} as ServerOffer);
    const grouped = { offer_id: 'o1', source_currency: 'NGN', target_currency: 'USD', group_id: 'g1' } as ServerOffer;
    await myOffers.edit(grouped, 100000, 132100);
    expect(spy).toHaveBeenCalledWith('t', 'o1', { desired_rate: '1321.00' }, expect.anything());
  });
});

describe('taking one currency', () => {
  it('fills the whole amount and does not allow a part', async () => {
    const offer: ServerOffer = {
      offer_id: 'o1', source_currency: 'NGN', target_currency: 'USD', source_amount: '1320500.00', matched_amount: '0.00',
      remaining_amount: '1320500.00', desired_rate: '1320.50', status: 'open', is_own: false, version: 1,
      created_at: '2026-10-26T10:00:00Z', group_id: 'g1', whole_only: true,
    };
    const source = {
      offer: jest.fn(async () => offer),
      approve: jest.fn(async () => 'step-up'),
      accept: jest.fn(async () => ({}) as never),
      newKey: jest.fn(() => 'k'),
    };
    await render(<TakeOfferScreen offerId="o1" source={source as never} onBack={jest.fn()} onDone={jest.fn()} onDeals={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('take-amount').props.value).toBe('1000.00');
    expect(screen.getByTestId('take-whole')).toBeTruthy();
    expect(screen.queryByTestId('take-all')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('take-amount'), '10');
    expect(screen.getByTestId('take-amount').props.value).toBe('1000.00');
  });
});
