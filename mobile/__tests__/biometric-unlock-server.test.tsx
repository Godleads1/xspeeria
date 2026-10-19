/**
 * ADR-048: Face ID/fingerprint unlock after the 5-minute idle lock in server builds.
 * The server is a scripted fake `fetch`; its rules are tested on the server itself.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { secureTokens } from '../src/api/secureTokens';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { serverAuth } from '../src/features/auth/serverAuth';
import { IDLE_LOCK_MS, session } from '../src/features/auth/session';
import { SecurityScreen, type BiometricControl } from '../src/features/profile/SecurityScreen';

const mockStore = new Map<string, { value: string; options: Record<string, unknown> | undefined }>();
let mockBiometricReady = true;
let mockFingerprintOk = true;
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'whenPasscodeSetThisDeviceOnly',
  canUseBiometricAuthentication: jest.fn(() => mockBiometricReady),
  getItemAsync: jest.fn(async (k: string, o?: { requireAuthentication?: boolean }) => {
    // A key kept behind the biometric prompt comes out only when the fingerprint matches.
    if (o?.requireAuthentication && !mockFingerprintOk) throw new Error('User canceled the authentication');
    return mockStore.get(k)?.value ?? null;
  }),
  setItemAsync: jest.fn(async (k: string, v: string, o?: Record<string, unknown>) => void mockStore.set(k, { value: v, options: o })),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

const T0 = Date.UTC(2026, 9, 19, 10, 0, 0);
const BASE = 'http://127.0.0.1:8000';
const UNLOCK = 'xspeeria.unlockKey';

type Handler = (body: Record<string, unknown> | null, method: string) => [number, unknown];

function fakeServer(routes: Record<string, Handler>): { path: string; method: string; body: Record<string, unknown> | null }[] {
  const calls: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  const all: Record<string, Handler> = { '/api/v1/users/me': () => [200, ME], '/api/v1/auth/logout': () => [204, null], ...routes };
  const impl = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace(/^[^/]*\/\/[^/]+/, '');
    const method = init.method ?? 'GET';
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ path, method, body });
    const route = all[path];
    const [status, json] = route ? route(body, method) : [404, { error: { code: 'RES_404_NOT_FOUND', message: 'Not found' } }];
    return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
  });
  serverAuth.useFetch(impl as unknown as typeof fetch, BASE);
  return calls;
}

const TOKENS = { access_token: 'acc-1', refresh_token: 'ref-1', token_type: 'bearer', mfa_required: false };
const ME = { user_id: 'u1', phone: '+2348031112222', email: 'ada@example.com', status: 'active' };
const err = (code: string, status: number, message = 'Nope'): [number, unknown] => [status, { error: { code, message } }];

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });

beforeEach(() => {
  mockStore.clear();
  mockBiometricReady = true;
  mockFingerprintOk = true;
  session.reset();
  serverAuth.reset();
  serverAuth.useFetch(undefined);
});

async function signedInWithBiometric(extra: Record<string, Handler> = {}): Promise<ReturnType<typeof fakeServer>> {
  await secureTokens.setDeviceToken('dev-tok-1234567890123456');
  const calls = fakeServer({
    '/api/v1/auth/login': () => [200, TOKENS],
    '/api/v1/auth/biometric': (_b, m) => (m === 'DELETE' ? [204, null] : [200, { unlock_key: 'unlock-key-abcdefghijklmnop' }]),
    ...extra,
  });
  await serverAuth.login(ME.phone, '482613', T0);
  await serverAuth.enableBiometric();
  return calls;
}

describe('turning it on', () => {
  it('keeps the key behind the biometric prompt and sends the trusted-device token', async () => {
    const calls = await signedInWithBiometric();
    expect(calls.find((c) => c.path === '/api/v1/auth/biometric')?.body).toEqual({ device_token: 'dev-tok-1234567890123456' });
    expect(mockStore.get(UNLOCK)).toMatchObject({ value: 'unlock-key-abcdefghijklmnop', options: { requireAuthentication: true } });
    expect(session.biometricOn()).toBe(true);
  });

  it('needs a trusted device and a phone with Face ID or a fingerprint', async () => {
    await secureTokens.setDeviceToken(null);
    fakeServer({ '/api/v1/auth/login': () => [200, TOKENS] });
    await serverAuth.login(ME.phone, '482613', T0);
    await expect(serverAuth.enableBiometric()).rejects.toMatchObject({ code: 'AUTH_403_DEVICE_NOT_TRUSTED' });
    await secureTokens.setDeviceToken('dev-tok-1234567890123456');
    mockBiometricReady = false;
    await expect(serverAuth.enableBiometric()).rejects.toMatchObject({ code: 'BIOMETRIC_UNAVAILABLE' });
    expect(session.biometricOn()).toBe(false);
    expect(mockStore.has(UNLOCK)).toBe(false);
  });
});

describe('the idle lock', () => {
  it('with it on, keeps the refresh token and unlocks with the fingerprint', async () => {
    const calls = await signedInWithBiometric({
      '/api/v1/auth/biometric/unlock': (b) =>
        b?.refresh_token === 'ref-1' && b.unlock_key === 'unlock-key-abcdefghijklmnop'
          ? [200, { ...TOKENS, access_token: 'acc-2', refresh_token: 'ref-2' }]
          : err('AUTH_401_INVALID_REFRESH_TOKEN', 401),
    });
    session.enforceTimeouts(T0 + IDLE_LOCK_MS);
    expect(session.get().signedIn).toBe(false);
    expect(serverAuth.accessToken()).toBeNull();
    expect(await secureTokens.refreshToken()).toBe('ref-1');
    expect(calls.some((c) => c.path === '/api/v1/auth/logout')).toBe(false);

    await expect(serverAuth.unlock(T0 + IDLE_LOCK_MS + 1000)).resolves.toBe(true);
    expect(session.get()).toMatchObject({ signedIn: true, signedInAt: T0, account: { phone: ME.phone } });
    expect(serverAuth.accessToken()).toBe('acc-2');
    expect(await secureTokens.refreshToken()).toBe('ref-2');
  });

  it('with it off, ends the session as before', async () => {
    const calls = fakeServer({ '/api/v1/auth/login': () => [200, TOKENS] });
    await serverAuth.login(ME.phone, '482613', T0);
    session.enforceTimeouts(T0 + IDLE_LOCK_MS);
    expect(await secureTokens.refreshToken()).toBeNull();
    expect(calls.some((c) => c.path === '/api/v1/auth/logout')).toBe(true);
    await expect(serverAuth.unlock(T0 + IDLE_LOCK_MS)).resolves.toBe(false);
  });

  it('a cancelled fingerprint sends nothing; a refusal drops the key and asks for the PIN', async () => {
    const calls = await signedInWithBiometric({ '/api/v1/auth/biometric/unlock': () => err('AUTH_401_INVALID_REFRESH_TOKEN', 401, 'Your session has ended. Please log in again.') });
    session.enforceTimeouts(T0 + IDLE_LOCK_MS);
    mockFingerprintOk = false;
    await expect(serverAuth.unlock(T0 + IDLE_LOCK_MS)).resolves.toBe(false);
    expect(calls.some((c) => c.path === '/api/v1/auth/biometric/unlock')).toBe(false);
    mockFingerprintOk = true;
    await expect(serverAuth.unlock(T0 + IDLE_LOCK_MS)).rejects.toMatchObject({ status: 401 });
    expect(await secureTokens.refreshToken()).toBeNull();
    expect(mockStore.has(UNLOCK)).toBe(false);
    expect(session.get().signedIn).toBe(false);
  });

  it('log-out removes the key', async () => {
    await signedInWithBiometric();
    session.logOut();
    expect(mockStore.has(UNLOCK)).toBe(false);
    expect(await secureTokens.refreshToken()).toBeNull();
  });
});

describe('screens', () => {
  it('the log-in screen offers Face ID once it is on, and reports a refusal', async () => {
    const unlock = jest.fn(async () => {
      throw Object.assign(new Error('Your session has ended. Please log in again.'), { status: 401 });
    });
    const onDone = jest.fn();
    const login = jest.fn();
    const { rerender } = await render(<LoginScreen onDone={onDone} onSignUp={jest.fn()} onForgot={jest.fn()} server={{ login, unlock }} />);
    expect(screen.queryByTestId('login-faceid')).toBeNull();
    session.setBiometric(true);
    await rerender(<LoginScreen onDone={onDone} onSignUp={jest.fn()} onForgot={jest.fn()} server={{ login, unlock }} />);
    await fireEvent.press(screen.getByTestId('login-faceid'));
    await flush();
    expect(unlock).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('login-error')).toHaveTextContent(/PIN/);
    unlock.mockResolvedValueOnce(true as never);
    await fireEvent.press(screen.getByTestId('login-faceid'));
    await flush();
    expect(onDone).toHaveBeenCalled();
  });

  it('the Security switch asks for the fingerprint before turning it on', async () => {
    const control: jest.Mocked<BiometricControl> = {
      supported: jest.fn(() => true),
      enable: jest.fn(async () => session.setBiometric(true)),
      disable: jest.fn(async () => session.setBiometric(false)),
    };
    const biometrics = jest.fn(async (_p: string) => 'failed' as const);
    await render(<SecurityScreen onBack={jest.fn()} biometric={control} biometrics={biometrics} />);
    await fireEvent(screen.getByTestId('security-biometric'), 'valueChange', true);
    await flush();
    expect(control.enable).not.toHaveBeenCalled();
    biometrics.mockResolvedValueOnce('ok' as never);
    await fireEvent(screen.getByTestId('security-biometric'), 'valueChange', true);
    await flush();
    expect(control.enable).toHaveBeenCalled();
    await fireEvent(screen.getByTestId('security-biometric'), 'valueChange', false);
    await flush();
    expect(control.disable).toHaveBeenCalled();
  });

  it('the Security switch is hidden in demo builds', async () => {
    await render(<SecurityScreen onBack={jest.fn()} />);
    expect(screen.queryByTestId('security-biometric')).toBeNull();
  });
});
