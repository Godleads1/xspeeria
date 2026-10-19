/**
 * 2FA settings against the real server (ADR-034, server builds only; rules in ADR-026).
 *
 * Every change first spends a fresh authenticator code as a one-use step-up approval. A
 * replacement secret is kept here, in memory, between the two screens — never in route
 * parameters. Replacing the authenticator ends trust on every device (the server does it),
 * so this phone forgets its trusted-device token too.
 */

import { ApiError } from '../../api/client';
import { authApi } from '../../api/authApi';
import { secureTokens } from '../../api/secureTokens';
import { serverAuth } from '../auth/serverAuth';

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, 'Please log in again.');
  return t;
}

let pending: { secret: string; uri: string } | null = null;

export interface ServerTwoFactor {
  /** Current code → ten new recovery codes (the old ones stop working). */
  regenerate(code: string): Promise<readonly string[]>;
  /** Current code → a new secret, held until the new app's first code confirms it. */
  startReplace(code: string): Promise<void>;
  hasPendingReplace(): boolean;
  pendingReplace(): Promise<{ secret: string; uri: string }>;
  /** The new app's first code. Returns no recovery codes (the old ones still work). */
  confirmReplace(code: string): Promise<readonly string[]>;
  cancelReplace(): void;
}

export const serverTwoFactor: ServerTwoFactor = {
  async regenerate(code) {
    const x = serverAuth.apiOptions();
    const approval = await authApi.stepUp(token(), 'recovery_codes.regenerate', code, x);
    return (await authApi.regenerateRecoveryCodes(token(), approval.step_up_token, x)).recovery_codes;
  },
  async startReplace(code) {
    const x = serverAuth.apiOptions();
    const approval = await authApi.stepUp(token(), 'mfa.change', code, x);
    const r = await authApi.replaceStart(token(), approval.step_up_token, x);
    pending = { secret: r.secret, uri: r.otpauth_uri };
  },
  hasPendingReplace: () => pending !== null,
  async pendingReplace() {
    if (!pending) throw new ApiError('AUTH_410_CHALLENGE_EXPIRED', 410, 'This step has expired. Please start again.');
    return pending;
  },
  async confirmReplace(code) {
    await authApi.replaceConfirm(token(), code, serverAuth.apiOptions());
    pending = null;
    await secureTokens.setDeviceToken(null); // the server ended trust on every device
    return [];
  },
  cancelReplace() {
    pending = null;
  },
};
