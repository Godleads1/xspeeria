/**
 * MOCK DATA for the Market screens (ADR-005). No API exists yet; values follow the Figma
 * Market frames (79:399, 94:557, 436:7771, 106:1150). Rates are integer hundredths of the
 * NGN price of one unit of the foreign currency; amounts are integer minor units.
 */

import { rateProblem } from './rateCeiling';

export interface Currency {
  readonly code: string;
  readonly name: string;
  /** Emoji flag, decorative. The code is always shown beside it. */
  readonly flag: string;
}

export const NGN: Currency = { code: 'NGN', name: 'Nigerian Naira', flag: '🇳🇬' };

/** Currencies a NGN holder can buy. */
export const BUYABLE: readonly Currency[] = [
  { code: 'USD', name: 'US Dollar', flag: '🇺🇸' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺' },
];

/** Currencies a seller can receive. Figma: "Currencies you are licensed to sell". */
export const RECEIVABLE: readonly Currency[] = [NGN];

/**
 * Current market band (NGN per 1 unit, ×100), per foreign currency. MOCK. Repriced
 * 2026-10-17 (ADR-020) so the top of each band is the CBN official rate, the maximum any
 * rate may be. CAD and AUD have no official rate yet, so no band is shown for them.
 */
export const MARKET_BAND: Readonly<Record<string, { low: number; high: number }>> = {
  USD: { low: 130500, high: 133326 },
  GBP: { low: 172500, high: 176511 },
  EUR: { low: 146000, high: 149120 },
};

export interface Listing {
  readonly id: string;
  /** Foreign currency of the listing (what the buyer receives). */
  readonly currency: string;
  /** Amount available, minor units of `currency`. */
  readonly availableMinor: number;
  /** NGN per 1 unit, ×100. */
  readonly rateHundredths: number;
  /** "Offer Time: 5 mins ago" or "User 9867". */
  readonly meta: string;
  readonly best?: boolean;
  /** Server offers only: the exact rate text when it has more than two decimals. */
  readonly rateLabel?: string;
  /** Server offers only: the signed-in user's own offer. */
  readonly own?: boolean;
}

/**
 * Sell offers a buyer can take (Buy mode). MOCK. Rates repriced 2026-10-17 to sit at or
 * below the CBN official rate (ADR-020); Figma's amounts and labels are kept. CAD and AUD
 * offers stay in the data but are not eligible (no official rate yet).
 */
export const OFFERS: readonly Listing[] = [
  { id: 'o1', currency: 'USD', availableMinor: 20000, rateHundredths: 132500, meta: 'Offer Time: 5 mins ago', best: true },
  { id: 'o2', currency: 'USD', availableMinor: 20000, rateHundredths: 133200, meta: 'User 9867' },
  { id: 'o3', currency: 'USD', availableMinor: 20000, rateHundredths: 133000, meta: 'User 0897' },
  { id: 'o4', currency: 'USD', availableMinor: 50000, rateHundredths: 132500, meta: 'Offer Time: 12 mins ago' },
  { id: 'o8', currency: 'USD', availableMinor: 40000, rateHundredths: 132800, meta: 'User 5512' },
  { id: 'g1', currency: 'GBP', availableMinor: 30000, rateHundredths: 176000, meta: 'Offer Time: 4 mins ago', best: true },
  { id: 'g2', currency: 'GBP', availableMinor: 50000, rateHundredths: 176300, meta: 'User 2208' },
  { id: 'o5', currency: 'CAD', availableMinor: 30000, rateHundredths: 118000, meta: 'Offer Time: 3 mins ago', best: true },
  { id: 'o6', currency: 'EUR', availableMinor: 15000, rateHundredths: 148800, meta: 'User 4410', best: true },
  { id: 'o7', currency: 'AUD', availableMinor: 25000, rateHundredths: 105500, meta: 'Offer Time: 9 mins ago', best: true },
];

/** Buy requests a seller can fill (Sell mode). Figma: "Available USD request". Repriced as above. */
export const REQUESTS: readonly Listing[] = [
  { id: 'r1', currency: 'USD', availableMinor: 20000, rateHundredths: 133000, meta: 'Request Time: 5 mins ago', best: true },
  { id: 'r2', currency: 'USD', availableMinor: 20000, rateHundredths: 133000, meta: 'Request Time: 5 mins ago' },
  { id: 'r3', currency: 'USD', availableMinor: 35000, rateHundredths: 132600, meta: 'User 2231' },
];

/** Cheapest first for a buyer; best price first for a seller. */
export function listingsFor(
  side: 'buy' | 'sell',
  currency: string,
): readonly Listing[] {
  const source = side === 'buy' ? OFFERS : REQUESTS;
  return source
    // A listing above the official rate is not eligible to be accepted (rateCeiling.ts).
    .filter((l) => l.currency === currency && rateProblem(l.currency, l.rateHundredths) === null)
    .slice()
    .sort((a, b) =>
      side === 'buy' ? a.rateHundredths - b.rateHundredths : b.rateHundredths - a.rateHundredths,
    );
}

/** Emoji flag for a currency code; decorative only, the code is always shown too. */
export function flagFor(code: string): string {
  if (code === NGN.code) return NGN.flag;
  return BUYABLE.find((c) => c.code === code)?.flag ?? '🏳️';
}
