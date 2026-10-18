/**
 * Sign-up, log-in and 2FA against the real server (ADR-025, ADR-026, ADR-027).
 *
 * Holds the access token in memory and the refresh and trusted-device tokens in secure
 * storage. While the user is active it refreshes every 4 minutes, inside the server's
 * 5-minute idle limit. When the app's own idle lock or 7-day limit ends the session, or the
 * user logs out, every token except the trusted-device token is dropped.
 *
 * The 2FA challenge ID and the tokens of a sign-up that is still showing recovery codes are
 * kept here, in memory, never in route parameters.
 */

import { authApi, isChallenge, type Fetch, type Tokens } from '../../api/authApi';
import { ApiError } from '../../api/client';
import { secureTokens } from '../../api/secureTokens';
import { session } from './session';

export const KEEP_ALIVE_MS = 4 * 60 * 1000;

export type LoginOutcome = 'signedIn' | 'mfa' | 'enrol';

interface State {
  access: string | null;
  challengeId: string | null;
  /** Sign-up finished on the server but recovery codes are still on screen. */
  pending: Tokens | null;
  lastRefreshAt: number;
  refreshing: Promise<void> | null;
}

const state: State = { access: null, challengeId: null, pending: null, lastRefreshAt: 0, refreshing: null };
let testServer: { fetchImpl: Fetch; baseUrl: string } | undefined;
const x = (): { fetchImpl?: Fetch; baseUrl?: string } => testServer ?? {};

async function signIn(tokens: Tokens, now: number, options: { newAccount?: boolean } = {}): Promise<void> {
  state.access = tokens.access_token;
  state.lastRefreshAt = now;
  await secureTokens.setRefreshToken(tokens.refresh_token);
  if (tokens.device_token) await secureTokens.setDeviceToken(tokens.device_token);
  const me = await authApi.me(tokens.access_token, x());
  session.serverSignIn({ phone: me.phone, email: me.email }, now, options);
}

function dropSession(): void {
  state.access = null;
  state.pending = null;
  state.challengeId = null;
  void secureTokens.setRefreshToken(null);
}

session.onSignOut(() => {
  const access = state.access;
  dropSession();
  // Best effort: tell the server too. If offline, its own limits end the session.
  if (access) authApi.logout(access, x()).catch(() => undefined);
});

export const serverAuth = {
  /** Tests only: a fake server instead of `fetch` and the built-in address. */
  useFetch(impl: Fetch | undefined, baseUrl = 'http://127.0.0.1:8000'): void {
    testServer = impl ? { fetchImpl: impl, baseUrl } : undefined;
  },
  /** Tests only. */
  reset(): void {
    state.access = null;
    state.challengeId = null;
    state.pending = null;
    state.lastRefreshAt = 0;
    state.refreshing = null;
  },

  accessToken: (): string | null => state.access,
  /** Where requests go (the test server in tests). For other API modules. */
  apiOptions: (): { fetchImpl?: Fetch; baseUrl?: string } => x(),
  hasChallenge: (): boolean => state.challengeId !== null,
  hasPending: (): boolean => state.pending !== null,

  // --- sign-up (reordered for the server, ADR-027) ---

  async register(draft: { phone: string; email: string; pin: string }): Promise<void> {
    await authApi.register(draft, x());
  },

  async verifyPhone(phone: string, code: string): Promise<void> {
    const challenge = await authApi.verifyPhone({ phone, code }, x());
    state.challengeId = challenge.mfa_challenge_id;
  },

  async enrolStart(): Promise<{ secret: string; uri: string }> {
    if (!state.challengeId) throw new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, 'This step has expired. Please log in again.');
    const r = await authApi.enrolStart(state.challengeId, x());
    return { secret: r.secret, uri: r.otpauth_uri };
  },

  /** The first authenticator code. Returns the recovery codes; the session starts on `finish`. */
  async enrolConfirm(code: string): Promise<readonly string[]> {
    if (!state.challengeId) throw new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, 'This step has expired. Please log in again.');
    const r = await authApi.enrolConfirm(state.challengeId, code, x());
    state.challengeId = null;
    state.pending = r;
    return r.recovery_codes;
  },

  /** After the recovery codes were saved: start the session. */
  async finish(now: number, options: { newAccount?: boolean } = {}): Promise<void> {
    const tokens = state.pending;
    if (!tokens) throw new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, 'This step has expired. Please log in again.');
    state.pending = null;
    await signIn(tokens, now, options);
  },

  // --- log-in ---

  async login(identifier: string, pin: string, now: number): Promise<LoginOutcome> {
    const deviceToken = await secureTokens.deviceToken();
    const r = await authApi.login({ identifier, pin, ...(deviceToken ? { device_token: deviceToken } : {}) }, x());
    if (isChallenge(r)) {
      state.challengeId = r.mfa_challenge_id;
      return r.enrolment_required ? 'enrol' : 'mfa';
    }
    await signIn(r, now);
    return 'signedIn';
  },

  async verifyMfa(code: { otp: string } | { recovery: string }, now: number): Promise<void> {
    if (!state.challengeId) throw new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, 'This step has expired. Please log in again.');
    const body = 'otp' in code ? { otp_code: code.otp } : { recovery_code: code.recovery };
    const tokens = await authApi.mfaVerify({ mfa_challenge_id: state.challengeId, ...body }, x());
    state.challengeId = null;
    await signIn(tokens, now);
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
        if (!refresh) throw new ApiError('AUTH_401_INVALID_REFRESH_TOKEN', 401, 'Please log in again.');
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

  /** App start: resume a session if the server still accepts the refresh token. */
  async restore(now: number): Promise<void> {
    const refresh = await secureTokens.refreshToken();
    if (!refresh) return;
    try {
      const t = await authApi.refresh(refresh, x());
      await secureTokens.setRefreshToken(t.refresh_token);
      await signIn({ ...t, device_token: null }, now);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await secureTokens.setRefreshToken(null);
    }
  },
};
