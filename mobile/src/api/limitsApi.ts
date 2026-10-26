/** My verification tier and trade limits (ADR-058). Amounts are naira decimal text. */

import { apiRequest, type RequestOptions } from './client';

export interface LimitsView {
  tier: number;
  /** Null at Tier 0 (look only). */
  daily_limit: string | null;
  monthly_limit: string | null;
  used_today: string;
  used_this_month: string;
  left_today: string;
  left_this_month: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const limitsApi = {
  mine: (token: string, x: Extra = {}) => apiRequest<LimitsView>('GET', '/api/v1/users/me/limits', { token, ...x }),
};

/** ADR-058: my checks for Tier 2 and Tier 3. */
export interface TierChecksView {
  tier: number;
  bvn: 'approved' | 'declined' | 'in_review' | null;
  address: Record<string, string> | null;
  proof_of_address: 'approved' | 'declined' | 'in_review' | null;
  source_of_funds: string | null;
}

export interface AddressInput {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postcode?: string;
  country: 'NG' | 'GB' | 'US';
}

const base = '/api/v1/users/me/tier-checks';

export const tierChecksApi = {
  get: (token: string, x: Extra = {}) => apiRequest<TierChecksView>('GET', base, { token, ...x }),
  bvn: (token: string, bvn: string, x: Extra = {}) => apiRequest<TierChecksView>('POST', `${base}/bvn`, { token, body: { bvn }, ...x }),
  address: (token: string, address: AddressInput, x: Extra = {}) =>
    apiRequest<TierChecksView>('POST', `${base}/address`, { token, body: address, ...x }),
  /** The photo or PDF goes to the server, which sends it to Didit and keeps only the result. */
  proofOfAddress: (token: string, document: string, contentType: string, x: Extra = {}) =>
    apiRequest<TierChecksView>('POST', `${base}/proof-of-address`, {
      token,
      body: { document, content_type: contentType },
      timeoutMs: 90_000,
      ...x,
    }),
  sourceOfFunds: (token: string, source: string, note: string | undefined, x: Extra = {}) =>
    apiRequest<TierChecksView>('POST', `${base}/source-of-funds`, { token, body: { source, ...(note ? { note } : {}) }, ...x }),
};
