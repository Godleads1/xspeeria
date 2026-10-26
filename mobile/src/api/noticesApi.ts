/** Outage notices staff have reported (ADR-066). Read-only; shown on Home. */

import { apiRequest, type RequestOptions } from './client';

export interface ServiceNotice {
  id: string;
  /** Staff's words, shown as written. */
  service: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  started_at: string;
  expected_end_at: string | null;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const noticesApi = {
  list: (token: string, x: Extra = {}) => apiRequest<ServiceNotice[]>('GET', '/api/v1/service-notices', { token, ...x }),
};
