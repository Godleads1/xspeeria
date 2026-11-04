/** Fee quote (ADR-098): the fee one side pays on an amount, shown before confirming. */

import { apiRequest, type RequestOptions } from './client';

export interface FeeQuote {
  currency: string;
  amount: string;
  side: 'maker' | 'taker';
  /** Decimal text in `currency`. */
  fee: string;
  /** Amount + fee: what this side pays into its escrow. */
  total: string;
}

type Extra = Pick<RequestOptions, 'fetchImpl' | 'baseUrl'>;

export const feesApi = {
  quote: (token: string, currency: string, amount: string, side: 'maker' | 'taker', x: Extra = {}) =>
    apiRequest<FeeQuote>(
      'GET',
      `/api/v1/fees/quote?currency=${encodeURIComponent(currency)}&amount=${encodeURIComponent(amount)}&side=${side}`,
      { token, ...x },
    ),
};
