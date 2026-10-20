/** Typed calls to the sign-in endpoints (ADR-025) and the second check (ADR-054). */

import { apiRequest, type Fetch, type RequestOptions } from './client';

export type { Fetch };

export interface Tokens {
  access_token: string;
  refresh_token: string;
  device_token?: string | null;
}

/**
 * ADR-054: the second check still needed. `email`: a code sent to the email; `sms_email`: an
 * SMS code and an email code; `face`: a face check matched to the identity-check photo.
 */
export interface Check {
  check_required: true;
  check_id: string;
  purpose: 'signup' | 'login' | 'step_up' | 'pin_reset';
  method: 'email' | 'sms_email' | 'face';
  email_hint: string | null;
  phone_hint: string | null;
}

export interface StepUpApproval {
  step_up_token: string;
  action: string;
  expires_in_seconds: number;
}

export interface Profile {
  user_id: string;
  phone: string;
  email: string;
  status: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const authApi = {
  /** ADR-047: text a code to the new number (needs a ``contact.change`` approval). */
  phoneChangeStart: (accessToken: string, newPhone: string, stepUpToken: string, x: Extra = {}) =>
    apiRequest<{ status: string }>('POST', '/api/v1/users/me/phone/start', {
      token: accessToken,
      body: { new_phone: newPhone },
      headers: { 'X-Step-Up-Token': stepUpToken },
      ...x,
    }),
  phoneChangeConfirm: (accessToken: string, newPhone: string, code: string, x: Extra = {}) =>
    apiRequest<{ phone: string }>('POST', '/api/v1/users/me/phone/confirm', {
      token: accessToken,
      body: { new_phone: newPhone, code },
      ...x,
    }),
  /** ADR-046: change my PIN; needs a ``pin.change`` approval. Other devices are signed out. */
  changePin: (accessToken: string, body: { current_pin: string; new_pin: string }, stepUpToken: string, x: Extra = {}) =>
    apiRequest<void>('POST', '/api/v1/users/me/pin', {
      token: accessToken,
      body,
      headers: { 'X-Step-Up-Token': stepUpToken },
      ...x,
    }),
  /** ADR-046: forgot PIN — always the same answer, whether or not the number has an account. */
  pinResetStart: (phone: string, x: Extra = {}) =>
    apiRequest<{ status: string }>('POST', '/api/v1/auth/pin-reset/start', { body: { phone }, ...x }),
  /** Forgot PIN, step 2: the SMS code → the second check (email code or face check). */
  pinResetVerify: (phone: string, code: string, x: Extra = {}) =>
    apiRequest<Check>('POST', '/api/v1/auth/pin-reset/verify', { body: { phone, code }, ...x }),
  pinResetConfirm: (body: { check_id: string; new_pin: string; email_code?: string }, x: Extra = {}) =>
    apiRequest<void>('POST', '/api/v1/auth/pin-reset/confirm', { body, ...x }),
  register: (body: { phone: string; email: string; pin: string }, x: Extra = {}) =>
    apiRequest<{ status: string }>('POST', '/api/v1/auth/register', { body, ...x }),
  verifyPhone: (body: { phone: string; code: string; device_id?: string }, x: Extra = {}) =>
    apiRequest<Check>('POST', '/api/v1/auth/verify-phone', { body, ...x }),
  login: (body: { identifier: string; pin: string; device_token?: string }, x: Extra = {}) =>
    apiRequest<Tokens | Check>('POST', '/api/v1/auth/login', { body, ...x }),
  /** Sign-up or log-in: the email code (and the SMS code for an `sms_email` check). */
  checkCodes: (checkId: string, body: { email_code: string; sms_code?: string }, x: Extra = {}) =>
    apiRequest<Tokens>('POST', `/api/v1/auth/checks/${encodeURIComponent(checkId)}/codes`, { body, ...x }),
  /** Log-in or PIN reset: open the face check. `url` is null for the local developer check. */
  faceStart: (checkId: string, x: Extra = {}) =>
    apiRequest<{ url: string | null }>('POST', `/api/v1/auth/checks/${encodeURIComponent(checkId)}/face`, x),
  /** Log-in: the face check result (409 while it is still running). */
  faceResult: (checkId: string, x: Extra = {}) =>
    apiRequest<Tokens>('POST', `/api/v1/auth/checks/${encodeURIComponent(checkId)}/face/result`, {
      body: {},
      ...x,
    }),
  refresh: (refreshToken: string, x: Extra = {}) =>
    apiRequest<Tokens>('POST', '/api/v1/auth/refresh', { token: refreshToken, ...x }),
  /** ADR-048: a new unlock key for this session; trusted devices only. */
  biometricEnable: (accessToken: string, deviceToken: string, x: Extra = {}) =>
    apiRequest<{ unlock_key: string }>('POST', '/api/v1/auth/biometric', {
      token: accessToken,
      body: { device_token: deviceToken },
      ...x,
    }),
  biometricDisable: (accessToken: string, x: Extra = {}) =>
    apiRequest<void>('DELETE', '/api/v1/auth/biometric', { token: accessToken, ...x }),
  /** ADR-048: resume the session after the idle lock (refresh token + unlock key). */
  biometricUnlock: (refreshToken: string, unlockKey: string, x: Extra = {}) =>
    apiRequest<Tokens>('POST', '/api/v1/auth/biometric/unlock', {
      body: { refresh_token: refreshToken, unlock_key: unlockKey },
      ...x,
    }),
  logout: (accessToken: string, x: Extra = {}) =>
    apiRequest<void>('POST', '/api/v1/auth/logout', { token: accessToken, ...x }),
  /** Fingerprint/Face ID released the session's key → a one-use approval, valid 5 minutes. */
  stepUp: (accessToken: string, action: string, unlockKey: string, x: Extra = {}) =>
    apiRequest<StepUpApproval>('POST', '/api/v1/auth/step-up', {
      token: accessToken,
      body: { action, unlock_key: unlockKey },
      ...x,
    }),
  /** No fingerprint: a face check (or, before the identity check, an email code). */
  stepUpCheck: (accessToken: string, action: string, x: Extra = {}) =>
    apiRequest<Check>('POST', '/api/v1/auth/step-up/checks', { token: accessToken, body: { action }, ...x }),
  stepUpCode: (accessToken: string, checkId: string, emailCode: string, x: Extra = {}) =>
    apiRequest<StepUpApproval>('POST', `/api/v1/auth/step-up/checks/${encodeURIComponent(checkId)}/code`, {
      token: accessToken,
      body: { email_code: emailCode },
      ...x,
    }),
  stepUpFaceStart: (accessToken: string, checkId: string, x: Extra = {}) =>
    apiRequest<{ url: string | null }>('POST', `/api/v1/auth/step-up/checks/${encodeURIComponent(checkId)}/face`, {
      token: accessToken,
      ...x,
    }),
  stepUpFaceResult: (accessToken: string, checkId: string, x: Extra = {}) =>
    apiRequest<StepUpApproval>(
      'POST',
      `/api/v1/auth/step-up/checks/${encodeURIComponent(checkId)}/face/result`,
      { token: accessToken, ...x },
    ),
  me: (accessToken: string, x: Extra = {}) =>
    apiRequest<Profile>('GET', '/api/v1/users/me', { token: accessToken, ...x }),
};

export function isCheck(r: Tokens | Check): r is Check {
  return (r as Check).check_required === true;
}
