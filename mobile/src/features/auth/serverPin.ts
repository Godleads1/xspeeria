/**
 * PIN change and reset against the real server (ADR-046, ADR-054). PINs and codes are never
 * stored or logged. Changes take a one-use approval from "Confirm it's you" (`serverConfirm`).
 */

import { ApiError } from '../../api/client';
import { authApi, type Check } from '../../api/authApi';
import { secureTokens } from '../../api/secureTokens';
import { serverAuth } from './serverAuth';
import { tr } from "../../i18n";

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr("Please log in again."));
  return t;
}

export interface PinSource {
  change(currentPin: string, newPin: string, approval: string): Promise<void>;
  resetStart(phone: string): Promise<void>;
  /** The SMS code → the second check: an email code, or a face check after the identity check. */
  resetVerify(phone: string, smsCode: string): Promise<Check>;
  resetFaceStart(checkId: string): Promise<string | null>;
  /** The email code (none for a face check) and the new PIN. */
  resetConfirm(checkId: string, newPin: string, emailCode: string | null): Promise<void>;
}

export const serverPin: PinSource = {
  async change(currentPin, newPin, approval) {
    await authApi.changePin(token(), { current_pin: currentPin, new_pin: newPin }, approval, serverAuth.apiOptions());
  },
  async resetStart(phone) {
    await authApi.pinResetStart(phone, serverAuth.apiOptions());
  },
  async resetVerify(phone, smsCode) {
    return authApi.pinResetVerify(phone, smsCode, serverAuth.apiOptions());
  },
  async resetFaceStart(checkId) {
    return (await authApi.faceStart(checkId, serverAuth.apiOptions())).url;
  },
  async resetConfirm(checkId, newPin, emailCode) {
    await authApi.pinResetConfirm(
      { check_id: checkId, new_pin: newPin, ...(emailCode ? { email_code: emailCode } : {}) },
      serverAuth.apiOptions(),
    );
    // The server ended every session and forgot trusted devices: so does this phone.
    await secureTokens.setDeviceToken(null);
  },
};

/** Phone number change (ADR-047). */
export const serverPhoneChange = {
  async start(newPhone: string, approval: string): Promise<void> {
    await authApi.phoneChangeStart(token(), newPhone, approval, serverAuth.apiOptions());
  },
  async confirm(newPhone: string, smsCode: string): Promise<void> {
    await authApi.phoneChangeConfirm(token(), newPhone, smsCode, serverAuth.apiOptions());
  },
};
