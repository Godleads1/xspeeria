/** ADR-057: disputes on deals and support requests, against a fake source. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { DisputeReason, ServerDispute } from '../src/api/disputesApi';
import { ApiError } from '../src/api/client';
import { CaseScreen, DisputesScreen, NewCaseScreen } from '../src/features/disputes/DisputeScreens';
import type { DisputeSource } from '../src/features/disputes/serverDisputes';
import { notificationCopy } from '../src/features/notifications/notificationCopy';

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const ID = '11111111-2222-4333-8444-555555555555';
const TX = '99999999-2222-4333-8444-555555555555';

function dispute(over: Partial<ServerDispute> = {}): ServerDispute {
  return {
    dispute_id: ID,
    kind: 'dispute',
    transaction_id: TX,
    reason: 'funds_not_received',
    status: 'open',
    outcome: null,
    opened_by_you: true,
    description: 'I paid, nothing came.',
    created_at: '2026-10-20T15:00:00Z',
    updated_at: '2026-10-20T15:00:00Z',
    resolved_at: null,
    messages: [],
    ...over,
  };
}

function fake(): jest.Mocked<DisputeSource> {
  return {
    mine: jest.fn(async () => [dispute(), dispute({ dispute_id: 'b', kind: 'support', transaction_id: null, reason: 'other' })]),
    get: jest.fn(async (_id: string) => dispute()),
    open: jest.fn(async (_t: string | null, _r: DisputeReason, _d: string) => dispute()),
    message: jest.fn(async (_id: string, text: string) =>
      dispute({ messages: [{ message_id: 'm1', author: 'you', body: text, created_at: '2026-10-20T15:05:00Z' }] }),
    ),
  };
}

describe('Disputes & support (ADR-057)', () => {
  it('lists my cases and opens one', async () => {
    const src = fake();
    const onOpen = jest.fn();
    const onNew = jest.fn();
    await render(<DisputesScreen source={src} onBack={jest.fn()} onOpen={onOpen} onNew={onNew} />);
    await flush();
    expect(screen.getByTestId(`case-${ID}`)).toHaveTextContent(/Your dispute on a deal/);
    expect(screen.getByTestId('case-b')).toHaveTextContent(/Support request/);
    await fireEvent.press(screen.getByTestId(`case-${ID}`));
    expect(onOpen).toHaveBeenCalledWith(ID);
    await fireEvent.press(screen.getByTestId('disputes-new'));
    expect(onNew).toHaveBeenCalled();
  });

  it('a dispute on a deal needs a reason and words; it says the escrow is paused', async () => {
    const src = fake();
    const onCreated = jest.fn();
    await render(<NewCaseScreen source={src} transactionId={TX} onBack={jest.fn()} onCreated={onCreated} />);
    expect(screen.getByTestId('new-case-screen')).toHaveTextContent(/pauses this deal’s escrow/);
    await fireEvent.changeText(screen.getByTestId('new-case-text'), '  I paid at 15:00.  ');
    expect(screen.getByTestId('new-case-send')).toBeDisabled(); // no reason yet
    await fireEvent.press(screen.getByTestId('reason-funds_not_received'));
    await fireEvent.press(screen.getByTestId('new-case-send'));
    await flush();
    expect(src.open).toHaveBeenCalledWith(TX, 'funds_not_received', 'I paid at 15:00.');
    expect(onCreated).toHaveBeenCalledWith(ID);
  });

  it('a support request has no deal and no reason list; refusals are shown', async () => {
    const src = fake();
    src.open.mockRejectedValueOnce(new ApiError('RES_409_DISPUTE_ALREADY_OPEN', 409, 'There is already an open dispute on this deal.'));
    await render(<NewCaseScreen source={src} transactionId={null} onBack={jest.fn()} onCreated={jest.fn()} />);
    expect(screen.queryByTestId('reason-other')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('new-case-text'), 'My ID check failed.');
    await fireEvent.press(screen.getByTestId('new-case-send'));
    await flush();
    expect(src.open).toHaveBeenCalledWith(null, 'other', 'My ID check failed.');
    expect(screen.getByTestId('new-case-error')).toHaveTextContent(/already an open dispute/);
  });

  it('a case shows my messages and staff replies, and takes a reply until resolved', async () => {
    const src = fake();
    src.get.mockResolvedValueOnce(
      dispute({
        opened_by_you: false,
        description: null,
        messages: [{ message_id: 's1', author: 'staff', body: 'We are looking into it.', created_at: '2026-10-20T15:10:00Z' }],
      }),
    );
    await render(<CaseScreen id={ID} source={src} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByText('The other side reported a problem')).toBeTruthy();
    expect(screen.getByTestId('case-paused')).toBeTruthy();
    expect(screen.getByText('Xspeeria team')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('case-reply'), 'I sent it on time.');
    await fireEvent.press(screen.getByTestId('case-send'));
    await flush();
    expect(src.message).toHaveBeenCalledWith(ID, 'I sent it on time.');
    expect(screen.getByText('I sent it on time.')).toBeTruthy();
    expect(screen.getByTestId('case-reply').props.value).toBe('');

    src.get.mockResolvedValueOnce(dispute({ status: 'resolved', resolved_at: '2026-10-21T10:00:00Z', outcome: 'no_fault' }));
    await render(<CaseScreen id={ID} source={src} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('case-closed')).toBeTruthy();
    expect(screen.queryByTestId('case-reply')).toBeNull();
  });

  it('the notification links only to a valid case id', () => {
    expect(notificationCopy({ event: 'dispute.opened', data: { dispute_id: ID, match_id: TX } }).link).toBe(`/market/case?id=${ID}`);
    expect(notificationCopy({ event: 'dispute.opened', data: { dispute_id: '../x' } }).link).toBe('/market/disputes');
  });
});
