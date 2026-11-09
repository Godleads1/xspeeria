/** ADR-103: "Need help?" for someone who can't log in — the form, the saved key and the thread. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { HelpThread } from '../src/api/helpApi';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import type { HelpKeyStore, SavedHelp } from '../src/features/help/helpKey';
import { NeedHelpScreen, type HelpSource } from '../src/features/help/NeedHelpScreen';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });

function memoryStore(start: SavedHelp | null = null): HelpKeyStore & { value: SavedHelp | null } {
  const s: HelpKeyStore & { value: SavedHelp | null } = {
    value: start,
    read: jest.fn(async (): Promise<SavedHelp | null> => s.value),
    save: jest.fn(async (v: SavedHelp) => {
      s.value = v;
    }),
    clear: jest.fn(async () => {
      s.value = null;
    }),
  };
  return s;
}

const thread = (status: 'open' | 'closed'): HelpThread => ({
  request_id: 'r-1',
  status,
  messages: [
    { message_id: 'm1', author: 'you', body: 'The face check fails on my new phone', created_at: '2026-11-09T10:00:00Z' },
    { message_id: 'm2', author: 'staff', body: 'We are looking into it', created_at: '2026-11-09T10:05:00Z' },
  ],
});

function fake(status: 'open' | 'closed' = 'open'): jest.Mocked<HelpSource> {
  return {
    open: jest.fn(async (_p: string, _e: string, _m: string) => ({ request_id: 'r-1', key: 'secret-key' })),
    read: jest.fn(async (_r: string, _k: string) => thread(status)),
    reply: jest.fn(async (_r: string, _k: string, _m: string) => undefined),
  };
}

describe('Need help (ADR-103)', () => {
  it('sends the form, keeps the key on this phone and shows the thread', async () => {
    const src = fake();
    const store = memoryStore();
    await render(<NeedHelpScreen source={src} store={store} onBack={jest.fn()} />);
    await flush();
    await fireEvent.changeText(screen.getByTestId('help-phone'), '8038383838');
    await fireEvent.changeText(screen.getByTestId('help-email'), ' ada@example.com ');
    await fireEvent.changeText(screen.getByTestId('help-message'), 'The face check fails on my new phone');
    await fireEvent.press(screen.getByTestId('help-send'));
    await flush();
    expect(src.open).toHaveBeenCalledWith('+2348038383838', 'ada@example.com', 'The face check fails on my new phone');
    expect(store.save).toHaveBeenCalledWith({ requestId: 'r-1', key: 'secret-key' });
    expect(src.read).toHaveBeenCalledWith('r-1', 'secret-key');
    expect(screen.getByTestId('help-messages')).toHaveTextContent(/We are looking into it/);
    expect(screen.getByTestId('help-messages')).toHaveTextContent(/Xspeeria team/);
  });

  it('checks the form before sending', async () => {
    const src = fake();
    await render(<NeedHelpScreen source={src} store={memoryStore()} onBack={jest.fn()} />);
    await flush();
    await fireEvent.press(screen.getByTestId('help-send'));
    expect(screen.getByTestId('help-error')).toHaveTextContent('Enter a valid phone number');
    await fireEvent.changeText(screen.getByTestId('help-phone'), '8038383838');
    await fireEvent.changeText(screen.getByTestId('help-email'), 'not-an-email');
    await fireEvent.press(screen.getByTestId('help-send'));
    expect(screen.getByTestId('help-error')).toHaveTextContent('Enter a valid email address');
    await fireEvent.changeText(screen.getByTestId('help-email'), 'ada@example.com');
    await fireEvent.press(screen.getByTestId('help-send'));
    expect(screen.getByTestId('help-error')).toHaveTextContent('Tell us what went wrong');
    expect(src.open).not.toHaveBeenCalled();
  });

  it('replies on an open request and shows a server refusal', async () => {
    const src = fake();
    await render(<NeedHelpScreen source={src} store={memoryStore({ requestId: 'r-1', key: 'k' })} onBack={jest.fn()} />);
    await flush();
    await fireEvent.changeText(screen.getByTestId('help-reply'), '  Thanks  ');
    await fireEvent.press(screen.getByTestId('help-reply-send'));
    await flush();
    expect(src.reply).toHaveBeenCalledWith('r-1', 'k', 'Thanks');
    expect(src.read).toHaveBeenCalledTimes(2);

    src.reply.mockRejectedValueOnce(
      new ApiError('BUS_429_HELP_WAIT', 429, 'Please wait for our team to answer before sending more.'),
    );
    await fireEvent.changeText(screen.getByTestId('help-reply'), 'Hello?');
    await fireEvent.press(screen.getByTestId('help-reply-send'));
    await flush();
    expect(screen.getByTestId('help-send-error')).toHaveTextContent(/wait for our team/);
  });

  it('a closed request offers a new one, which forgets the old key', async () => {
    const store = memoryStore({ requestId: 'r-1', key: 'k' });
    await render(<NeedHelpScreen source={fake('closed')} store={store} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('help-closed')).toBeTruthy();
    expect(screen.queryByTestId('help-reply')).toBeNull();
    await fireEvent.press(screen.getByTestId('help-new'));
    await flush();
    expect(store.clear).toHaveBeenCalled();
    expect(screen.getByTestId('help-send')).toBeTruthy();
  });

  it('the log-in screen shows "Need help?" only when given', async () => {
    const onHelp = jest.fn();
    const { rerender } = await render(<LoginScreen onDone={jest.fn()} onSignUp={jest.fn()} onForgot={jest.fn()} />);
    expect(screen.queryByTestId('login-help')).toBeNull();
    await rerender(<LoginScreen onDone={jest.fn()} onSignUp={jest.fn()} onForgot={jest.fn()} onHelp={onHelp} />);
    await fireEvent.press(screen.getByTestId('login-help'));
    expect(onHelp).toHaveBeenCalled();
  });
});
