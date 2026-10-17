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
 * DEMO: the official-rate source, update cadence, staleness and "unavailable" behaviour
 * are OPEN decisions. The values below are labelled demo values (the top of each Figma
 * market band), not real official rates. With no value for a currency, no rate is
 * accepted (fail closed).
 */

/** NGN per 1 unit, ×100. DEMO values: not real official rates. */
export const OFFICIAL_RATE_DEMO: Readonly<Record<string, number>> = {
  USD: 189999,
  CAD: 121500,
  EUR: 181000,
  AUD: 109900,
};

export function officialRateFor(currency: string): number | null {
  const v = OFFICIAL_RATE_DEMO[currency];
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
