/** Identity checks (ADR-039). The verification link is Didit's hosted check, shown once. */

import { apiRequest, type RequestOptions } from './client';

export type KycStatus = 'not_started' | 'pending_documents' | 'under_review' | 'approved' | 'rejected' | 'expired';

export interface ServerKycCase {
  kyc_case_id: string | null;
  status: KycStatus;
  message: string | null;
  verification_url: string | null;
  legal_name: string | null;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const kycApi = {
  current: (token: string, x: Extra = {}) => apiRequest<ServerKycCase>('GET', '/api/v1/kyc/cases/current', { token, ...x }),
  start: (token: string, x: Extra = {}) => apiRequest<ServerKycCase>('POST', '/api/v1/kyc/cases', { token, ...x }),
};
