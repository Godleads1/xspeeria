/** Super Admin security keys (ADR-081): the log-in key step, adding and removing keys, and the
 * key-setup screen when a key is required. The browser's `navigator.credentials` is faked. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SecurityKeys } from '../components/SecurityKeys';
import { KeySetupScreen } from '../components/screens/KeySetupScreen';
import { LoginScreen } from '../components/screens/LoginScreen';
import { AdminApiError, makeAdminApi, type AdminApi, type Me, type SecurityKeyList } from '../lib/api';
import { SessionProvider } from '../lib/session';
import { _forTests } from '../lib/webauthn';

const B64 = 'AQIDBA'; // bytes 1, 2, 3, 4
const BOSS: Me = {
  id: 's-1', email: 'boss@xspeeria.test', name: 'Boss', role_id: 'r', role: 'super_admin', status: 'active', phone: null,
  has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions: ['staff.read'],
};
const LOGIN_OPTIONS = { challenge: B64, rpId: 'localhost', allowCredentials: [{ id: B64, type: 'public-key' }], timeout: 120000 };
const CREATE_OPTIONS = {
  challenge: B64,
  rp: { id: 'localhost', name: 'Xspeeria Admin' },
  user: { id: B64, name: 'boss@xspeeria.test', displayName: 'boss@xspeeria.test' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  excludeCredentials: [],
};

function buf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

const credential = {
  id: B64,
  rawId: buf(1, 2, 3, 4),
  type: 'public-key',
  authenticatorAttachment: 'cross-platform',
  getClientExtensionResults: () => ({}),
};
const get = vi.fn();
const create = vi.fn();

beforeEach(() => {
  get.mockReset().mockResolvedValue({
    ...credential,
    response: { clientDataJSON: buf(9), authenticatorData: buf(8), signature: buf(7), userHandle: null },
  });
  create.mockReset().mockResolvedValue({
    ...credential,
    response: { clientDataJSON: buf(9), attestationObject: buf(6), getTransports: () => ['usb'] },
  });
  Object.defineProperty(window, 'PublicKeyCredential', { value: function PublicKeyCredential() {}, configurable: true });
  Object.defineProperty(navigator, 'credentials', { value: { get, create }, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function api(over: Partial<AdminApi> = {}): AdminApi {
  return { ...makeAdminApi(vi.fn()), me: vi.fn(async () => BOSS), photoUrl: vi.fn(async () => null), ...over };
}

async function passwordAndCode(): Promise<void> {
  fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'boss@xspeeria.test' } });
  fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'secret words here' } });
  fireEvent.click(screen.getByTestId('login-submit'));
  fireEvent.change(await screen.findByTestId('login-code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByTestId('login-verify'));
}

describe('base64url', () => {
  it('round-trips bytes the way the server writes them', () => {
    const { fromB64u, toB64u } = _forTests;
    expect(toB64u(fromB64u('-_8'))).toBe('-_8');
    expect(Array.from(new Uint8Array(fromB64u(B64)))).toEqual([1, 2, 3, 4]);
  });
});

describe('log-in with a security key', () => {
  it('asks a Super Admin with a key to touch it after the email code', async () => {
    const verifyKey = vi.fn(async () => BOSS);
    const onSignedIn = vi.fn();
    const a = api({
      login: vi.fn(async () => ({ challenge_id: 'ch', email: 'b***@xspeeria.test' })),
      verify: vi.fn(async () => ({ key_required: true as const, key_challenge_id: 'k-1', options: LOGIN_OPTIONS })),
      verifyKey,
    });
    render(<LoginScreen api={a} onSignedIn={onSignedIn} />);
    await passwordAndCode();
    // Not signed in yet: the key step.
    expect(await screen.findByTestId('login-key')).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('login-key'));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    const [challengeId, answer] = verifyKey.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(challengeId).toBe('k-1');
    expect(answer.rawId).toBe(B64);
    expect((answer.response as Record<string, unknown>).signature).toBe('Bw');
    // The browser was asked for exactly the registered key, on this site.
    const asked = get.mock.calls[0][0].publicKey as PublicKeyCredentialRequestOptions;
    expect(asked.rpId).toBe('localhost');
    expect(Array.from(new Uint8Array(asked.allowCredentials?.[0].id as ArrayBuffer))).toEqual([1, 2, 3, 4]);
  });

  it('a cancelled touch can be tried again; a refused one starts the log-in again', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    const verifyKey = vi.fn(async () => {
      throw new AdminApiError('ADMIN_401_KEY_CHECK_FAILED', 401, 'The security key check didn\'t work. Please log in again.');
    });
    const a = api({
      login: vi.fn(async () => ({ challenge_id: 'ch', email: 'b***@xspeeria.test' })),
      verify: vi.fn(async () => ({ key_required: true as const, key_challenge_id: 'k-1', options: LOGIN_OPTIONS })),
      verifyKey,
    });
    render(<LoginScreen api={a} onSignedIn={vi.fn()} />);
    await passwordAndCode();
    fireEvent.click(await screen.findByTestId('login-key'));
    expect(await screen.findByText(/wasn’t used in time/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('login-key'));
    // Refused by the server: back to the start.
    expect(await screen.findByTestId('login-email')).toBeInTheDocument();
  });

  it('staff without a key sign in after the email code, as before', async () => {
    const onSignedIn = vi.fn();
    const a = api({
      login: vi.fn(async () => ({ challenge_id: 'ch', email: 'a***@xspeeria.test' })),
      verify: vi.fn(async () => ({ ...BOSS, role: 'support_agent' })),
    });
    render(<LoginScreen api={a} onSignedIn={onSignedIn} />);
    await passwordAndCode();
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(get).not.toHaveBeenCalled();
  });
});

describe('my security keys', () => {
  const NONE: SecurityKeyList = { keys: [], required: false, can_add: true };
  const ONE: SecurityKeyList = {
    keys: [{ id: 'key-1', name: 'Blue YubiKey', created_at: '2026-11-02T10:00:00Z', last_used_at: null }],
    required: false,
    can_add: true,
  };

  it('adds a key with a name, then lists it', async () => {
    const addKey = vi.fn(async () => ONE.keys[0]);
    const securityKeys = vi.fn().mockResolvedValueOnce(NONE).mockResolvedValue(ONE);
    const a = api({
      securityKeys,
      addKeyOptions: vi.fn(async () => ({ key_challenge_id: 'r-1', options: CREATE_OPTIONS })),
      addKey,
    });
    render(<SecurityKeys api={a} />);
    expect(await screen.findByTestId('no-keys')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('key-name'), { target: { value: 'Blue YubiKey' } });
    fireEvent.click(screen.getByTestId('add-key'));
    await waitFor(() => expect(addKey).toHaveBeenCalled());
    expect((addKey.mock.calls[0] as unknown[]).slice(0, 2)).toEqual(['r-1', 'Blue YubiKey']);
    const made = create.mock.calls[0][0].publicKey as PublicKeyCredentialCreationOptions;
    expect(made.rp.id).toBe('localhost');
    expect(await screen.findAllByTestId('security-key')).toHaveLength(1);
    expect(screen.getByTestId('key-done')).toHaveTextContent('Security key added.');
  });

  it('removes a key', async () => {
    const removeKey = vi.fn(async () => undefined);
    const a = api({ securityKeys: vi.fn().mockResolvedValueOnce(ONE).mockResolvedValue(NONE), removeKey });
    render(<SecurityKeys api={a} />);
    fireEvent.click(await screen.findByTestId('remove-key-key-1'));
    await waitFor(() => expect(removeKey).toHaveBeenCalledWith('key-1'));
    expect(await screen.findByTestId('no-keys')).toBeInTheDocument();
  });

  it('is hidden for staff who can’t add keys and have none', async () => {
    const securityKeys = vi.fn(async () => ({ keys: [], required: false, can_add: false }));
    render(<SecurityKeys api={api({ securityKeys })} />);
    await waitFor(() => expect(securityKeys).toHaveBeenCalled());
    expect(screen.queryByTestId('security-keys')).toBeNull();
  });
});

describe('key set-up when a key is required', () => {
  it('shows only the key set-up, and opens the console once a key is added', async () => {
    const me = vi.fn().mockResolvedValueOnce({ ...BOSS, key_setup_only: true }).mockResolvedValue(BOSS);
    const a = api({
      me,
      securityKeys: vi.fn(async () => ({ keys: [], required: true, can_add: true })),
      addKeyOptions: vi.fn(async () => ({ key_challenge_id: 'r-1', options: CREATE_OPTIONS })),
      addKey: vi.fn(async () => ({ id: 'key-1', name: 'Security key', created_at: '2026-11-02T10:00:00Z', last_used_at: null })),
    });
    render(
      <SessionProvider api={a} onSignedOut={() => undefined}>
        <KeySetupScreen />
      </SessionProvider>,
    );
    expect(await screen.findByTestId('key-setup')).toBeInTheDocument();
    expect(await screen.findByText(/must touch a hardware security key/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-key'));
    await waitFor(() => expect(me).toHaveBeenCalledTimes(2)); // refreshed after the key was added
  });
});
