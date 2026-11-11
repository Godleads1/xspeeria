/** ADR-102: the rate ceilings in force on the server (fetched automatically from the CBN). */

import { apiRequest, type RequestOptions } from './client';

export interface ServerCeilings {
  items: { currency: string; max_rate: string; derived: boolean }[];
  cad_per_usd: string;
  /** ADR-111: limits for pairs without naira, quote per 1 base (e.g. 11.604 GHS per USD). */
  pairs?: { base: string; quote: string; max_rate: string }[];
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const ratesApi = {
  official: (token: string, x: Extra = {}) =>
    apiRequest<ServerCeilings>('GET', '/api/v1/rates/official', { token, ...x }),
};
