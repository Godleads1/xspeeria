/**
 * ADR-059 Decision 4: offers someone is paying for show "Waiting for payment" with a queue;
 * the taker may ask once for 5 more minutes. The server decides; these test the app's part.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ApiError } from '../src/api/client';
import type { ServerSettlement } from '../src/api/escrowApi';
import type { ServerOffer } from '../src/api/offersApi';
import { EscrowScreen } from '../src/features/escrow/EscrowScreen';
import type { EscrowSource } from '../src/features/escrow/serverEscrow';
import { ListingRow } from '../src/features/market/controls';
import type { Listing } from '../src/features/market/data';
import { queueAction, type QueueSource } from '../src/features/market/queueActions';
import { toListing } from '../src/features/market/serverOffers';
import { notificationCopy } from '../src/features/notifications/notificationCopy';
import { SearchScreen } from '../src/features/search/SearchScreen';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const OFFER_ID = '0b7c3d9e-1f2a-4b5c-8d6e-7f8091a2b3c4';
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function offer(over: Partial<ServerOffer> = {}): ServerOffer {
  return {
    offer_id: OFFER_ID, source_currency: 'USD', target_currency: 'NGN', source_amount: '500.00', matched_amount: '500.00',
    remaining_amount: '0.00', desired_rate: '1329.75', status: 'fully_matched', is_own: false, version: 2,
    created_at: new Date(NOW - 60 * 60_000).toISOString(), waiting: true, waiting_amount: '500.00', queue_length: 1,
    in_queue: false, your_turn: false, ...over,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('waiting offers as rows', () => {
  it('shows what may come back, the queue, and never "best"', () => {
    const row = toListing(offer(), NOW, true)!;
    expect(row.availableMinor).toBe(50000);
    expect(row.meta).toBe('Waiting for payment · 1 of 3 in queue');
    expect(row.best).toBeUndefined();
    expect(row.waiting).toEqual({ queueLength: 1, inQueue: false, yourTurn: false });
  });

  it('tells you when you are waiting, and when it is your turn', () => {
    expect(toListing(offer({ in_queue: true }), NOW, false)!.meta).toBe('Waiting for payment · You’re in the queue');
    const turn = toListing(offer({ your_turn: true, remaining_amount: '500.00', matched_amount: '0.00', status: 'open' }), NOW, false)!;
    expect(turn.meta).toBe('Your turn: take it within 5 minutes');
    expect(turn.waiting?.yourTurn).toBe(true);
  });

  it('caps a silly queue length from the server', () => {
    expect(toListing(offer({ queue_length: 99 }), NOW, false)!.waiting?.queueLength).toBe(3);
  });

  it('Market row says Join queue / In queue, and Buy on your turn', async () => {
    const onAction = jest.fn();
    const waiting = toListing(offer(), NOW, false)!;
    await render(<ListingRow listing={waiting} side="buy" onAction={onAction} />);
    expect(screen.getByText('Join queue')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`listing-${OFFER_ID}-action`));
    expect(onAction).toHaveBeenCalledWith(waiting);
  });
});

describe('joining and leaving', () => {
  function source(over: Partial<QueueSource> = {}): QueueSource {
    return {
      join: jest.fn(async () => ({ offer_id: OFFER_ID, status: 'waiting' as const, position: 2, queue_length: 2, turn_deadline: null })),
      leave: jest.fn(async () => null),
      ...over,
    };
  }
  const pressButton = (index: number) =>
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[index]?.onPress?.());

  it('asks first, then joins and says your place', async () => {
    pressButton(1);
    const src = source();
    const row = toListing(offer(), NOW, false)!;
    expect(await queueAction(row, src)).toBe('You’re number 2 in the queue. We’ll tell you when it’s your turn.');
    expect(src.join).toHaveBeenCalledWith(OFFER_ID);
  });

  it('does nothing when cancelled', async () => {
    pressButton(0);
    const src = source();
    expect(await queueAction(toListing(offer(), NOW, false)!, src)).toBeNull();
    expect(src.join).not.toHaveBeenCalled();
  });

  it('leaves when already waiting', async () => {
    pressButton(1);
    const src = source();
    expect(await queueAction(toListing(offer({ in_queue: true }), NOW, false)!, src)).toBe('You left the queue.');
    expect(src.leave).toHaveBeenCalledWith(OFFER_ID);
  });

  it('shows the server’s reason when it refuses', async () => {
    pressButton(1);
    const src = source({ join: jest.fn(async () => { throw new ApiError('RES_409_QUEUE_FULL', 409, 'The queue for this offer is full. Try another offer.'); }) });
    expect(await queueAction(toListing(offer(), NOW, false)!, src)).toBe('The queue for this offer is full. Try another offer.');
  });

  it('search shows the waiting card and asks to queue', async () => {
    const row: Listing = toListing(offer(), NOW, false)!;
    const onQueue = jest.fn(async () => 'You’re number 1 in the queue. We’ll tell you when it’s your turn.');
    await render(
      <SearchScreen
        source={{ run: jest.fn(async () => ({ kind: 'offers' as const, rows: [row] })) }}
        onBack={jest.fn()}
        onTake={jest.fn()}
        onPostRequest={jest.fn()}
        onQueue={onQueue}
      />,
    );
    await flush();
    expect(screen.getByText('Waiting for payment')).toBeTruthy();
    expect(screen.queryByTestId(`search-take-${OFFER_ID}`)).toBeNull();
    await fireEvent.press(screen.getByTestId(`search-queue-${OFFER_ID}`));
    await flush();
    expect(onQueue).toHaveBeenCalledWith(row);
    expect(screen.getByTestId('search-note').props.children).toMatch(/number 1/);
  });
});

describe('your turn notification', () => {
  it('opens Take for that offer, and ignores a bad id', () => {
    const copy = notificationCopy({ event: 'queue.your_turn', data: { offer_id: OFFER_ID, deadline: new Date(NOW + 5 * 60_000).toISOString() } });
    expect(copy.title).toBe('It’s your turn');
    expect(copy.link).toBe(`/market/take?offer=${OFFER_ID}`);
    expect(notificationCopy({ event: 'queue.your_turn', data: { offer_id: '../x' } }).link).toBe('/marketplace');
  });
});

describe('one extra 5 minutes to pay', () => {
  const settlement = (over: Partial<ServerSettlement> = {}): ServerSettlement => ({
    settlement_id: 's1', phase: 'AWAITING_FUNDING', closure_reason: null, simulated: true,
    funding_deadline: new Date(NOW + 2 * 60_000).toISOString(), on_hold: false, can_extend: true, funding_extended: false,
    you_pay: { leg_id: 'l1', currency: 'NGN', amount: '264100.00', fee: '2641.00', total: '266741.00', state: 'ESCROW_PROVISIONED', pay_in: null },
    you_receive: { currency: 'USD', amount: '200.00', state: 'ESCROW_PROVISIONED' },
    ...over,
  });

  it('the taker can ask once; then the button goes', async () => {
    const extended = settlement({ can_extend: false, funding_extended: true, funding_deadline: new Date(NOW + 7 * 60_000).toISOString() });
    const src: EscrowSource = { get: jest.fn(async () => settlement()), simulateTransfer: jest.fn(), extend: jest.fn(async () => extended) };
    await render(<EscrowScreen matchId="m1" source={src} onBack={jest.fn()} now={() => NOW} pollMs={60_000} />);
    await flush();
    await fireEvent.press(screen.getByTestId('escrow-extend'));
    await flush();
    expect(src.extend).toHaveBeenCalledWith('m1');
    expect(screen.queryByTestId('escrow-extend')).toBeNull();
    expect(screen.getByTestId('escrow-extended')).toBeTruthy();
  });

  it('is not offered to the other side or after the time is up', async () => {
    const src: EscrowSource = { get: jest.fn(async () => settlement({ can_extend: false })), simulateTransfer: jest.fn(), extend: jest.fn() };
    await render(<EscrowScreen matchId="m1" source={src} onBack={jest.fn()} now={() => NOW} pollMs={60_000} />);
    await flush();
    expect(screen.queryByTestId('escrow-extend')).toBeNull();
  });
});
