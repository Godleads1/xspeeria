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
  /** ADR-059 Decision 4 (listings): someone is paying for it, or it is held for someone's turn. */
  waiting?: boolean;
  /** What may come back to take, in the offer's own currency. */
  waiting_amount?: string | null;
  queue_length?: number;
  in_queue?: boolean;
  your_turn?: boolean;
}

/** ADR-059 Decision 4: my place in an offer's waiting queue. */
export interface QueueEntry {
  offer_id: string;
  status: 'waiting' | 'notified';
  position: number;
  queue_length: number;
  turn_deadline: string | null;
}

/** ADR-059 "Success": a recent completed trade. No ids, no names; nothing to take. */
export interface CompletedTrade {
  /** The pair's foreign currency; `amount` is in it. */
  currency: string;
  amount: string;
  /** NGN per 1 unit of `currency`, as agreed. */
  rate: string;
  completed_at: string;
}

export interface ListingsPage {
  /** "available" (offers in `items`) or "success" (trades in `trades`). Older servers omit it. */
  status?: 'available' | 'success';
  /** ADR-059 Decision 2: the country used for the location rule; null when unknown. */
  viewer_country?: string | null;
  /** This pair sells the viewer's own currency, so nothing is shown. */
  hidden?: boolean;
  /** No country is known (location off and no approved check), so nothing is shown. */
  needs_location?: boolean;
  items: ServerOffer[];
  trades?: CompletedTrade[];
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
  /** ADR-035: what this side receives, and the 30-minute payout-account step. */
  you_receive_currency?: string;
  you_receive_amount?: string;
  preparation_state?: 'awaiting_payout_accounts' | 'funding_ready' | 'expired';
  preparation_deadline?: string | null;
  you_chose_payout_accounts?: boolean;
  other_side_chose_payout_accounts?: boolean;
  /** ADR-045: the amount in `counter_currency` (decimal text). */
  counter_amount?: string | null;
  /** ADR-045: escrow phase on "my matches"; null before the escrow opens. */
  settlement_phase?: string | null;
}

export interface NewOffer {
  source_currency: string;
  target_currency: string;
  source_amount: string;
  desired_rate: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;
/** Listings may also carry the `X-Device-Country` header (ADR-059 Decision 2). */
type ListingExtra = Extra & Pick<RequestOptions, 'headers'>;

/** ADR-059 search. Values are decimal text; the server checks every one again. */
export interface SearchParams {
  sort?: 'best_rate' | 'newest' | 'oldest' | 'largest' | 'smallest';
  status?: 'available' | 'success';
  min_rate?: string;
  max_rate?: string;
  min_amount?: string;
  max_amount?: string;
}

/** `filter[x]=value` pairs for the listings endpoint (sort is a plain `sort=`). */
export function searchQuery(params: SearchParams): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params) as [keyof SearchParams, string | undefined][]) {
    if (value === undefined || value === '') continue;
    const name = key === 'sort' ? 'sort' : `filter[${key}]`;
    parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `&${parts.join('&')}` : '';
}

export const offersApi = {
  listings: (token: string, pair: string, limit = 50, offset = 0, x: ListingExtra = {}) =>
    apiRequest<ListingsPage>(
      'GET',
      `/api/v1/marketplace/listings?filter%5Bcurrency_pair%5D=${encodeURIComponent(pair)}&limit=${limit}&offset=${offset}`,
      { token, ...x },
    ),
  search: (token: string, pair: string, params: SearchParams, limit = 50, x: ListingExtra = {}) =>
    apiRequest<ListingsPage>(
      'GET',
      `/api/v1/marketplace/listings?filter%5Bcurrency_pair%5D=${encodeURIComponent(pair)}&limit=${limit}&offset=0${searchQuery(params)}`,
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
  /** ADR-059 Decision 4: wait for an offer someone else is paying for. */
  joinQueue: (token: string, offerId: string, x: Extra = {}) =>
    apiRequest<QueueEntry>('POST', `/api/v1/offers/${encodeURIComponent(offerId)}/queue`, { token, ...x }),
  leaveQueue: (token: string, offerId: string, x: Extra = {}) =>
    apiRequest<null>('DELETE', `/api/v1/offers/${encodeURIComponent(offerId)}/queue`, { token, ...x }),
  myQueue: (token: string, x: Extra = {}) => apiRequest<QueueEntry | null>('GET', '/api/v1/offers/queue/mine', { token, ...x }),
  updateRate: (token: string, offerId: string, desiredRate: string, x: Extra = {}) =>
    apiRequest<ServerOffer>('PATCH', `/api/v1/offers/${encodeURIComponent(offerId)}`, {
      token,
      body: { desired_rate: desiredRate },
      ...x,
    }),
  /** ADR-059 Decision 3: change the rate and amount (amount in the offer's own currency). */
  edit: (token: string, offerId: string, change: { desired_rate: string; source_amount: string }, x: Extra = {}) =>
    apiRequest<ServerOffer>('PATCH', `/api/v1/offers/${encodeURIComponent(offerId)}`, { token, body: change, ...x }),
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
  match: (token: string, matchId: string, x: Extra = {}) =>
    apiRequest<ServerMatch>('GET', `/api/v1/matches/${encodeURIComponent(matchId)}`, { token, ...x }),
  withdraw: (token: string, offerId: string, x: Extra = {}) =>
    apiRequest<ServerOffer>('DELETE', `/api/v1/offers/${encodeURIComponent(offerId)}`, { token, ...x }),
};
