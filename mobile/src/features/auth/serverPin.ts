/** PIN change and reset against the real server (ADR-046). PINs are never stored or logged. */

import { ApiError } from '../../api/client';
import { authApi } from '../../api/authApi';
import { secureTokens } from '../../api/secureTokens';
import { serverAuth } from './serverAuth';

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, 'Please log in again.');
  return t;
}

export interface PinSource {
  change(currentPin: string, newPin: string, authenticatorCode: string): Promise<void>;
  resetStart(phone: string): Promise<void>;
  resetConfirm(
    phone: string,
    smsCode: string,
    newPin: string,
    second: { otp_code: string } | { recovery_code: string },
  ): Promise<void>;
}

export const serverPin: PinSource = {
  async change(currentPin, newPin, code) {
    const x = serverAuth.apiOptions();
    const approval = await authApi.stepUp(token(), 'pin.change', code, x);
    await authApi.changePin(token(), { current_pin: currentPin, new_pin: newPin }, approval.step_up_token, x);
  },
  async resetStart(phone) {
    await authApi.pinResetStart(phone, serverAuth.apiOptions());
  },
  async resetConfirm(phone, smsCode, newPin, second) {
    await authApi.pinResetConfirm({ phone, code: smsCode, new_pin: newPin, ...second }, serverAuth.apiOptions());
    // The server ended every session and forgot trusted devices: so does this phone.
    await secureTokens.setDeviceToken(null);
  },
};
