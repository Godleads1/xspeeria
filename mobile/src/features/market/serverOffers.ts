/**
 * The Market screens' link to the server's offers (ADR-029, ADR-030).
 *
 * Offers are records of what someone is willing to exchange — information, not money.
 * The server checks everything again (amount, minimum, rate ceiling, ownership); what the
 * app does here is turn server strings into the screen's integer units and back, without
 * ever passing through floating point.
 */

import { ratesApi } from '../../api/ratesApi';
import { ceilingsFromServer, type Ceilings } from './rateCeiling';
import * as Crypto from 'expo-crypto';

import { ApiError } from '../../api/client';
import { feesApi, type FeeQuote } from '../../api/feesApi';
import { offersApi, type ListingsPage, type ServerMatch, type ServerOffer } from '../../api/offersApi';
import { serverAuth } from '../auth/serverAuth';
import { countryHeaders, viewerCountry } from '../location/viewerCountry';
import { confirmIdentity } from '../security/serverConfirm';
import type { Listing } from './data';
import { amountDecimals, amountText, divRoundHalfEven, exactRate, formatHundredths, parseToHundredths, quoteMinorOrNull, rateText } from './money';
import { tr } from "../../i18n";

/** Server amount text such as "1320.50" or "500000" → hundredths, only when exact. */
export function exactHundredths(text: string): number | null {
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(text)) return null;
  return parseToHundredths(text);
}

/** Group the whole part and keep every decimal: "1320.125" → "1,320.125". */
export function groupedRate(text: string): string {
  const [whole, frac = ''] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${frac.padEnd(2, '0')}`;
}

function minutesAgo(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return tr("Offer time: just now");
  const mins = Math.max(0, Math.floor((now - at) / 60_000));
  if (mins < 1) return tr("Offer time: just now");
  if (mins < 60) return (mins === 1 ? tr("Offer time: 1 min ago") : tr("Offer time: {{count}} mins ago", { count: mins }));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return (hours === 1 ? tr("Offer time: 1 hour ago") : tr("Offer time: {{count}} hours ago", { count: hours }));
  const days = Math.floor(hours / 24);
  return (days === 1 ? tr("Offer time: 1 day ago") : tr("Offer time: {{count}} days ago", { count: days }));
}

/**
 * ADR-056: a buy request is an offer that pays naira. Its foreign amount for display is the
 * naira left ÷ the rate (NGN per 1 unit; read to 6 decimals so an older stored rate stays
 * exact), half to even in the currency's own unit — whole units for UGX and XOF — the same
 * rule the server uses when it is taken (ADR-019). Returned in hundredths. Null when the
 * inputs are not exact decimal text.
 */
export function foreignMinorFor(ngnMinor: number, rate: string, currency = ''): number | null {
  const m = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(rate);
  if (!m || !Number.isSafeInteger(ngnMinor) || ngnMinor < 0) return null;
  const micro = BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
  if (micro <= 0n) return null;
  // kobo ÷ rate = hundredths of the foreign unit; for a whole-unit currency, ÷ 100 first.
  const whole = amountDecimals(currency) === 0;
  const own = divRoundHalfEven(BigInt(ngnMinor) * 1_000_000n, whole ? micro * 100n : micro);
  const n = Number(whole ? own * 100n : own);
  return Number.isSafeInteger(n) ? n : null;
}

/** A server offer as a Market row. Returns null for anything the app cannot show exactly. */
export function toListing(offer: ServerOffer, now: number, best: boolean): Listing | null {
  const request = offer.source_currency === 'NGN';
  const foreign = request ? offer.target_currency : offer.source_currency;
  // ADR-059 Decision 4: a waiting offer shows what may come back (the amount being paid for).
  const waiting = offer.waiting === true;
  const yourTurn = offer.your_turn === true;
  const shownAmount = waiting && !yourTurn && offer.waiting_amount ? offer.waiting_amount : offer.remaining_amount;
  const left = exactHundredths(shownAmount);
  if (left === null || !/^[0-9]+(\.[0-9]{1,6})?$/.test(offer.desired_rate)) return null;
  // A buy request shows how much foreign currency it still wants (ADR-056).
  const remaining = request ? foreignMinorFor(left, offer.desired_rate, foreign) : left;
  if (remaining === null) return null;
  const rate = exactRate(offer.desired_rate);
  // A rate stored before the 3-decimal rule (more decimals) keeps its exact text for
  // display; the integer is then only a sort key (rounded down), never used for an amount.
  const [whole, frac = ''] = offer.desired_rate.split('.');
  const sortKey = rate ?? Number(whole) * 1000 + Number(frac.slice(0, 3).padEnd(3, '0'));
  const queueLength = Math.max(0, Math.min(3, Math.trunc(offer.queue_length ?? 0)));
  const meta = offer.is_own
    ? request
      ? tr("Your request")
      : tr("Your offer")
    : yourTurn
      ? tr("Your turn: take it within 5 minutes")
      : waiting
        ? offer.in_queue
          ? tr("Waiting for payment · You’re in the queue")
          : tr("Waiting for payment · {{count}} of 3 in queue", { count: queueLength })
        : minutesAgo(offer.created_at, now);
  return {
    id: offer.offer_id,
    currency: foreign,
    availableMinor: remaining,
    rateMilli: sortKey,
    ...(rate === null ? { rateLabel: groupedRate(offer.desired_rate) } : {}),
    meta,
    ...(best && !waiting ? { best: true } : {}),
    ...(offer.is_own ? { own: true } : {}),
    ...(waiting || yourTurn ? { waiting: { queueLength, inQueue: offer.in_queue === true, yourTurn } } : {}),
  };
}

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr("Please log in again."));
  return t;
}

export interface MarketServer {
  /** Offers selling `foreign` for naira, best (lowest) rate first. */
  offersFor(foreign: string, now: number): Promise<Listing[]>;
  /** Buy requests for `foreign` (offers paying naira, ADR-056), best (highest) rate first. */
  requestsFor(foreign: string, now: number): Promise<Listing[]>;
  /** Publish an offer to sell `foreign` for naira. Safe to retry with the same key. */
  publishSell(foreign: string, amountMinor: number, rateMilli: number, key: string): Promise<ServerOffer>;
  /**
   * ADR-056: publish a request to buy `amountMinor` of `foreign`, saved as an offer paying
   * amount × rate in naira (half to even). Safe to retry with the same key.
   */
  publishBuy(foreign: string, amountMinor: number, rateMilli: number, key: string): Promise<ServerOffer>;
  newKey(): string;
  /** ADR-102: the rate ceilings in force now. Optional so older test doubles still work. */
  ceilings?(): Promise<Ceilings>;
}

/**
 * ADR-059 Decision 2: a listings page with the phone's country, or a clear error when the
 * location rule hides it or no country is known. Asks for location only when `ask` is true.
 */
export async function locatedPage(pair: string, ask: boolean): Promise<ListingsPage> {
  const country = await viewerCountry.get({ ask });
  const page = await offersApi.listings(token(), pair, 50, 0, { ...serverAuth.apiOptions(), headers: countryHeaders(country) });
  if (page.needs_location) throw new ApiError('LOCATION_NEEDED', 0, tr("Turn on location to see deals. We use only your country."));
  if (page.hidden) {
    const sold = pair.split('/')[0];
    throw new ApiError('LISTINGS_HIDDEN', 0, tr("Listings that sell {{currency}} aren’t shown in your country.", { currency: sold }));
  }
  return page;
}

export const marketServer: MarketServer = {
  async offersFor(foreign, now) {
    const page = await locatedPage(`${foreign}/NGN`, true);
    const rows: Listing[] = [];
    page.items.forEach((o) => {
      const row = toListing(o, now, rows.every((r) => r.waiting));
      if (row) rows.push(row);
    });
    return rows;
  },
  async requestsFor(foreign, now) {
    const page = await locatedPage(`NGN/${foreign}`, true);
    const rows: Listing[] = [];
    page.items.forEach((o) => {
      const row = toListing(o, now, rows.every((r) => r.waiting));
      if (row) rows.push(row);
    });
    return rows;
  },
  async publishBuy(foreign, amountMinor, rateMilli, key) {
    const naira = quoteMinorOrNull(amountMinor, rateMilli);
    if (naira === null) throw new ApiError('VAL_422_AMOUNT_INVALID', 422, tr("Enter the amount as a number, e.g. 1000.00."));
    return offersApi.publish(
      token(),
      {
        source_currency: 'NGN',
        target_currency: foreign,
        source_amount: formatHundredths(naira).replace(/,/g, ''),
        desired_rate: rateText(rateMilli),
      },
      key,
      serverAuth.apiOptions(),
    );
  },
  async publishSell(foreign, amountMinor, rateMilli, key) {
    return offersApi.publish(
      token(),
      {
        source_currency: foreign,
        target_currency: 'NGN',
        source_amount: amountText(foreign, amountMinor),
        desired_rate: rateText(rateMilli),
      },
      key,
      serverAuth.apiOptions(),
    );
  },
  newKey: () => Crypto.randomUUID(),
  ceilings: async () => ceilingsFromServer((await ratesApi.official(token(), serverAuth.apiOptions())).items),
};

export const myOffers = {
  list: async () => offersApi.mine(token(), serverAuth.apiOptions()),
  withdraw: async (offerId: string) => offersApi.withdraw(token(), offerId, serverAuth.apiOptions()),
  /**
   * ADR-059 Decision 3: new amount (in the foreign currency) and rate. A buy request holds
   * naira, so its amount becomes amount × rate, half to even (as when publishing, ADR-056).
   * The server checks everything again and refuses once anyone has taken part of it.
   */
  edit: async (offer: ServerOffer, amountMinor: number, rateMilli: number) => {
    const desired_rate = rateText(rateMilli);
    // ADR-059 Decision 5: every currency of a request pays the same naira; only the rate changes.
    if (offer.group_id) return offersApi.edit(token(), offer.offer_id, { desired_rate }, serverAuth.apiOptions());
    const request = offer.source_currency === 'NGN';
    const own = request ? quoteMinorOrNull(amountMinor, rateMilli) : amountMinor;
    if (own === null) throw new ApiError('VAL_422_AMOUNT_INVALID', 422, tr("Enter the amount as a number, e.g. 1000.00."));
    return offersApi.edit(
      token(),
      offer.offer_id,
      {
        source_amount: amountText(offer.source_currency, own),
        desired_rate: rateText(rateMilli),
      },
      serverAuth.apiOptions(),
    );
  },
};

/** Taking an offer (ADR-031): read it fresh, get an approval, accept. */
export interface TakeSource {
  offer(offerId: string): Promise<ServerOffer>;
  /** "Confirm it's you" → a one-use `trade.accept` approval; null when cancelled. */
  approve(reason: string): Promise<string | null>;
  /** Same key → same answer; a retry never makes a second Match. */
  accept(offerId: string, amount: string, expectedRate: string, key: string, stepUpToken: string | null): Promise<ServerMatch>;
  newKey(): string;
  /** ADR-098: the fee on what the taker sends; optional so older test doubles still work. */
  feeQuote?(currency: string, amount: string): Promise<FeeQuote>;
}

export const takeServer: TakeSource = {
  offer: async (offerId) => offersApi.get(token(), offerId, serverAuth.apiOptions()),
  approve: async (reason) => confirmIdentity('trade.accept', reason),
  accept: async (offerId, amount, expectedRate, key, stepUpToken) =>
    offersApi.accept(token(), offerId, amount, expectedRate, key, stepUpToken, serverAuth.apiOptions()),
  newKey: () => Crypto.randomUUID(),
  feeQuote: async (currency, amount) => feesApi.quote(token(), currency, amount, serverAuth.apiOptions()),
};

export const myDeals = {
  list: async () => offersApi.myMatches(token(), serverAuth.apiOptions()),
};

/**
 * ADR-059 Decision 4: the waiting queue. The server checks everything (who may wait, the limit
 * of 3, one queue per person) and decides whose turn it is.
 */
export const queueServer = {
  join: async (offerId: string) => offersApi.joinQueue(token(), offerId, serverAuth.apiOptions()),
  leave: async (offerId: string) => offersApi.leaveQueue(token(), offerId, serverAuth.apiOptions()),
  mine: async () => offersApi.myQueue(token(), serverAuth.apiOptions()),
};

/** ADR-059 Decision 5: post one naira amount for any one of 2–5 currencies (repeat-safe). */
export const multiRequestServer = {
  publish: async (nairaMinor: number, lines: readonly { currency: string; rateMilli: number }[], key: string) =>
    offersApi.publishGroup(
      token(),
      {
        source_amount: formatHundredths(nairaMinor).replace(/,/g, ''),
        currencies: lines.map((l) => ({ currency: l.currency, desired_rate: rateText(l.rateMilli) })),
      },
      key,
      serverAuth.apiOptions(),
    ),
  newKey: () => Crypto.randomUUID(),
};
