/**
 * ADR-054: "Confirm it's you" in server builds — Fingerprint/Face ID first, otherwise a face
 * check or an email code — and the screen that explains the checks. The server is a fake;
 * its rules are tested on the server.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { secureTokens } from '../src/api/secureTokens';
import { serverAuth } from '../src/features/auth/serverAuth';
import { session } from '../src/features/auth/session';
import { SecondCheckInfoScreen } from '../src/features/security/SecondCheckInfoScreen';
import { ServerConfirm } from '../src/features/security/ServerConfirm';
import { ServerConfirmHost } from '../src/features/security/ServerConfirmHost';
import { confirmIdentity } from '../src/features/security/serverConfirm';

const mockStore = new Map<string, string>();
let mockBiometric = true;
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'y',
  canUseBiometricAuthentication: jest.fn(() => mockBiometric),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

const BASE = 'http://127.0.0.1:8000';
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const TOKENS = { access_token: 'acc-1', refresh_token: 'ref-1', token_type: 'bearer', check_required: false };
const ME = { user_id: 'u1', phone: '+2348031112222', email: 'ada@example.com', status: 'active' };
const APPROVAL = { step_up_token: 'grant-1', action: 'pin.change', expires_in_seconds: 300 };
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });

type Handler = (body: Record<string, unknown> | null) => [number, unknown];

function fakeServer(routes: Record<string, Handler>): { path: string; body: Record<string, unknown> | null }[] {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const all: Record<string, Handler> = {
    '/api/v1/auth/login': () => [200, TOKENS],
    '/api/v1/users/me': () => [200, ME],
    ...routes,
  };
  serverAuth.useFetch((async (url: string, init: RequestInit) => {
    const path = url.replace(/^[^/]*\/\/[^/]+/, '');
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ path, body });
    const [status, json] = all[path]?.(body) ?? [404, { error: { code: 'RES_404_NOT_FOUND', message: 'Not found' } }];
    return { ok: status < 300, status, json: async () => json } as Response;
  }) as typeof fetch, BASE);
  return calls;
}

const check = (method: string) => ({
  check_required: true,
  check_id: 'sc-1',
  purpose: 'step_up',
  method,
  email_hint: method === 'email' ? 'a***@example.com' : null,
  phone_hint: null,
});

beforeEach(async () => {
  mockStore.clear();
  mockBiometric = true;
  session.reset();
  serverAuth.reset();
});

async function signedIn(routes: Record<string, Handler>): Promise<{ path: string; body: Record<string, unknown> | null }[]> {
  const calls = fakeServer(routes);
  await serverAuth.login(ME.phone, '482613', T0);
  return calls;
}

describe('Confirm it’s you (server builds)', () => {
  it('fails closed with no sheet mounted', async () => {
    await expect(confirmIdentity('pin.change', 'Change your PIN.')).resolves.toBeNull();
  });

  it('uses Fingerprint/Face ID when it is on: no sheet, one approval', async () => {
    const calls = await signedIn({ '/api/v1/auth/step-up': () => [200, APPROVAL] });
    session.setBiometric(true);
    mockStore.set('xspeeria.unlockKey', 'unlock-key-abcdefghijklmnopqrstu');
    await render(<ServerConfirmHost openUrl={jest.fn()} />);
    let result: string | null = null;
    await act(async () => {
      result = await confirmIdentity('pin.change', 'Change your PIN.');
    });
    expect(result).toBe('grant-1');
    expect(calls.at(-1)).toEqual({ path: '/api/v1/auth/step-up', body: { action: 'pin.change', unlock_key: 'unlock-key-abcdefghijklmnopqrstu' } });
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();
  });

  it('without fingerprint: the email code before the identity check', async () => {
    mockBiometric = false;
    const calls = await signedIn({
      '/api/v1/auth/step-up/checks': () => [200, check('email')],
      '/api/v1/auth/step-up/checks/sc-1/code': (b) =>
        b?.email_code === '123456' ? [200, APPROVAL] : [401, { error: { code: 'AUTH_401_INVALID_OTP', message: 'That code is not right.' } }],
    });
    await render(<ServerConfirmHost openUrl={jest.fn()} />);
    let pending: Promise<string | null> = Promise.resolve(null);
    await act(async () => {
      pending = confirmIdentity('pin.change', 'Change your PIN.');
    });
    await flush();
    expect(screen.getByTestId('confirm-sheet')).toHaveTextContent(/Change your PIN\./);
    expect(screen.getByTestId('check-text')).toHaveTextContent(/a\*\*\*@example\.com/);
    await fireEvent.changeText(screen.getByTestId('check-email'), '000000');
    await fireEvent.press(screen.getByTestId('check-submit'));
    await flush();
    expect(screen.getByTestId('check-error')).toHaveTextContent('That code is not right.');
    await fireEvent.changeText(screen.getByTestId('check-email'), '123456');
    await fireEvent.press(screen.getByTestId('check-submit'));
    await flush();
    await expect(pending).resolves.toBe('grant-1');
    expect(calls.some((c) => c.path === '/api/v1/auth/step-up')).toBe(false); // no fingerprint try
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();
  });

  it('a cancelled fingerprint falls back to the face check after the identity check', async () => {
    let finished = false;
    await signedIn({
      '/api/v1/auth/step-up/checks': () => [200, check('face')],
      '/api/v1/auth/step-up/checks/sc-1/face': () => [200, { url: 'https://verify.didit.me/s/2' }],
      '/api/v1/auth/step-up/checks/sc-1/face/result': () =>
        finished ? [200, APPROVAL] : [409, { error: { code: 'AUTH_409_FACE_CHECK_PENDING', message: 'Your face check is not finished yet.' } }],
    });
    session.setBiometric(true); // on, but no key comes back (cancelled)
    const openUrl = jest.fn(async () => undefined);
    await render(<ServerConfirmHost openUrl={openUrl} />);
    let pending: Promise<string | null> = Promise.resolve(null);
    await act(async () => {
      pending = confirmIdentity('trade.accept', 'Take 200.00 USD');
    });
    await flush();
    await fireEvent.press(screen.getByTestId('check-face'));
    await flush();
    expect(openUrl).toHaveBeenCalledWith('https://verify.didit.me/s/2');
    await fireEvent.press(screen.getByTestId('check-face'));
    await flush();
    expect(screen.getByTestId('check-error')).toHaveTextContent('Your face check is not finished yet.');
    finished = true;
    await fireEvent.press(screen.getByTestId('check-face'));
    await flush();
    await expect(pending).resolves.toBe('grant-1');
  });

  it('cancel resolves null; a failed start can be tried again', async () => {
    mockBiometric = false;
    let n = 0;
    await signedIn({
      '/api/v1/auth/step-up/checks': () =>
        ++n === 1 ? [429, { error: { code: 'AUTH_429_RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' } }] : [200, check('email')],
    });
    await render(<ServerConfirmHost openUrl={jest.fn()} />);
    let pending: Promise<string | null> = Promise.resolve('x');
    await act(async () => {
      pending = confirmIdentity('pin.change', 'Change your PIN.');
    });
    await flush();
    expect(screen.getByTestId('confirm-error')).toHaveTextContent(/Too many attempts/);
    await fireEvent.press(screen.getByTestId('confirm-retry'));
    await flush();
    expect(screen.getByTestId('check-email')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirm-cancel'));
    await flush();
    await expect(pending).resolves.toBeNull();
  });

  it('ServerConfirm runs the action with the approval, or reports its error', async () => {
    const confirm = jest.fn(async () => 'grant-9');
    const onSubmit = jest.fn(async () => undefined);
    const onCancel = jest.fn();
    await render(<ServerConfirm visible action="pin.change" reason="Change your PIN." onSubmit={onSubmit} onCancel={onCancel} confirm={confirm} />);
    await flush();
    expect(confirm).toHaveBeenCalledWith('pin.change', 'Change your PIN.');
    expect(onSubmit).toHaveBeenCalledWith('grant-9');
    const onError = jest.fn();
    await render(
      <ServerConfirm
        visible
        action="pin.change"
        reason="r"
        onSubmit={async () => {
          throw new Error('boom');
        }}
        onCancel={onCancel}
        onError={onError}
        confirm={confirm}
      />,
    );
    await flush();
    expect(onError).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('explains the checks', async () => {
    await render(<SecondCheckInfoScreen onBack={jest.fn()} />);
    expect(screen.getByText('Face check')).toBeTruthy();
    expect(screen.getByText('Fingerprint or Face ID')).toBeTruthy();
    expect(screen.queryByText(/authenticator/i)).toBeNull();
  });
});

afterAll(async () => {
  await secureTokens.setRefreshToken(null);
});
