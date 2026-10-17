/**
 * MOCK DATA for the Market screens (ADR-005). No API exists yet; values follow the Figma
 * Market frames (79:399, 94:557, 436:7771, 106:1150). Rates are integer hundredths of the
 * NGN price of one unit of the foreign currency; amounts are integer minor units.
 */

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
  { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺' },
];

/** Currencies a seller can receive. Figma: "Currencies you are licensed to sell". */
export const RECEIVABLE: readonly Currency[] = [NGN];

/** Current market band (NGN per 1 unit, ×100), per foreign currency. Figma: USD band. */
export const MARKET_BAND: Readonly<Record<string, { low: number; high: number }>> = {
  USD: { low: 165089, high: 189999 },
  CAD: { low: 112000, high: 121500 },
  EUR: { low: 170100, high: 181000 },
  AUD: { low: 102000, high: 109900 },
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
}

/** Sell offers a buyer can take (Buy mode). */
export const OFFERS: readonly Listing[] = [
  { id: 'o1', currency: 'USD', availableMinor: 20000, rateHundredths: 189300, meta: 'Offer Time: 5 mins ago', best: true },
  { id: 'o2', currency: 'USD', availableMinor: 20000, rateHundredths: 190700, meta: 'User 9867' },
  { id: 'o3', currency: 'USD', availableMinor: 20000, rateHundredths: 190200, meta: 'User 0897' },
  { id: 'o4', currency: 'USD', availableMinor: 50000, rateHundredths: 189300, meta: 'Offer Time: 12 mins ago' },
  { id: 'o5', currency: 'CAD', availableMinor: 30000, rateHundredths: 118000, meta: 'Offer Time: 3 mins ago', best: true },
  { id: 'o6', currency: 'EUR', availableMinor: 15000, rateHundredths: 176500, meta: 'User 4410', best: true },
  { id: 'o7', currency: 'AUD', availableMinor: 25000, rateHundredths: 105500, meta: 'Offer Time: 9 mins ago', best: true },
];

/** Buy requests a seller can fill (Sell mode). Figma: "Available USD request". */
export const REQUESTS: readonly Listing[] = [
  { id: 'r1', currency: 'USD', availableMinor: 20000, rateHundredths: 189300, meta: 'Request Time: 5 mins ago', best: true },
  { id: 'r2', currency: 'USD', availableMinor: 20000, rateHundredths: 189300, meta: 'Request Time: 5 mins ago' },
  { id: 'r3', currency: 'USD', availableMinor: 35000, rateHundredths: 188800, meta: 'User 2231' },
];

/** Cheapest first for a buyer; best price first for a seller. */
export function listingsFor(
  side: 'buy' | 'sell',
  currency: string,
): readonly Listing[] {
  const source = side === 'buy' ? OFFERS : REQUESTS;
  return source
    .filter((l) => l.currency === currency)
    .slice()
    .sort((a, b) =>
      side === 'buy' ? a.rateHundredths - b.rateHundredths : b.rateHundredths - a.rateHundredths,
    );
}
