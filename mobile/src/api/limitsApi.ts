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
