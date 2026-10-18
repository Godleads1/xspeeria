/**
 * ADR-034: 2FA settings against the real server. The server is a fake; its rules are
 * tested on the server (ADR-026).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import { secureTokens } from '../src/api/secureTokens';
import { serverAuth } from '../src/features/auth/serverAuth';
import { AuthenticatorSetupScreen } from '../src/features/security/AuthenticatorSetupScreen';
import { TwoFactorScreen } from '../src/features/security/TwoFactorScreen';
import { serverTwoFactor, type ServerTwoFactor } from '../src/features/security/serverTwoFactor';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

const CODES = Array.from({ length: 10 }, (_, i) => `ABCD-${String(1000 + i)}`);
const flush = () => act(async () => { await Promise.resolve(); });

function fake(): jest.Mocked<ServerTwoFactor> {
  return {
    regenerate: jest.fn(async (_c: string) => CODES),
    startReplace: jest.fn(async (_c: string) => undefined),
    hasPendingReplace: jest.fn(() => true),
    pendingReplace: jest.fn(async () => ({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Xspeeria?secret=JBSWY3DPEHPK3PXP' })),
    confirmReplace: jest.fn(async (_c: string) => []),
    cancelReplace: jest.fn(),
  };
}

async function openScreen(server: ServerTwoFactor, onReplace = jest.fn()) {
  await render(
    <TwoFactorScreen
      onBack={jest.fn()}
      onSetUpAuthenticator={jest.fn()}
      stepUp={jest.fn(async () => false)}
      random={(n) => new Uint8Array(n)}
      server={server}
      onReplaceAuthenticator={onReplace}
    />,
  );
  return onReplace;
}

describe('2 FA screen with the server (ADR-034)', () => {
  it('is always on and offers Replace', async () => {
    await openScreen(fake());
    expect(screen.getByTestId('two-factor-status')).toHaveTextContent('2 FA is on');
    expect(screen.getByTestId('two-factor-authenticator')).toHaveTextContent(/Replace/);
  });

  it('new recovery codes need the current code, and come from the server', async () => {
    const server = fake();
    await openScreen(server);
    await fireEvent.press(screen.getByTestId('two-factor-recovery'));
    expect(screen.getByTestId('server-code-sheet')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('server-code-input'), '123456');
    await fireEvent.press(screen.getByTestId('server-code-confirm'));
    await flush();
    expect(server.regenerate).toHaveBeenCalledWith('123456');
    expect(screen.getByTestId('recovery-codes')).toHaveTextContent(/ABCD-1000/);
  });

  it('a wrong code keeps the sheet open with the server’s message', async () => {
    const server = fake();
    server.regenerate.mockRejectedValueOnce(new ApiError('AUTH_401_INVALID_OTP', 401, 'That code is not right.'));
    await openScreen(server);
    await fireEvent.press(screen.getByTestId('two-factor-recovery'));
    await fireEvent.changeText(screen.getByTestId('server-code-input'), '000000');
    await fireEvent.press(screen.getByTestId('server-code-confirm'));
    await flush();
    expect(screen.getByTestId('server-code-error')).toHaveTextContent('That code is not right.');
    expect(screen.getByTestId('server-code-input').props.value).toBe(''); // a code works once
    expect(screen.queryByTestId('recovery-codes')).toBeNull();
  });

  it('Replace checks the current code, then opens the new-authenticator screen', async () => {
    const server = fake();
    const onReplace = await openScreen(server);
    await fireEvent.press(screen.getByTestId('two-factor-authenticator'));
    expect(screen.getByTestId('server-code-sheet')).toHaveTextContent(/held for 24 hours/);
    await fireEvent.changeText(screen.getByTestId('server-code-input'), '123456');
    await fireEvent.press(screen.getByTestId('server-code-confirm'));
    await flush();
    expect(server.startReplace).toHaveBeenCalledWith('123456');
    expect(onReplace).toHaveBeenCalled();
  });
});

describe('new authenticator screen (replacement)', () => {
  it('shows the server secret and finishes after the first code', async () => {
    const server = fake();
    const onDone = jest.fn();
    await render(
      <AuthenticatorSetupScreen
        account=""
        random={(n) => new Uint8Array(n)}
        engine={{ begin: () => server.pendingReplace(), confirm: (c) => server.confirmReplace(c), messageFor: () => 'x' }}
        onBack={jest.fn()}
        onDone={onDone}
      />,
    );
    await flush();
    expect(screen.getByTestId('authenticator-key')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    await fireEvent.changeText(screen.getByTestId('authenticator-code'), '654321');
    await fireEvent.press(screen.getByTestId('authenticator-verify'));
    await flush();
    expect(server.confirmReplace).toHaveBeenCalledWith('654321');
    expect(onDone).toHaveBeenCalled();
    expect(screen.queryByTestId('recovery-codes')).toBeNull();
  });
});

describe('serverTwoFactor (requests)', () => {
  const BASE = 'http://127.0.0.1:8000';
  afterEach(() => {
    serverAuth.useFetch(undefined);
    serverAuth.reset();
    mockStore.clear();
  });

  it('needs a session and sends nothing without one', async () => {
    const calls: string[] = [];
    serverAuth.useFetch((async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch, BASE);
    await expect(serverTwoFactor.regenerate('123456')).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(0);
  });

  it('pendingReplace fails cleanly with nothing started', async () => {
    serverTwoFactor.cancelReplace();
    expect(serverTwoFactor.hasPendingReplace()).toBe(false);
    await expect(serverTwoFactor.pendingReplace()).rejects.toBeInstanceOf(ApiError);
  });

  it('replacing calls step-up then start, and the confirm forgets this phone’s trust', async () => {
    const calls: { path: string; headers: Record<string, string>; body: unknown }[] = [];
    const routes: Record<string, unknown> = {
      '/api/v1/auth/login': { access_token: 'acc', refresh_token: 'ref', device_token: 'dev-1' },
      '/api/v1/users/me': { user_id: 'u', phone: '+2348031112222', email: 'a@example.com', status: 'active' },
      '/api/v1/auth/step-up': { step_up_token: 'su-1', action: 'mfa.change', expires_in_seconds: 300 },
      '/api/v1/users/me/mfa/replace/start': { secret: 'NEWSECRET', otpauth_uri: 'otpauth://x' },
    };
    serverAuth.useFetch((async (url: string, init: RequestInit) => {
      const path = url.replace(BASE, '');
      calls.push({ path, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null });
      if (path === '/api/v1/users/me/mfa/replace/confirm') return { ok: true, status: 204, json: async () => null } as unknown as Response;
      return { ok: true, status: 200, json: async () => routes[path] } as unknown as Response;
    }) as unknown as typeof fetch, BASE);
    await serverAuth.login('+2348031112222', '482613', Date.now());
    expect(await secureTokens.deviceToken()).toBe('dev-1');

    await serverTwoFactor.startReplace('123456');
    const stepUp = calls.find((c) => c.path === '/api/v1/auth/step-up');
    expect(stepUp?.body).toEqual({ action: 'mfa.change', otp_code: '123456' });
    const start = calls.find((c) => c.path === '/api/v1/users/me/mfa/replace/start');
    expect(start?.headers['X-Step-Up-Token']).toBe('su-1');
    expect(await serverTwoFactor.pendingReplace()).toEqual({ secret: 'NEWSECRET', uri: 'otpauth://x' });

    expect(await serverTwoFactor.confirmReplace('654321')).toEqual([]);
    expect(calls.at(-1)?.body).toEqual({ otp_code: '654321' });
    expect(serverTwoFactor.hasPendingReplace()).toBe(false);
    expect(await secureTokens.deviceToken()).toBeNull();
  });
});
