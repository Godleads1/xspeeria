/** Identity checks (ADR-039). The verification link is Didit's hosted check, shown once. */

import { apiRequest, type RequestOptions } from './client';

export type KycStatus = 'not_started' | 'pending_documents' | 'under_review' | 'approved' | 'rejected' | 'expired';

/** ADR-042: the countries a user can be verified in. */
export type KycCountry = 'NG' | 'GB' | 'US';
export const KYC_COUNTRIES: readonly KycCountry[] = ['NG', 'GB', 'US'];
export const COUNTRY_NAME: Record<KycCountry, string> = {
  NG: 'Nigeria',
  GB: 'the United Kingdom',
  US: 'the United States',
};
/** Currency code for the round flag. */
export const COUNTRY_FLAG: Record<KycCountry, string> = { NG: 'NGN', GB: 'GBP', US: 'USD' };

export function isKycCountry(v: unknown): v is KycCountry {
  return v === 'NG' || v === 'GB' || v === 'US';
}

export interface ServerRegions {
  regions: { country: KycCountry; status: KycStatus | 'not_started' }[];
  /** A country the server sees the user in and they are not verified for. Only a suggestion. */
  suggested_country: KycCountry | null;
}

export interface ServerKycCase {
  kyc_case_id: string | null;
  country?: KycCountry;
  status: KycStatus;
  message: string | null;
  verification_url: string | null;
  legal_name: string | null;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const kycApi = {
  current: (token: string, x: Extra = {}, country: KycCountry = 'NG') =>
    apiRequest<ServerKycCase>('GET', `/api/v1/kyc/cases/current?country=${country}`, { token, ...x }),
  start: (token: string, x: Extra = {}, country: KycCountry = 'NG') =>
    apiRequest<ServerKycCase>('POST', '/api/v1/kyc/cases', { token, body: { country }, ...x }),
  regions: (token: string, x: Extra = {}) => apiRequest<ServerRegions>('GET', '/api/v1/kyc/regions', { token, ...x }),
};
