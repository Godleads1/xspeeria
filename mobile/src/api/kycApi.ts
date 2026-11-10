/** Identity checks (ADR-039). The verification link is Didit's hosted check, shown once. */

import { apiRequest, type RequestOptions } from './client';
import { k } from "../i18n";

export type KycStatus = 'not_started' | 'pending_documents' | 'under_review' | 'approved' | 'rejected' | 'expired';

/**
 * ADR-042, ADR-100, ADR-105: the countries a user can be verified in. China is shown only
 * when the server lists it (it stays switched off until legal clearance).
 */
export type KycCountry =
  | 'NG' | 'GB' | 'US' | 'CA' | 'DE' | 'FR' | 'CN'
  | 'EG' | 'ZA' | 'MA' | 'ET' | 'KE' | 'SN' | 'GH' | 'ZW' | 'UG' | 'ZM' | 'TZ';
export const KYC_COUNTRIES: readonly KycCountry[] = [
  'NG', 'GB', 'US', 'CA', 'DE', 'FR', 'CN',
  // ADR-107 (owner, 2026-11-10): eleven African countries.
  'EG', 'ZA', 'MA', 'ET', 'KE', 'SN', 'GH', 'ZW', 'UG', 'ZM', 'TZ',
];
export const COUNTRY_NAME: Record<KycCountry, string> = {
  NG: 'Nigeria',
  GB: k("the United Kingdom"),
  US: k("the United States"),
  CA: k("Canada"),
  DE: k("Germany"),
  FR: k("France"),
  CN: k("China"),
  EG: k("Egypt"),
  ZA: k("South Africa"),
  MA: k("Morocco"),
  ET: k("Ethiopia"),
  KE: k("Kenya"),
  SN: k("Senegal"),
  GH: k("Ghana"),
  ZW: k("Zimbabwe"),
  UG: k("Uganda"),
  ZM: k("Zambia"),
  TZ: k("Tanzania"),
};
/** Code for the round flag (a currency, or the country where several share the euro). */
export const COUNTRY_FLAG: Record<KycCountry, string> = {
  NG: 'NGN',
  GB: 'GBP',
  US: 'USD',
  CA: 'CAD',
  DE: 'DE',
  FR: 'FR',
  CN: 'CNY',
  EG: 'EG',
  ZA: 'ZA',
  MA: 'MA',
  ET: 'ET',
  KE: 'KE',
  SN: 'SN',
  GH: 'GH',
  ZW: 'ZW',
  UG: 'UG',
  ZM: 'ZM',
  TZ: 'TZ',
};
/** The currency each country pays in. Germany and France both pay euros (ADR-105). */
export const COUNTRY_CURRENCY: Record<KycCountry, string> = {
  NG: 'NGN',
  GB: 'GBP',
  US: 'USD',
  CA: 'CAD',
  DE: 'EUR',
  FR: 'EUR',
  CN: 'CNY',
  // ADR-107: Zimbabwe pays in US dollars.
  EG: 'EGP',
  ZA: 'ZAR',
  MA: 'MAD',
  ET: 'ETB',
  KE: 'KES',
  SN: 'XOF',
  GH: 'GHS',
  ZW: 'USD',
  UG: 'UGX',
  ZM: 'ZMW',
  TZ: 'TZS',
};

export function isKycCountry(v: unknown): v is KycCountry {
  return typeof v === 'string' && (KYC_COUNTRIES as readonly string[]).includes(v);
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
