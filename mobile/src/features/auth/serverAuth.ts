/**
 * Sign-up, log-in and the second check against the real server (ADR-025, ADR-027, ADR-054).
 *
 * Holds the access token in memory and the refresh and trusted-device tokens in secure
 * storage. While the user is active it refreshes every 4 minutes, inside the server's
 * 5-minute idle limit. When the app's own idle lock or 7-day limit ends the session, or the
 * user logs out, every token except the trusted-device token is dropped.
 *
 * Biometric unlock (ADR-048): with it on, the idle lock keeps the refresh token so Face ID or
 * a fingerprint can resume the same session; the key it needs lives behind the biometric
 * prompt (`unlockKey`). It never extends the 7-day limit: the server refuses past it.
 *
 * The open second check (email/SMS codes or a face check) and the tokens of a sign-up that has
 * not reached its last screen yet are kept here, in memory, never in route parameters.
 */

import { authApi, isCheck, type Check, type Fetch, type Tokens } from '../../api/authApi';
import { ApiError } from '../../api/client';
import { secureTokens } from '../../api/secureTokens';
import { unlockKey } from '../../api/unlockKey';
import { session } from './session';
import { tr } from "../../i18n";

export const KEEP_ALIVE_MS = 4 * 60 * 1000;

export type LoginOutcome = 'signedIn' | 'check';
/** After the second check: signed in, or a sign-up that goes on to its last screen. */
export type CheckOutcome = 'signedIn' | 'signedUp';

interface State {
  access: string | null;
  check: Check | null;
  /** Sign-up finished on the server; the session starts on its last screen. */
  pending: Tokens | null;
  lastRefreshAt: number;
  refreshing: Promise<void> | null;
}

const state: State = { access: null, check: null, pending: null, lastRefreshAt: 0, refreshing: null };
let testServer: { fetchImpl: Fetch; baseUrl: string } | undefined;
const x = (): { fetchImpl?: Fetch; baseUrl?: string } => testServer ?? {};

async function signIn(
  tokens: Tokens,
  now: number,
  options: { newAccount?: boolean; resumed?: boolean } = {},
): Promise<void> {
  state.access = tokens.access_token;
  state.lastRefreshAt = now;
  await secureTokens.setRefreshToken(tokens.refresh_token);
  if (tokens.device_token) await secureTokens.setDeviceToken(tokens.device_token);
  const me = await authApi.me(tokens.access_token, x());
  session.serverSignIn({ phone: me.phone, email: me.email }, now, options);
  // A new session needs its own unlock key; turn it back on if it was on for this account.
  if (!options.newAccount && !options.resumed && session.biometricOn()) void serverAuth.enableBiometric().catch(() => undefined);
}

function dropSession(): void {
  state.access = null;
  state.pending = null;
  state.check = null;
  void secureTokens.setRefreshToken(null);
}

function endSession(): void {
  const access = state.access;
  dropSession();
  void unlockKey.clear();
  // Best effort: tell the server too. If offline, its own limits end the session.
  if (access) authApi.logout(access, x()).catch(() => undefined);
}

session.onSignOut(endSession);

session.onIdleLock(() => {
  if (!session.biometricOn()) return endSession();
  // Keep the refresh token for Face ID/fingerprint; the access token goes now.
  state.access = null;
  state.check = null;
  state.pending = null;
});

function openCheck(): Check {
  if (!state.check) throw new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, tr("This step has expired. Please log in again."));
  return state.check;
}

async function finishCheck(check: Check, tokens: Tokens, now: number): Promise<CheckOutcome> {
  state.check = null;
  if (check.purpose === 'signup') {
    state.pending = tokens;
    return 'signedUp';
  }
  await signIn(tokens, now);
  return 'signedIn';
}

export const serverAuth = {
  /** Tests only: a fake server instead of `fetch` and the built-in address. */
  useFetch(impl: Fetch | undefined, baseUrl = 'http://127.0.0.1:8000'): void {
    testServer = impl ? { fetchImpl: impl, baseUrl } : undefined;
  },
  /** Tests only. */
  reset(): void {
    state.access = null;
    state.check = null;
    state.pending = null;
    state.lastRefreshAt = 0;
    state.refreshing = null;
  },

  accessToken: (): string | null => state.access,
  /** Where requests go (the test server in tests). For other API modules. */
  apiOptions: (): { fetchImpl?: Fetch; baseUrl?: string } => x(),
  hasCheck: (): boolean => state.check !== null,
  /** The open second check (for the screen: which method, masked email/phone). */
  check: (): Check | null => state.check,
  hasPending: (): boolean => state.pending !== null,

  // --- sign-up (reordered for the server, ADR-027) ---

  async register(draft: { phone: string; email: string; pin: string }): Promise<void> {
    await authApi.register(draft, x());
  },

  async verifyPhone(phone: string, code: string): Promise<void> {
    state.check = await authApi.verifyPhone({ phone, code }, x());
  },

  /** After the sign-up's last screen: start the session. */
  async finish(now: number, options: { newAccount?: boolean } = {}): Promise<void> {
    const tokens = state.pending;
    if (!tokens) throw new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, tr("This step has expired. Please log in again."));
    state.pending = null;
    await signIn(tokens, now, options);
  },

  // --- log-in ---

  async login(identifier: string, pin: string, now: number): Promise<LoginOutcome> {
    const deviceToken = await secureTokens.deviceToken();
    const r = await authApi.login({ identifier, pin, ...(deviceToken ? { device_token: deviceToken } : {}) }, x());
    if (isCheck(r)) {
      state.check = r;
      return 'check';
    }
    await signIn(r, now);
    return 'signedIn';
  },

  // --- the second check (ADR-054) ---

  /** The email code, plus the SMS code for a new phone before the identity check. */
  async checkCodes(emailCode: string, smsCode: string | null, now: number): Promise<CheckOutcome> {
    const check = openCheck();
    const tokens = await authApi.checkCodes(
      check.check_id,
      { email_code: emailCode, ...(smsCode ? { sms_code: smsCode } : {}) },
      x(),
    );
    return finishCheck(check, tokens, now);
  },

  /** Opens the face check. Null: the local developer check, which needs no page. */
  async faceStart(): Promise<string | null> {
    return (await authApi.faceStart(openCheck().check_id, x())).url;
  },

  /** The face check result. 409 while it is still running (the screen says so). */
  async faceFinish(now: number): Promise<CheckOutcome> {
    const check = openCheck();
    return finishCheck(check, await authApi.faceResult(check.check_id, x()), now);
  },

  // --- keeping the session alive ---

  /** Called on user activity; refreshes at most every 4 minutes. */
  keepAlive(now: number): Promise<void> {
    if (!state.access || state.refreshing || now - state.lastRefreshAt < KEEP_ALIVE_MS) {
      return state.refreshing ?? Promise.resolve();
    }
    state.refreshing = (async () => {
      try {
        const refresh = await secureTokens.refreshToken();
        if (!refresh) throw new ApiError('AUTH_401_INVALID_REFRESH_TOKEN', 401, tr("Please log in again."));
        const t = await authApi.refresh(refresh, x());
        state.access = t.access_token;
        state.lastRefreshAt = now;
        await secureTokens.setRefreshToken(t.refresh_token);
      } catch (e) {
        // Refused by the server (expired, idle, reused, logged out elsewhere): end it here.
        // A network problem is not an ending: the next activity tries again.
        if (e instanceof ApiError && e.status === 401) session.serverEnded();
      } finally {
        state.refreshing = null;
      }
    })();
    return state.refreshing;
  },

  // --- biometric unlock (ADR-048) ---

  /** True when this phone can keep the unlock key behind Face ID/fingerprint. */
  biometricSupported: (): boolean => unlockKey.supported(),

  /** Turn on for this session. Trusted devices only; the server says so if not. */
  async enableBiometric(): Promise<void> {
    if (!unlockKey.supported()) {
      throw new ApiError('BIOMETRIC_UNAVAILABLE', 0, tr("Face ID or fingerprint isn’t set up on this phone."));
    }
    const access = state.access;
    const device = await secureTokens.deviceToken();
    if (!access) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr("Please log in again."));
    if (!device) {
      throw new ApiError(
        'AUTH_403_DEVICE_NOT_TRUSTED',
        403,
        tr("Fingerprint or Face ID needs a trusted phone. Log out and log in again on this phone to trust it."),
      );
    }
    const r = await authApi.biometricEnable(access, device, x());
    if (!(await unlockKey.save(r.unlock_key))) {
      authApi.biometricDisable(access, x()).catch(() => undefined);
      throw new ApiError('BIOMETRIC_UNAVAILABLE', 0, tr("Face ID or fingerprint isn’t set up on this phone."));
    }
    session.setBiometric(true);
  },

  async disableBiometric(): Promise<void> {
    session.setBiometric(false);
    await unlockKey.clear();
    const access = state.access;
    if (access) await authApi.biometricDisable(access, x()).catch(() => undefined);
  },

  /**
   * After the idle lock: Face ID/fingerprint releases the key, the server resumes the session.
   * False when cancelled or refused; a refusal means the PIN is needed (session ended).
   */
  async unlock(now: number): Promise<boolean> {
    if (!session.biometricSaved()) return false;
    const refresh = await secureTokens.refreshToken();
    if (!refresh) return false;
    const key = await unlockKey.read();
    if (!key) return false;
    try {
      const t = await authApi.biometricUnlock(refresh, key, x());
      state.access = t.access_token;
      state.lastRefreshAt = now;
      await secureTokens.setRefreshToken(t.refresh_token);
      const me = await authApi.me(t.access_token, x());
      session.serverUnlocked(now, { phone: me.phone, email: me.email });
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // That session is over; its key is useless. The PIN log-in makes new ones.
        await secureTokens.setRefreshToken(null);
        await unlockKey.clear();
      }
      throw e;
    }
  },

  /** App start: resume a session if the server still accepts the refresh token. */
  async restore(now: number): Promise<void> {
    const refresh = await secureTokens.refreshToken();
    if (!refresh) return;
    try {
      const t = await authApi.refresh(refresh, x());
      await secureTokens.setRefreshToken(t.refresh_token);
      await signIn({ ...t, device_token: null }, now, { resumed: true });
    } catch (e) {
      // Idle too long for a plain refresh: Face ID/fingerprint may still resume it.
      if (e instanceof ApiError && e.status === 401 && !session.biometricSaved()) {
        await secureTokens.setRefreshToken(null);
      }
    }
  },
};
