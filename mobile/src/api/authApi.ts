/** Typed calls to the sign-in and 2FA endpoints (ADR-025, ADR-026). */

import { apiRequest, type Fetch, type RequestOptions } from './client';

export type { Fetch };

export interface Tokens {
  access_token: string;
  refresh_token: string;
  device_token?: string | null;
}

export interface Challenge {
  mfa_required: true;
  mfa_challenge_id: string;
  enrolment_required: boolean;
}

export interface Profile {
  user_id: string;
  phone: string;
  email: string;
  status: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const authApi = {
  register: (body: { phone: string; email: string; pin: string }, x: Extra = {}) =>
    apiRequest<{ status: string }>('POST', '/api/v1/auth/register', { body, ...x }),
  verifyPhone: (body: { phone: string; code: string; device_id?: string }, x: Extra = {}) =>
    apiRequest<Challenge>('POST', '/api/v1/auth/verify-phone', { body, ...x }),
  enrolStart: (challengeId: string, x: Extra = {}) =>
    apiRequest<{ secret: string; otpauth_uri: string }>('POST', '/api/v1/auth/mfa/enrol/start', {
      body: { mfa_challenge_id: challengeId },
      ...x,
    }),
  enrolConfirm: (challengeId: string, otpCode: string, x: Extra = {}) =>
    apiRequest<Tokens & { recovery_codes: string[] }>('POST', '/api/v1/auth/mfa/enrol/confirm', {
      body: { mfa_challenge_id: challengeId, otp_code: otpCode },
      ...x,
    }),
  login: (body: { identifier: string; pin: string; device_token?: string }, x: Extra = {}) =>
    apiRequest<Tokens | Challenge>('POST', '/api/v1/auth/login', { body, ...x }),
  mfaVerify: (
    body: { mfa_challenge_id: string; otp_code?: string; recovery_code?: string },
    x: Extra = {},
  ) => apiRequest<Tokens>('POST', '/api/v1/auth/mfa/verify', { body, ...x }),
  refresh: (refreshToken: string, x: Extra = {}) =>
    apiRequest<Tokens>('POST', '/api/v1/auth/refresh', { token: refreshToken, ...x }),
  logout: (accessToken: string, x: Extra = {}) =>
    apiRequest<void>('POST', '/api/v1/auth/logout', { token: accessToken, ...x }),
  me: (accessToken: string, x: Extra = {}) =>
    apiRequest<Profile>('GET', '/api/v1/users/me', { token: accessToken, ...x }),
};

export function isChallenge(r: Tokens | Challenge): r is Challenge {
  return (r as Challenge).mfa_required === true;
}
