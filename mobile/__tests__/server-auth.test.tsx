/**
 * ADR-027/054: the app talking to the real sign-in server and its second check — config, request client,
 * secure token storage, the sign-in orchestration and the server-mode screens.
 * The server is a scripted fake `fetch`; its rules are tested on the server itself.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError, apiRequest, messageFor } from '../src/api/client';
import { parseApiUrl } from '../src/api/config';
import { secureTokens } from '../src/api/secureTokens';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { CheckScreen, ServerCodeScreen } from '../src/features/auth/ServerScreens';
import { KEEP_ALIVE_MS, serverAuth } from '../src/features/auth/serverAuth';
import { session } from '../src/features/auth/session';

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

const TOKENS = { access_token: 'acc-1', refresh_token: 'ref-1', token_type: 'bearer', check_required: false };
const check = (purpose: string, method: string, id = 'c1') => ({
  check_required: true,
  check_id: id,
  purpose,
  method,
  email_hint: method === 'face' ? null : 'a***@example.com',
  phone_hint: method === 'sms_email' ? '***2222' : null,
});
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

  it('a new phone before the identity check needs the SMS and email codes', async () => {
    const s = useServer({
      '/api/v1/auth/login': () => [200, check('login', 'sms_email')],
      '/api/v1/auth/checks/c1/codes': (b) =>
        b?.email_code === '123456' && b?.sms_code === '654321'
          ? [200, { ...TOKENS, device_token: 'new-device-token-abcdefgh' }]
          : err('AUTH_401_INVALID_OTP', 401, 'That code is not right.'),
    });
    await expect(serverAuth.login(ME.phone, '482613', T0)).resolves.toBe('check');
    expect(serverAuth.check()).toMatchObject({ method: 'sms_email', phone_hint: '***2222' });
    expect(session.get().signedIn).toBe(false);
    await expect(serverAuth.checkCodes('123456', null, T0)).rejects.toMatchObject({ code: 'AUTH_401_INVALID_OTP' });
    await expect(serverAuth.checkCodes('123456', '654321', T0)).resolves.toBe('signedIn');
    expect(session.get().signedIn).toBe(true);
    expect(await secureTokens.deviceToken()).toBe('new-device-token-abcdefgh');
    expect(serverAuth.hasCheck()).toBe(false);
    expect(s.calls[2].body).toEqual({ email_code: '123456', sms_code: '654321' });
  });

  it('a new phone after the identity check needs the face check', async () => {
    let done = false;
    useServer({
      '/api/v1/auth/login': () => [200, check('login', 'face')],
      '/api/v1/auth/checks/c1/face': () => [200, { url: 'https://verify.didit.me/s/1' }],
      '/api/v1/auth/checks/c1/face/result': () =>
        done ? [200, TOKENS] : err('AUTH_409_FACE_CHECK_PENDING', 409, 'Your face check is not finished yet.'),
    });
    await serverAuth.login(ME.phone, '482613', T0);
    await expect(serverAuth.faceStart()).resolves.toBe('https://verify.didit.me/s/1');
    await expect(serverAuth.faceFinish(T0)).rejects.toMatchObject({ status: 409 });
    expect(serverAuth.hasCheck()).toBe(true); // still open: try again after the selfie
    done = true;
    await expect(serverAuth.faceFinish(T0)).resolves.toBe('signedIn');
    expect(session.get().signedIn).toBe(true);
  });

  it('ADR-104: a new identity check Compliance asked for uses the kyc steps', async () => {
    let done = false;
    const s = useServer({
      '/api/v1/auth/login': () => [200, check('login', 'kyc')],
      '/api/v1/auth/checks/c1/kyc': () => [200, { url: 'https://verify.didit.me/s/2' }],
      '/api/v1/auth/checks/c1/kyc/result': () =>
        done ? [200, TOKENS] : err('AUTH_409_KYC_IN_REVIEW', 409, 'Our team is checking your identity check.'),
    });
    await serverAuth.login(ME.phone, '482613', T0);
    await expect(serverAuth.faceStart()).resolves.toBe('https://verify.didit.me/s/2');
    await expect(serverAuth.faceFinish(T0)).rejects.toMatchObject({ code: 'AUTH_409_KYC_IN_REVIEW' });
    expect(serverAuth.hasCheck()).toBe(true);
    done = true;
    await expect(serverAuth.faceFinish(T0)).resolves.toBe('signedIn');
    expect(s.calls.some((c) => c.path.endsWith('/face') || c.path.endsWith('/face/result'))).toBe(false);
  });

  it('with no open check, the check calls fail cleanly', async () => {
    useServer({});
    await expect(serverAuth.checkCodes('123456', null, T0)).rejects.toMatchObject({ status: 410 });
    await expect(serverAuth.faceStart()).rejects.toMatchObject({ status: 410 });
  });

  it('sign-up: phone code → email code → session only on the last screen', async () => {
    const s = useServer({
      '/api/v1/auth/register': () => [201, { status: 'pending_verification' }],
      '/api/v1/auth/verify-phone': () => [200, check('signup', 'email', 'c3')],
      '/api/v1/auth/checks/c3/codes': () => [200, { ...TOKENS, device_token: 'dt-abcdefghijklmnopqrst' }],
    });
    await serverAuth.register({ phone: ME.phone, email: ME.email, pin: '482613' });
    await serverAuth.verifyPhone(ME.phone, '123456');
    expect(serverAuth.check()).toMatchObject({ purpose: 'signup', method: 'email' });
    await expect(serverAuth.checkCodes('654321', null, T0)).resolves.toBe('signedUp');
    expect(session.get().signedIn).toBe(false);
    expect(serverAuth.hasPending()).toBe(true);
    await serverAuth.finish(T0, { newAccount: true });
    expect(session.get().signedIn).toBe(true);
    expect(s.calls.map((c) => c.path)).toEqual([
      '/api/v1/auth/register',
      '/api/v1/auth/verify-phone',
      '/api/v1/auth/checks/c3/codes',
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

  /** The previous run's idle-lock state, as `session.restore` reads it at app start. */
  async function previousRun(state: { activeAt?: number; locked?: boolean }): Promise<void> {
    await AsyncStorage.clear();
    if (state.activeAt !== undefined) await AsyncStorage.setItem('xspeeria.lastActiveAt', String(state.activeAt));
    if (state.locked) await AsyncStorage.setItem('xspeeria.idleLocked', '1');
    await session.restore();
  }

  it('restores a live session at app start, and forgets a dead one', async () => {
    await secureTokens.setRefreshToken('ref-1');
    await previousRun({ activeAt: T0 - 60 * 1000 });
    useServer({ '/api/v1/auth/refresh': () => [200, { ...TOKENS, refresh_token: 'ref-2' }] });
    await serverAuth.restore(T0);
    expect(session.get().signedIn).toBe(true);
    expect(await secureTokens.refreshToken()).toBe('ref-2');

    session.reset();
    serverAuth.reset();
    await secureTokens.setRefreshToken('ref-dead');
    await previousRun({ activeAt: T0 - 60 * 1000 });
    useServer({ '/api/v1/auth/refresh': () => err('AUTH_401_INVALID_REFRESH_TOKEN', 401) });
    await serverAuth.restore(T0);
    expect(session.get().signedIn).toBe(false);
    expect(await secureTokens.refreshToken()).toBeNull();
  });

  // F-016 (security review of 2026-10-28): reopening the app never skips the idle lock.
  it.each([
    ['the idle lock had fired', { activeAt: T0 - 60 * 1000, locked: true }],
    ['nobody touched it for 5 minutes', { activeAt: T0 - 5 * 60 * 1000 }],
    ['nothing was recorded', {}],
    ['the clock went backwards', { activeAt: T0 + 60 * 1000 }],
  ])('needs the PIN at app start when %s', async (_why, previous) => {
    await secureTokens.setRefreshToken('ref-1');
    await previousRun(previous);
    const server = useServer({ '/api/v1/auth/refresh': () => [200, { ...TOKENS, refresh_token: 'ref-2' }] });
    await serverAuth.restore(T0);
    expect(server.calls).toEqual([]); // the refresh token is never spent
    expect(session.get().signedIn).toBe(false);
    expect(session.get().endedBy).toBe('idle');
    expect(await secureTokens.refreshToken()).toBeNull();
  });

  it('keeps the session for Face ID at app start when it is on, without resuming it', async () => {
    await secureTokens.setRefreshToken('ref-1');
    await AsyncStorage.setItem('xspeeria.biometricLogin', ME.phone);
    await AsyncStorage.setItem('xspeeria.idleLocked', '1');
    await session.restore();
    expect(session.biometricSaved()).toBe(true);
    const server = useServer({ '/api/v1/auth/refresh': () => [200, { ...TOKENS, refresh_token: 'ref-2' }] });
    await serverAuth.restore(T0);
    expect(server.calls).toEqual([]);
    expect(session.get().signedIn).toBe(false);
    expect(await secureTokens.refreshToken()).toBe('ref-1');
  });

  it('remembers the idle lock and recent touches for the next app start', async () => {
    useServer({ '/api/v1/auth/login': () => [200, TOKENS], '/api/v1/auth/logout': () => [204, null] });
    await serverAuth.login(ME.phone, '482613', T0);
    expect(await AsyncStorage.getItem('xspeeria.lastActiveAt')).toBe(String(T0));
    session.touch(T0 + 10 * 1000); // within 30 s: not written again
    session.touch(T0 + 40 * 1000);
    expect(await AsyncStorage.getItem('xspeeria.lastActiveAt')).toBe(String(T0 + 40 * 1000));
    session.enforceTimeouts(T0 + 40 * 1000 + 5 * 60 * 1000);
    expect(await AsyncStorage.getItem('xspeeria.idleLocked')).toBe('1');
    expect(await AsyncStorage.getItem('xspeeria.lastActiveAt')).toBeNull();
  });
});

describe('server-mode screens', () => {
  const props = { onDone: jest.fn(), onSignUp: jest.fn(), onForgot: jest.fn(), now: () => T0 };

  it('log-in: success, the second check, and the server’s error shown', async () => {
    const login = jest
      .fn()
      .mockResolvedValueOnce('signedIn')
      .mockResolvedValueOnce('check')
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
    expect(onSecondFactor).toHaveBeenCalledTimes(1);
    await enter();
    expect(screen.getByTestId('login-error').props.children).toBe('The phone number, email or PIN is incorrect.');
  });

  it('check screen (codes): both codes, the server’s error, and an expired check restarts', async () => {
    const codes = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('AUTH_401_INVALID_OTP', 401, 'That code is not right.'))
      .mockResolvedValueOnce('signedIn')
      .mockRejectedValueOnce(new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, 'This step has expired. Please start again.'));
    const onDone = jest.fn();
    const onRestart = jest.fn();
    const ui = { codes, faceStart: jest.fn(), faceFinish: jest.fn(), openUrl: jest.fn(), onDone, onRestart };
    await render(<CheckScreen check={check('login', 'sms_email') as never} {...ui} />);
    expect(screen.getByTestId('check-text')).toHaveTextContent(/number ending 2222 and a code to a\*\*\*@example\.com/);
    const enter = async (): Promise<void> => {
      await fireEvent.changeText(screen.getByTestId('check-sms'), '111111');
      await fireEvent.changeText(screen.getByTestId('check-email'), '222222');
      await fireEvent.press(screen.getByTestId('check-submit'));
      await act(async () => undefined);
    };
    expect(screen.getByTestId('check-submit')).toBeDisabled();
    await enter();
    expect(screen.getByTestId('check-error').props.children).toBe('That code is not right.');
    expect(screen.getByTestId('check-email').props.value).toBe(''); // each code works once
    await enter();
    expect(codes).toHaveBeenLastCalledWith('222222', '111111');
    expect(onDone).toHaveBeenCalledWith('signedIn');
    await enter();
    expect(onRestart).toHaveBeenCalledWith('This step has expired. Please start again.');
  });

  it('check screen (face): opens only an https page, then asks for the result', async () => {
    const faceStart = jest.fn().mockResolvedValueOnce('http://evil.example/x').mockResolvedValueOnce('https://verify.didit.me/s/1');
    const faceFinish = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('AUTH_409_FACE_CHECK_PENDING', 409, 'Your face check is not finished yet.'))
      .mockResolvedValueOnce('signedIn');
    const openUrl = jest.fn(async () => undefined);
    const onDone = jest.fn();
    await render(
      <CheckScreen check={check('login', 'face') as never} codes={jest.fn()} faceStart={faceStart} faceFinish={faceFinish} openUrl={openUrl} onDone={onDone} onRestart={jest.fn()} />,
    );
    expect(screen.queryByTestId('check-email')).toBeNull();
    await fireEvent.press(screen.getByTestId('check-face'));
    await act(async () => undefined);
    expect(openUrl).not.toHaveBeenCalled();
    expect(screen.getByTestId('check-error')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('check-face'));
    await act(async () => undefined);
    expect(openUrl).toHaveBeenCalledWith('https://verify.didit.me/s/1');
    await fireEvent.press(screen.getByTestId('check-face')); // "I’ve taken the selfie"
    await act(async () => undefined);
    expect(screen.getByTestId('check-error').props.children).toBe('Your face check is not finished yet.');
    await fireEvent.press(screen.getByTestId('check-face'));
    await act(async () => undefined);
    expect(onDone).toHaveBeenCalledWith('signedIn');
  });

  it('check screen (kyc): asks for the ID, no code fields', async () => {
    const faceStart = jest.fn(async () => 'https://verify.didit.me/s/2');
    const openUrl = jest.fn(async () => undefined);
    await render(
      <CheckScreen check={check('login', 'kyc') as never} codes={jest.fn()} faceStart={faceStart} faceFinish={jest.fn()} openUrl={openUrl} onDone={jest.fn()} onRestart={jest.fn()} />,
    );
    expect(screen.queryByTestId('check-email')).toBeNull();
    expect(screen.getByTestId('check-text')).toHaveTextContent(/new identity check/);
    expect(screen.getByText('Start identity check')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('check-face'));
    await act(async () => undefined);
    expect(openUrl).toHaveBeenCalledWith('https://verify.didit.me/s/2');
    expect(screen.getByText('I’ve finished the identity check')).toBeTruthy();
  });

  it('check screen (face, local developer check): no page, straight to the result', async () => {
    const faceFinish = jest.fn().mockResolvedValue('signedIn');
    const openUrl = jest.fn();
    await render(
      <CheckScreen check={check('login', 'face') as never} codes={jest.fn()} faceStart={jest.fn().mockResolvedValue(null)} faceFinish={faceFinish} openUrl={openUrl} onDone={jest.fn()} onRestart={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId('check-face'));
    await act(async () => undefined);
    expect(openUrl).not.toHaveBeenCalled();
    expect(faceFinish).toHaveBeenCalledTimes(1);
  });

  it('a failed face check sends the user back to log in', async () => {
    const onRestart = jest.fn();
    await render(
      <CheckScreen
        check={check('login', 'face') as never}
        codes={jest.fn()}
        faceStart={jest.fn().mockResolvedValue(null)}
        faceFinish={jest.fn().mockRejectedValue(new ApiError('AUTH_401_FACE_CHECK_FAILED', 401, 'We could not match your face to your identity check. Please try again.'))}
        openUrl={jest.fn()}
        onDone={jest.fn()}
        onRestart={onRestart}
      />,
    );
    await fireEvent.press(screen.getByTestId('check-face'));
    await act(async () => undefined);
    expect(onRestart).toHaveBeenCalledWith('We could not match your face to your identity check. Please try again.');
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
});
