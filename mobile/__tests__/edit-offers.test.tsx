/**
 * ADR-059 Decision 3: edit an offer or buy request (rate and amount) before anyone takes any
 * of it. The server re-checks everything; these tests cover the screen and the conversion.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import { offersApi, type ServerOffer } from '../src/api/offersApi';
import { serverAuth } from '../src/features/auth/serverAuth';
import { canEdit, MyOffersScreen, type MyOffersSource } from '../src/features/market/MyOffersScreen';
import { myOffers } from '../src/features/market/serverOffers';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function offer(over: Partial<ServerOffer> = {}): ServerOffer {
  return {
    offer_id: 'a1', source_currency: 'USD', target_currency: 'NGN', source_amount: '500.00', matched_amount: '0.00',
    remaining_amount: '500.00', desired_rate: '1320.50', status: 'open', is_own: true, version: 1, created_at: '2026-10-26T10:00:00Z',
    ...over,
  };
}

function source(list: ServerOffer[], edit?: MyOffersSource['edit']): MyOffersSource {
  return { list: jest.fn(async () => list), withdraw: jest.fn(async (id) => ({ ...list.find((o) => o.offer_id === id)!, status: 'withdrawn' as const })), edit };
}

afterEach(() => jest.restoreAllMocks());

it('allows editing only while nobody has taken any of it', () => {
  expect(canEdit(offer())).toBe(true);
  expect(canEdit(offer({ matched_amount: '1.00', status: 'partially_matched' }))).toBe(false);
  expect(canEdit(offer({ status: 'withdrawn' }))).toBe(false);
  expect(canEdit(offer({ matched_amount: '1e3' }))).toBe(false);
});

it('edits an offer and shows the new values', async () => {
  const edit = jest.fn(async (o: ServerOffer) => offer({ ...o, source_amount: '750.00', remaining_amount: '750.00', desired_rate: '1321.00', version: 2 }));
  await render(<MyOffersScreen source={source([offer()], edit)} onBack={jest.fn()} />);
  await flush();
  await fireEvent.press(screen.getByTestId('my-offer-a1-edit'));
  expect(screen.getByTestId('my-offer-a1-amount').props.value).toBe('500.00');
  expect(screen.getByTestId('my-offer-a1-rate').props.value).toBe('1,320.50');
  await fireEvent.changeText(screen.getByTestId('my-offer-a1-amount'), '750');
  await fireEvent.changeText(screen.getByTestId('my-offer-a1-rate'), '1321');
  await fireEvent.press(screen.getByTestId('my-offer-a1-save'));
  await flush();
  expect(edit).toHaveBeenCalledWith(expect.objectContaining({ offer_id: 'a1' }), 75000, 132100);
  expect(screen.getByTestId('my-offers-notice').props.children).toBe('Offer updated.');
  expect(screen.queryByTestId('my-offer-a1-form')).toBeNull();
  expect(screen.getByText('Rate: NGN 1,321.00 /USD')).toBeTruthy();
});

it('shows no Edit button once part is taken, but Withdraw stays', async () => {
  await render(<MyOffersScreen source={source([offer({ matched_amount: '100.00', remaining_amount: '400.00', status: 'partially_matched' })], jest.fn())} onBack={jest.fn()} />);
  await flush();
  expect(screen.queryByTestId('my-offer-a1-edit')).toBeNull();
  expect(screen.getByTestId('my-offer-a1-withdraw')).toBeTruthy();
});

it('refuses bad numbers before sending', async () => {
  const edit = jest.fn();
  await render(<MyOffersScreen source={source([offer()], edit)} onBack={jest.fn()} />);
  await flush();
  await fireEvent.press(screen.getByTestId('my-offer-a1-edit'));
  await fireEvent.changeText(screen.getByTestId('my-offer-a1-amount'), '1.2.3');
  await fireEvent.press(screen.getByTestId('my-offer-a1-save'));
  expect(edit).not.toHaveBeenCalled();
  expect(screen.getByTestId('my-offers-notice').props.children).toMatch(/as numbers/);
});

it('when someone started a deal meanwhile, says so and reloads', async () => {
  const src = source([offer()], jest.fn(async () => {
    throw new ApiError('RES_409_OFFER_ALREADY_MATCHED', 409, 'Someone has started a deal on this offer, so it can’t be changed now. You can still withdraw what’s left.');
  }));
  await render(<MyOffersScreen source={src} onBack={jest.fn()} />);
  await flush();
  await fireEvent.press(screen.getByTestId('my-offer-a1-edit'));
  await fireEvent.press(screen.getByTestId('my-offer-a1-save'));
  await flush();
  expect(screen.getByTestId('my-offers-notice').props.children).toMatch(/started a deal/);
  expect(src.list).toHaveBeenCalledTimes(2);
});

it('cancel closes the form without saving', async () => {
  const edit = jest.fn();
  await render(<MyOffersScreen source={source([offer()], edit)} onBack={jest.fn()} />);
  await flush();
  await fireEvent.press(screen.getByTestId('my-offer-a1-edit'));
  await fireEvent.press(screen.getByTestId('my-offer-a1-cancel'));
  expect(screen.queryByTestId('my-offer-a1-form')).toBeNull();
  expect(edit).not.toHaveBeenCalled();
});

describe('server call', () => {
  beforeEach(() => jest.spyOn(serverAuth, 'accessToken').mockReturnValue('t'));

  it('sends the offer amount as typed for a sell offer', async () => {
    const spy = jest.spyOn(offersApi, 'edit').mockResolvedValue(offer());
    await myOffers.edit(offer(), 75050, 132100);
    expect(spy).toHaveBeenCalledWith('t', 'a1', { source_amount: '750.50', desired_rate: '1321.00' }, expect.anything());
  });

  it('turns a buy request amount into naira (amount × rate)', async () => {
    const spy = jest.spyOn(offersApi, 'edit').mockResolvedValue(offer());
    const request = offer({ source_currency: 'NGN', target_currency: 'USD', source_amount: '660000.00' });
    await myOffers.edit(request, 100000, 133000); // 1,000.00 USD at 1,330.00
    expect(spy).toHaveBeenCalledWith('t', 'a1', { source_amount: '1330000.00', desired_rate: '1330.00' }, expect.anything());
  });
});
