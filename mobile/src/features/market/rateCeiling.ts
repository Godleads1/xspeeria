
/**
 * Rate ceiling: the official rate is the maximum (product owner, 2026-10-17; Standing
 * Standards §7.2; API contract §3.3; `docs/adr/020-official-rate-ceiling.md`).
 *
 * A rate is valid only when `0 < rate ≤ official rate` for that currency. Above the
 * official rate is a hard block; there is no minimum (no floor, no band). Checked when the
 * user types a rate, when a deep link carries one, when listings are shown (listings above
 * the ceiling are not eligible to be accepted), and again when a trade is created. The
 * server repeats every check; the app's answer is never trusted.
 *
 * SNAPSHOT: Central Bank of Nigeria official rates as reported by Monierate
 * (monierate.com/fx/official) on 17 Oct 2026; for each currency the higher of the two CBN
 * figures shown. Cross-checked against CBN figures for 15 Oct reported by Arbiterz
 * (USD 1,332.75, GBP 1,764.26, EUR 1,490.48). Official rates move daily: a live feed, its
 * cadence, staleness and "unavailable" behaviour are still OPEN (ADR-020 §3). A currency
 * with no official rate here (CAD, AUD) accepts no rate at all (fail closed).
 */

/** NGN per 1 unit, ×100. CBN official rate snapshot (see above). */
export const OFFICIAL_RATE: Readonly<Record<string, number>> = {
  USD: 133326,
  GBP: 176511,
  EUR: 149120,
};

/** Date of the snapshot, shown beside the rate. */
export const OFFICIAL_RATE_AS_OF = '17 Oct 2026';

export function officialRateFor(currency: string): number | null {
  const v = OFFICIAL_RATE[currency];
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

export type RateProblem = 'not-positive' | 'above-official' | 'official-unavailable';

/** Positivity first, then the ceiling (API contract §3.3: the two are disjoint). */
export function rateProblem(currency: string, rateHundredths: number): RateProblem | null {
  if (!Number.isSafeInteger(rateHundredths) || rateHundredths <= 0) return 'not-positive';
  const ceiling = officialRateFor(currency);
  if (ceiling === null) return 'official-unavailable';
  return rateHundredths > ceiling ? 'above-official' : null;
}
