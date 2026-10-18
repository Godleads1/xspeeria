/**
 * ADR-027: the app talking to the real sign-in and 2FA server — config, request client,
 * secure token storage, the sign-in orchestration and the server-mode screens.
 * The server is a scripted fake `fetch`; its rules are tested on the server itself.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError, apiRequest, messageFor } from '../src/api/client';
import { parseApiUrl } from '../src/api/config';
import { secureTokens } from '../src/api/secureTokens';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { MfaScreen, ServerCodeScreen } from '../src/features/auth/ServerScreens';
import { KEEP_ALIVE_MS, serverAuth } from '../src/features/auth/serverAuth';
import { session } from '../src/features/auth/session';
import { AuthenticatorSetupScreen } from '../src/features/security/AuthenticatorSetupScreen';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

const T0 = Date.UTC(2026, 9, 18, 10, 0, 0);
const BASE = 'http://127.0.0.1:8000';

type Handler = (body: Record<string, unknown> | null, headers: Record<string, string>) => [number, unknown];

/** A tiny scripted server: path → handler. Records every call. */
function fakeServer(routes: Record<string, Handler>): { fetch: typeof fetch; calls: { path: string; body: Record<string, unknown> | null; headers: Record<string, string> }[] } {
  const calls: { path: string; body: Record<string, unknown> | null; headers: Record<string, string> }[] = [];
  const impl = jest.fn(async (url: string, init: RequestInit) => {
    const path = url.replace(BASE, '');
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ path, body, headers });
    const route = routes[path];
    const [status, json] = route ? route(body, headers) : [404, { error: { code: 'RES_404_NOT_FOUND', message: 'Not found' } }];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
    } as Response;
  });
  return { fetch: impl as unknown as typeof fetch, calls };
}

const TOKENS = { access_token: 'acc-1', refresh_token: 'ref-1', token_type: 'bearer', mfa_required: false };
const ME = { user_id: 'u1', phone: '+2348031112222', email: 'ada@example.com', status: 'active' };
const err = (code: string, status: number, message = 'Nope', retry?: number): [number, unknown] => [
  status,
  { error: { code, message, ...(retry ? { details: { retry_after_seconds: retry } } : {}) } },
];

beforeEach(() => {
  mockStore.clear();
  session.reset();
  serverAuth.reset();
  serverAuth.useFetch(undefined);
});

describe('server address (ADR-027)', () => {
  it.each([
    ['https://api.xspeeria.com', 'https://api.xspeeria.com'],
    ['https://api.xspeeria.com/', 'https://api.xspeeria.com'],
    ['http://192.168.1.20:8000', 'http://192.168.1.20:8000'],
    ['http://127.0.0.1:8000/', 'http://127.0.0.1:8000'],
    ['http://localhost:8000', 'http://localhost:8000'],
    ['http://172.20.0.5:8000', 'http://172.20.0.5:8000'],
  ])('accepts %s', (raw, clean) => expect(parseApiUrl(raw)).toBe(clean));

  it.each([
    'http://api.xspeeria.com', // plain http to the internet
    'http://8.8.8.8:8000',
    'https://user:pw@api.xspeeria.com',
    'https://api.xspeeria.com/?x=1',
    'ftp://api.xspeeria.com',
    'javascript:alert(1)',
    '',
    undefined,
  ])('refuses %p', (raw) => expect(parseApiUrl(raw)).toBeNull());
});

describe('request client', () => {
  it('sends JSON with the bearer token and returns the body', async () => {
    const s = fakeServer({ '/x': () => [200, { ok: 1 }] });
    await expect(apiRequest('POST', '/x', { body: { a: 1 }, token: 'tok', fetchImpl: s.fetch, baseUrl: BASE })).resolves.toEqual({ ok: 1 });
    expect(s.calls[0].headers.Authorization).toBe('Bearer tok');
    expect(s.calls[0].headers['Content-Type']).toBe('application/json');
  });

  it('turns the error envelope into an ApiError with the wait time', async () => {
    const s = fakeServer({ '/x': () => err('AUTH_429_RATE_LIMITED', 429, 'Too many attempts.', 840) });
    const e = await apiRequest('POST', '/x', { fetchImpl: s.fetch, baseUrl: BASE }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: 'AUTH_429_RATE_LIMITED', status: 429, retryAfterSeconds: 840 });
    expect(messageFor(e)).toBe('Too many attempts. Try again in 14 minutes.');
  });

  it('a network failure or time-out is a plain "can’t reach" error', async () => {
    const down = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(apiRequest('GET', '/x', { fetchImpl: down, baseUrl: BASE })).rejects.toMatchObject({ code: 'NETWORK' });

    jest.useFakeTimers();
    const hang = jest.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const p = apiRequest('GET', '/x', { fetchImpl: hang, baseUrl: BASE, timeoutMs: 1000 });
    jest.advanceTimersByTime(1000);
    await expect(p).rejects.toMatchObject({ code: 'NETWORK' });
    jest.useRealTimers();
  });

  it('refuses to run without a server address', async () => {
    await expect(apiRequest('GET', '/x', { baseUrl: null })).rejects.toMatchObject({ code: 'APP_NOT_CONFIGURED' });
  });
});

/** Points serverAuth at a fake server with the given extra routes. */
function useServer(routes: Record<string, Handler>): ReturnType<typeof fakeServer> {
  const s = fakeServer({ '/api/v1/users/me': () => [200, ME], ...routes });
  serverAuth.useFetch(((url: string, init: RequestInit) => s.fetch(url.replace(/^[^/]*\/\/[^/]+/, BASE), init)) as typeof fetch);
  return s;
}

describe('sign-in orchestration', () => {
  it('a trusted device signs straight in; tokens go to secure storage, never the PIN', async () => {
    await secureTokens.setDeviceToken('dev-tok-1234567890123456');
    const s = useServer({ '/api/v1/auth/login': () => [200, TOKENS] });
    await expect(serverAuth.login('+2348031112222', '482613', T0)).resolves.toBe('signedIn');
    expect(s.calls[0].body).toMatchObject({ device_token: 'dev-tok-1234567890123456' });
    expect(session.get()).toMatchObject({ signedIn: true, account: { phone: ME.phone, email: ME.email, pin: '' } });
    expect(await secureTokens.refreshToken()).toBe('ref-1');
    expect([...mockStore.values()].join(' ')).not.toContain('482613');
    expect(serverAuth.accessToken()).toBe('acc-1');
  });

  it('a new device gets the 2FA step, then a session and a trusted-device token', async () => {
    useServer({
      '/api/v1/auth/login': () => [200, { mfa_required: true, mfa_challenge_id: 'c1', enrolment_required: false }],
      '/api/v1/auth/mfa/verify': (b) => (b?.otp_code === '123456' ? [200, { ...TOKENS, device_token: 'new-device-token-abcdefgh' }] : err('AUTH_401_INVALID_OTP', 401, 'That code is not right.')),
    });
    await expect(serverAuth.login(ME.phone, '482613', T0)).resolves.toBe('mfa');
    expect(session.get().signedIn).toBe(false);
    await expect(serverAuth.verifyMfa({ otp: '000000' }, T0)).rejects.toMatchObject({ code: 'AUTH_401_INVALID_OTP' });
    await serverAuth.verifyMfa({ otp: '123456' }, T0);
    expect(session.get().signedIn).toBe(true);
    expect(await secureTokens.deviceToken()).toBe('new-device-token-abcdefgh');
  });

  it('an unfinished sign-up is sent to authenticator set-up', async () => {
    useServer({ '/api/v1/auth/login': () => [200, { mfa_required: true, mfa_challenge_id: 'c2', enrolment_required: true }] });
    await expect(serverAuth.login(ME.phone, '482613', T0)).resolves.toBe('enrol');
    expect(serverAuth.hasChallenge()).toBe(true);
  });

  it('sign-up: phone code → authenticator → recovery codes → session only at the end', async () => {
    const s = useServer({
      '/api/v1/auth/register': () => [201, { status: 'pending_verification' }],
      '/api/v1/auth/verify-phone': () => [200, { mfa_required: true, mfa_challenge_id: 'c3', enrolment_required: true }],
      '/api/v1/auth/mfa/enrol/start': () => [200, { secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/x' }],
      '/api/v1/auth/mfa/enrol/confirm': () => [200, { ...TOKENS, device_token: 'dt-abcdefghijklmnopqrst', recovery_codes: ['AAAA-BBBB'] }],
    });
    await serverAuth.register({ phone: ME.phone, email: ME.email, pin: '482613' });
    await serverAuth.verifyPhone(ME.phone, '123456');
    await expect(serverAuth.enrolStart()).resolves.toEqual({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' });
    await expect(serverAuth.enrolConfirm('654321')).resolves.toEqual(['AAAA-BBBB']);
    expect(session.get().signedIn).toBe(false); // recovery codes still on screen
    expect(serverAuth.hasPending()).toBe(true);
    await serverAuth.finish(T0, { newAccount: true });
    expect(session.get().signedIn).toBe(true);
    expect(s.calls.map((c) => c.path)).toEqual([
      '/api/v1/auth/register',
      '/api/v1/auth/verify-phone',
      '/api/v1/auth/mfa/enrol/start',
      '/api/v1/auth/mfa/enrol/confirm',
      '/api/v1/users/me',
    ]);
  });

  it('keeps the session alive with a refresh at most every 4 minutes', async () => {
    let n = 0;
    const s = useServer({
      '/api/v1/auth/login': () => [200, TOKENS],
      '/api/v1/auth/refresh': (_b, h) => {
        n += 1;
        expect(h.Authorization).toBe(`Bearer ref-${n}`);
        return [200, { ...TOKENS, access_token: `acc-${n + 1}`, refresh_token: `ref-${n + 1}` }];
      },
    });
    await serverAuth.login(ME.phone, '482613', T0);
    await serverAuth.keepAlive(T0 + KEEP_ALIVE_MS - 1);
    expect(s.calls.filter((c) => c.path.endsWith('/refresh'))).toHaveLength(0);
    await serverAuth.keepAlive(T0 + KEEP_ALIVE_MS);
    expect(serverAuth.accessToken()).toBe('acc-2');
    expect(await secureTokens.refreshToken()).toBe('ref-2');
  });

  it('a refused refresh ends the session; a network blip does not', async () => {
    let mode: 'down' | 'refused' = 'down';
    useServer({
      '/api/v1/auth/login': () => [200, TOKENS],
      '/api/v1/auth/refresh': () => (mode === 'down' ? [503, null] : err('AUTH_401_INVALID_REFRESH_TOKEN', 401)),
    });
    await serverAuth.login(ME.phone, '482613', T0);
    await serverAuth.keepAlive(T0 + KEEP_ALIVE_MS);
    expect(session.get().signedIn).toBe(true);
    mode = 'refused';
    await serverAuth.keepAlive(T0 + KEEP_ALIVE_MS + 1);
    expect(session.get()).toMatchObject({ signedIn: false, endedBy: 'expired' });
    expect(serverAuth.accessToken()).toBeNull();
    expect(await secureTokens.refreshToken()).toBeNull();
  });

  it('log-out tells the server and drops tokens, but keeps the trusted-device token', async () => {
    await secureTokens.setDeviceToken('dev-tok-1234567890123456');
    const s = useServer({ '/api/v1/auth/login': () => [200, TOKENS], '/api/v1/auth/logout': () => [204, null] });
    await serverAuth.login(ME.phone, '482613', T0);
    session.logOut();
    await act(async () => undefined);
    expect(s.calls.at(-1)).toMatchObject({ path: '/api/v1/auth/logout', headers: { Authorization: 'Bearer acc-1' } });
    expect(await secureTokens.refreshToken()).toBeNull();
    expect(await secureTokens.deviceToken()).toBe('dev-tok-1234567890123456');
  });

  it('the app’s idle lock also drops the server tokens', async () => {
    useServer({ '/api/v1/auth/login': () => [200, TOKENS], '/api/v1/auth/logout': () => [204, null] });
    await serverAuth.login(ME.phone, '482613', T0);
    session.enforceTimeouts(T0 + 5 * 60 * 1000);
    expect(serverAuth.accessToken()).toBeNull();
  });

  it('restores a live session at app start, and forgets a dead one', async () => {
    await secureTokens.setRefreshToken('ref-1');
    useServer({ '/api/v1/auth/refresh': () => [200, { ...TOKENS, refresh_token: 'ref-2' }] });
    await serverAuth.restore(T0);
    expect(session.get().signedIn).toBe(true);
    expect(await secureTokens.refreshToken()).toBe('ref-2');

    session.reset();
    serverAuth.reset();
    await secureTokens.setRefreshToken('ref-dead');
    useServer({ '/api/v1/auth/refresh': () => err('AUTH_401_INVALID_REFRESH_TOKEN', 401) });
    await serverAuth.restore(T0);
    expect(session.get().signedIn).toBe(false);
    expect(await secureTokens.refreshToken()).toBeNull();
  });
});

describe('server-mode screens', () => {
  const props = { onDone: jest.fn(), onSignUp: jest.fn(), onForgot: jest.fn(), now: () => T0 };

  it('log-in: success, 2FA step, and the server’s error shown', async () => {
    const login = jest
      .fn()
      .mockResolvedValueOnce('signedIn')
      .mockResolvedValueOnce('mfa')
      .mockRejectedValueOnce(new ApiError('AUTH_401_INVALID_CREDENTIALS', 401, 'The phone number, email or PIN is incorrect.'));
    const onSecondFactor = jest.fn();
    await render(<LoginScreen {...props} server={{ login }} onSecondFactor={onSecondFactor} />);
    expect(screen.queryByTestId('login-faceid')).toBeNull(); // Face ID waits for passkeys
    expect(screen.queryByTestId('login-demo')).toBeNull();
    const enter = async (): Promise<void> => {
      await fireEvent.changeText(screen.getByTestId('login-phone'), '8031112222');
      await fireEvent.changeText(screen.getByTestId('login-pin'), '482613');
      await fireEvent.press(screen.getByTestId('login-submit'));
      await act(async () => undefined);
    };
    await enter();
    expect(props.onDone).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith('+2348031112222', '482613', T0);
    await enter();
    expect(onSecondFactor).toHaveBeenCalledWith('mfa');
    await enter();
    expect(screen.getByTestId('login-error').props.children).toBe('The phone number, email or PIN is incorrect.');
  });

  it('2FA screen: code, recovery code, and an expired step goes back to log-in', async () => {
    const verify = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('AUTH_401_INVALID_OTP', 401, 'That code is not right.'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, 'Expired'));
    const onDone = jest.fn();
    const onRestart = jest.fn();
    await render(<MfaScreen verify={verify} onDone={onDone} onRestart={onRestart} />);
    await fireEvent.changeText(screen.getByTestId('mfa-code-input'), '111111');
    await fireEvent.press(screen.getByTestId('mfa-verify'));
    await act(async () => undefined);
    expect(screen.getByTestId('mfa-error').props.children).toBe('That code is not right.');

    await fireEvent.press(screen.getByTestId('mfa-toggle'));
    await fireEvent.changeText(screen.getByTestId('mfa-recovery-input'), 'abcd-2345');
    await fireEvent.press(screen.getByTestId('mfa-verify'));
    await act(async () => undefined);
    expect(verify).toHaveBeenLastCalledWith({ recovery: 'ABCD-2345' });
    expect(onDone).toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('mfa-recovery-input'), 'ABCD-2345');
    await fireEvent.press(screen.getByTestId('mfa-verify'));
    await act(async () => undefined);
    expect(onRestart).toHaveBeenCalled();
  });

  it('SMS code screen: verifies with the server and shows its errors', async () => {
    const verify = jest.fn().mockRejectedValueOnce(new ApiError('AUTH_401_INVALID_OTP', 401, 'That code is not right.')).mockResolvedValueOnce(undefined);
    const onVerified = jest.fn();
    await render(<ServerCodeScreen phone="+2348031112222" verify={verify} resend={jest.fn()} onVerified={onVerified} onBack={jest.fn()} />);
    expect(screen.getByText(/ending with \*\*\*\*\*\*2222/)).toBeTruthy();
    expect(screen.getByTestId('server-sms-resend')).toBeDisabled();
    for (let i = 0; i < 2; i++) {
      await fireEvent.changeText(screen.getByTestId('server-sms-code-input'), '123456');
      await fireEvent.press(screen.getByTestId('server-sms-verify'));
      await act(async () => undefined);
    }
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('authenticator set-up uses the server’s secret and shows its recovery codes', async () => {
    const engine = {
      begin: jest.fn().mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Xspeeria:x?secret=JBSWY3DPEHPK3PXP' }),
      confirm: jest.fn().mockRejectedValueOnce(new ApiError('AUTH_401_INVALID_OTP', 401, 'That code is not right.')).mockResolvedValueOnce(['AAAA-BBBB', 'CCCC-DDDD']),
      messageFor,
    };
    await render(<AuthenticatorSetupScreen account="" random={() => new Uint8Array(20)} engine={engine} onBack={jest.fn()} onDone={jest.fn()} />);
    await act(async () => undefined);
    expect(screen.getByTestId('authenticator-key').props.children).toBe('JBSW Y3DP EHPK 3PXP');
    for (let i = 0; i < 2; i++) {
      await fireEvent.changeText(screen.getByTestId('authenticator-code'), '123456');
      await fireEvent.press(screen.getByTestId('authenticator-verify'));
      await act(async () => undefined);
    }
    expect(engine.confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByText('AAAA-BBBB')).toBeTruthy();
  });
});
