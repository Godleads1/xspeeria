/**
 * Payout accounts and choosing them for a deal (ADR-035).
 *
 * A payout account is where the partner bank pays you from escrow. The full account number is
 * sent once, when adding; the server only ever returns the last 4 digits.
 */

import { apiRequest, type RequestOptions } from './client';
import type { ServerMatch } from './offersApi';

export interface ServerPayoutAccount {
  payout_account_id: string;
  currency: string;
  bank_name: string;
  account_last4: string;
  account_type: string | null;
  account_name: string | null;
  validation_state: 'pending' | 'validated' | 'failed' | 'invalidated';
  payout_hold_until: string;
  created_at: string;
}

export interface NewPayoutAccount {
  currency: string;
  bank_name: string;
  account_number: string;
  routing_number?: string;
  sort_code?: string;
  account_type?: string;
  /** CAD only (ADR-100). */
  institution_number?: string;
  transit_number?: string;
  /** CNY only (ADR-105): the 12-digit CNAPS code of the bank branch. */
  cnaps_code?: string;
  /** ADR-107: a bank in Africa may also need its bank or branch code. */
  branch_code?: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const payoutsApi = {
  list: (token: string, x: Extra = {}) =>
    apiRequest<ServerPayoutAccount[]>('GET', '/api/v1/payout-accounts', { token, ...x }),
  add: (token: string, account: NewPayoutAccount, stepUpToken: string, x: Extra = {}) =>
    apiRequest<ServerPayoutAccount>('POST', '/api/v1/payout-accounts', {
      token,
      body: account,
      headers: { 'X-Step-Up-Token': stepUpToken },
      ...x,
    }),
  remove: (token: string, id: string, stepUpToken: string, x: Extra = {}) =>
    apiRequest<void>('DELETE', `/api/v1/payout-accounts/${encodeURIComponent(id)}`, {
      token,
      headers: { 'X-Step-Up-Token': stepUpToken },
      ...x,
    }),
  choose: (
    token: string,
    matchId: string,
    lines: { payout_account_id: string; amount: string }[],
    stepUpToken: string,
    x: Extra = {},
  ) =>
    apiRequest<ServerMatch>('PUT', `/api/v1/matches/${encodeURIComponent(matchId)}/payout-accounts`, {
      token,
      body: { accounts: lines },
      headers: { 'X-Step-Up-Token': stepUpToken },
      ...x,
    }),
};
