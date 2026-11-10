/**
 * MOCK DATA for the Market screens (ADR-005). No API exists yet; values follow the Figma
 * Market frames (79:399, 94:557, 436:7771, 106:1150). Rates are integer thousandths of the
 * NGN price of one unit of the foreign currency; amounts are integer minor units.
 */

import { rateProblem } from './rateCeiling';
import { k } from "../../i18n";

export interface Currency {
  readonly code: string;
  readonly name: string;
  /** Emoji flag, decorative. The code is always shown beside it. */
  readonly flag: string;
}

export const NGN: Currency = { code: 'NGN', name: k("Nigerian Naira"), flag: '🇳🇬' };

/** Currencies a NGN holder can buy. */
export const BUYABLE: readonly Currency[] = [
  { code: 'USD', name: k("US Dollar"), flag: '🇺🇸' },
  { code: 'GBP', name: k("British Pound"), flag: '🇬🇧' },
  { code: 'CAD', name: k("Canadian Dollar"), flag: '🇨🇦' },
  { code: 'EUR', name: k("Euro"), flag: '🇪🇺' },
  // ADR-105: shown only when the server offers the yuan (China is switched off until then).
  { code: 'CNY', name: k("Chinese Yuan"), flag: '🇨🇳' },
  { code: 'AUD', name: k("Australian Dollar"), flag: '🇦🇺' },
];

/** Currencies a seller can receive. Figma: "Currencies you are licensed to sell". */
export const RECEIVABLE: readonly Currency[] = [NGN];

/**
 * Current market band (NGN per 1 unit, ×1000), per foreign currency. MOCK. Repriced
 * 2026-10-17 (ADR-020) so the top of each band is the CBN official rate, the maximum any
 * rate may be. AUD has no official rate, and CAD (ADR-101) has no demo band, so none is shown.
 */
export const MARKET_BAND: Readonly<Record<string, { low: number; high: number }>> = {
  USD: { low: 1305000, high: 1333260 },
  GBP: { low: 1725000, high: 1765110 },
  EUR: { low: 1460000, high: 1491200 },
};

export interface Listing {
  readonly id: string;
  /** Foreign currency of the listing (what the buyer receives). */
  readonly currency: string;
  /** Amount available, minor units of `currency`. */
  readonly availableMinor: number;
  /** NGN per 1 unit, ×1000 (3 decimals). */
  readonly rateMilli: number;
  /** "Offer Time: 5 mins ago" or "User 9867". */
  readonly meta: string;
  readonly best?: boolean;
  /** Server offers only: the exact rate text when it has more than three decimals (stored before the 3-decimal rule). */
  readonly rateLabel?: string;
  /** Server offers only: the signed-in user's own offer. */
  readonly own?: boolean;
  /**
   * ADR-059 Decision 4 (server offers only): someone is paying for it (or it is held for
   * someone's 5-minute turn). `availableMinor` is then what may come back.
   */
  readonly waiting?: { readonly queueLength: number; readonly inQueue: boolean; readonly yourTurn: boolean };
}

/**
 * Sell offers a buyer can take (Buy mode). MOCK. Rates repriced 2026-10-17 to sit at or
 * below the CBN official rate (ADR-020); Figma’s amounts and labels are kept. CAD and AUD
 * offers stay in the data but are not eligible (no official rate yet).
 */
export const OFFERS: readonly Listing[] = [
  { id: 'o1', currency: 'USD', availableMinor: 20000, rateMilli: 1325000, meta: k("Offer Time: 5 mins ago"), best: true },
  { id: 'o2', currency: 'USD', availableMinor: 20000, rateMilli: 1332000, meta: 'User 9867' },
  { id: 'o3', currency: 'USD', availableMinor: 20000, rateMilli: 1330000, meta: 'User 0897' },
  { id: 'o4', currency: 'USD', availableMinor: 50000, rateMilli: 1325000, meta: k("Offer Time: 12 mins ago") },
  { id: 'o8', currency: 'USD', availableMinor: 40000, rateMilli: 1328000, meta: 'User 5512' },
  { id: 'g1', currency: 'GBP', availableMinor: 30000, rateMilli: 1760000, meta: k("Offer Time: 4 mins ago"), best: true },
  { id: 'g2', currency: 'GBP', availableMinor: 50000, rateMilli: 1763000, meta: 'User 2208' },
  { id: 'o5', currency: 'CAD', availableMinor: 30000, rateMilli: 1180000, meta: k("Offer Time: 3 mins ago"), best: true },
  { id: 'o6', currency: 'EUR', availableMinor: 15000, rateMilli: 1488000, meta: 'User 4410', best: true },
  { id: 'o7', currency: 'AUD', availableMinor: 25000, rateMilli: 1055000, meta: k("Offer Time: 9 mins ago"), best: true },
];

/** Buy requests a seller can fill (Sell mode). Figma: "Available USD request". Repriced as above. */
export const REQUESTS: readonly Listing[] = [
  { id: 'r1', currency: 'USD', availableMinor: 20000, rateMilli: 1330000, meta: k("Request Time: 5 mins ago"), best: true },
  { id: 'r2', currency: 'USD', availableMinor: 20000, rateMilli: 1330000, meta: k("Request Time: 5 mins ago") },
  { id: 'r3', currency: 'USD', availableMinor: 35000, rateMilli: 1326000, meta: 'User 2231' },
];

/** Cheapest first for a buyer; best price first for a seller. */
export function listingsFor(
  side: 'buy' | 'sell',
  currency: string,
): readonly Listing[] {
  const source = side === 'buy' ? OFFERS : REQUESTS;
  return source
    // A listing above the official rate is not eligible to be accepted (rateCeiling.ts).
    .filter((l) => l.currency === currency && rateProblem(l.currency, l.rateMilli) === null)
    .slice()
    .sort((a, b) =>
      side === 'buy' ? a.rateMilli - b.rateMilli : b.rateMilli - a.rateMilli,
    );
}

/** Emoji flag for a currency code; decorative only, the code is always shown too. */
export function flagFor(code: string): string {
  if (code === NGN.code) return NGN.flag;
  return BUYABLE.find((c) => c.code === code)?.flag ?? '🏳️';
}
