/**
 * Escrow steps for one deal (ADR-037). Amounts are decimal strings, never numbers.
 *
 * Xspeeria never holds money: each side pays into the partner bank's escrow and the bank pays
 * out. The pay-in account shown is the bank's escrow account for this deal, not a user's.
 */

import { apiRequest, type RequestOptions } from './client';

export type LegState =
  | 'PENDING'
  | 'ESCROW_PROVISIONED'
  | 'FUNDED'
  | 'RELEASE_SENT'
  | 'PAID_OUT'
  | 'RETURN_SENT'
  | 'RETURNED'
  | 'PROVISION_FAILED'
  | 'PAYOUT_FAILED';

export type SettlementPhase =
  | 'INITIALIZING'
  | 'AWAITING_FUNDING'
  | 'RELEASING'
  | 'COMPLETED'
  | 'UNWINDING'
  | 'CLOSED_UNWOUND'
  | 'RECOVERY_REQUIRED'
  | 'CLOSED_RECOVERED'
  | 'CLOSED_WITH_LOSS'
  | 'CANCELLED';

export interface ServerSettlement {
  settlement_id: string;
  phase: SettlementPhase;
  closure_reason: string | null;
  /** True on a developer's computer with the pretend bank: no real money moves. */
  simulated: boolean;
  funding_deadline: string | null;
  on_hold: boolean;
  you_pay: {
    leg_id: string;
    currency: string;
    amount: string;
    fee: string;
    total: string;
    state: LegState;
    pay_in: { bank_name: string; account_name: string; account_number: string; reference: string } | null;
  };
  you_receive: { currency: string; amount: string; state: LegState };
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const escrowApi = {
  get: (token: string, matchId: string, x: Extra = {}) =>
    apiRequest<ServerSettlement>('GET', `/api/v1/matches/${encodeURIComponent(matchId)}/settlement`, { token, ...x }),
  /** Developer computers only (pretend bank). */
  simulateTransfer: (token: string, matchId: string, x: Extra = {}) =>
    apiRequest<ServerSettlement>('POST', `/api/v1/dev/matches/${encodeURIComponent(matchId)}/simulate-transfer`, {
      token,
      ...x,
    }),
};
