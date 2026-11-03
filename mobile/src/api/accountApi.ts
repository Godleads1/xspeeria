/** Deleting my account (ADR-095). */

import { apiRequest, type RequestOptions } from './client';

export type DeleteBlocker = 'account_not_active' | 'deal_in_progress' | 'dispute_open' | 'refund_pending' | 'under_review';

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const accountApi = {
  /** What would stop a deletion now; empty means it can go ahead. */
  deleteCheck: (token: string, x: Extra = {}) =>
    apiRequest<{ blockers: DeleteBlocker[]; restore_days: number }>('GET', '/api/v1/users/me/delete-account', { token, ...x }),
  /** Needs a one-use `account.delete` approval (the second check). */
  deleteAccount: (token: string, approval: string, x: Extra = {}) =>
    apiRequest<{ restore_until: string }>('POST', '/api/v1/users/me/delete-account', {
      token,
      headers: { 'X-Step-Up-Token': approval },
      ...x,
    }),
};
