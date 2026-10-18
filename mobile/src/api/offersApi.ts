/**
 * Typed calls to the offer endpoints (Milestone 4.1C, ADR-029).
 *
 * An offer is a record of what someone is willing to exchange — information, not money.
 * Amounts and rates travel as decimal strings, never JSON numbers.
 */

import { apiRequest, type RequestOptions } from './client';

export interface ServerOffer {
  offer_id: string;
  source_currency: string;
  target_currency: string;
  source_amount: string;
  matched_amount: string;
  remaining_amount: string;
  desired_rate: string;
  status: 'open' | 'partially_matched' | 'fully_matched' | 'withdrawn' | 'cancelled' | 'expired';
  is_own: boolean;
  version: number;
  created_at: string;
}

export interface ListingsPage {
  items: ServerOffer[];
  limit: number;
  offset: number;
  next_offset: number | null;
}

/** A Match (ADR-031): who agreed to take how much at what rate. Information, not money. */
export interface ServerMatch {
  match_id: string;
  offer_id: string;
  currency: string;
  counter_currency: string;
  allocated_amount: string;
  agreed_rate: string;
  accepted_at: string;
  server_order_key: string;
  your_role: 'taker' | 'offer_owner';
}

export interface NewOffer {
  source_currency: string;
  target_currency: string;
  source_amount: string;
  desired_rate: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const offersApi = {
  listings: (token: string, pair: string, limit = 50, offset = 0, x: Extra = {}) =>
    apiRequest<ListingsPage>(
      'GET',
      `/api/v1/marketplace/listings?filter%5Bcurrency_pair%5D=${encodeURIComponent(pair)}&limit=${limit}&offset=${offset}`,
      { token, ...x },
    ),
  publish: (token: string, offer: NewOffer, idempotencyKey: string, x: Extra = {}) =>
    apiRequest<ServerOffer>('POST', '/api/v1/offers', {
      token,
      body: offer,
      headers: { 'Idempotency-Key': idempotencyKey },
      ...x,
    }),
  mine: (token: string, x: Extra = {}) => apiRequest<ServerOffer[]>('GET', '/api/v1/offers/mine', { token, ...x }),
  updateRate: (token: string, offerId: string, desiredRate: string, x: Extra = {}) =>
    apiRequest<ServerOffer>('PATCH', `/api/v1/offers/${encodeURIComponent(offerId)}`, {
      token,
      body: { desired_rate: desiredRate },
      ...x,
    }),
  get: (token: string, offerId: string, x: Extra = {}) =>
    apiRequest<ServerOffer>('GET', `/api/v1/offers/${encodeURIComponent(offerId)}`, { token, ...x }),
  /** Take some or all of an offer. Needs a `trade.accept` step-up token (ADR-026/031). */
  accept: (token: string, offerId: string, amount: string, idempotencyKey: string, stepUpToken: string | null, x: Extra = {}) =>
    apiRequest<ServerMatch>('POST', `/api/v1/offers/${encodeURIComponent(offerId)}/accept`, {
      token,
      body: { accepted_amount: amount },
      headers: {
        'Idempotency-Key': idempotencyKey,
        ...(stepUpToken ? { 'X-Step-Up-Token': stepUpToken } : {}),
      },
      ...x,
    }),
  myMatches: (token: string, x: Extra = {}) => apiRequest<ServerMatch[]>('GET', '/api/v1/matches/mine', { token, ...x }),
  withdraw: (token: string, offerId: string, x: Extra = {}) =>
    apiRequest<ServerOffer>('DELETE', `/api/v1/offers/${encodeURIComponent(offerId)}`, { token, ...x }),
};
