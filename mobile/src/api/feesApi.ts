/** Fee quote (ADR-098): the 1% fee on an amount (ADR-021), shown before confirming. */

import { apiRequest, type RequestOptions } from './client';

export interface FeeQuote {
  currency: string;
  amount: string;
  /** Decimal text in `currency`. */
  fee: string;
  /** Amount + fee: what this side pays into its escrow. */
  total: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const feesApi = {
  quote: (token: string, currency: string, amount: string, x: Extra = {}) =>
    apiRequest<FeeQuote>(
      'GET',
      `/api/v1/fees/quote?currency=${encodeURIComponent(currency)}&amount=${encodeURIComponent(amount)}`,
      { token, ...x },
    ),
};
