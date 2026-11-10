
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
 * with no official rate here (AUD) accepts no rate at all (fail closed).
 *
 * CAD (ADR-101, owner 2026-11-09): no reliable CBN figure, so the ceiling is the USD one ÷
 * the Bank of Canada USD/CAD rate (1.4113 on 6 Nov 2026), half to even: 1,333.26 ÷ 1.4113 =
 * 944.70. The server derives the same figure; the app shows it with its own wording.
 */

/** NGN per 1 unit, ×1000 (3 decimals). CBN official rate snapshot (see above). */
export const OFFICIAL_RATE: Readonly<Record<string, number>> = {
  USD: 1333260,
  GBP: 1765110,
  EUR: 1491200,
  CAD: 944700, // derived, ADR-101
};

/** Currencies whose ceiling is derived, not published by the CBN (ADR-101). */
export const DERIVED_CEILING: ReadonlySet<string> = new Set([
  'CAD', 'CNY',
  // ADR-107: the USD limit ÷ units per dollar (KRA rates), XOF from the euro's fixed rate.
  'EGP', 'ZAR', 'MAD', 'ETB', 'KES', 'XOF', 'GHS', 'UGX', 'ZMW', 'TZS',
]);

/** Date of the snapshot, shown beside the rate. */
export const OFFICIAL_RATE_AS_OF = '17 Oct 2026';

/** NGN per 1 unit, ×1000, per currency: what the server says is in force (ADR-102). */
export type Ceilings = Readonly<Record<string, number>>;

/**
 * Server builds pass the server's current ceilings (`live`, from the automatic CBN feed);
 * demo builds and the moment before they load use the snapshot above. A currency the server
 * leaves out has no ceiling right now (its rate is over 3 days old), so no rate is accepted.
 */
export function officialRateFor(currency: string, live?: Ceilings | null): number | null {
  const v = (live ?? OFFICIAL_RATE)[currency];
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

/**
 * The server's ceilings in thousandths. The server sends at most 3 decimals; a figure with
 * more is rounded DOWN, so the app never allows a rate above the server's limit.
 */
export function ceilingsFromServer(items: readonly { currency: string; max_rate: string }[]): Ceilings {
  const out: Record<string, number> = {};
  for (const { currency, max_rate } of items) {
    const m = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(max_rate);
    if (!m) continue;
    out[currency] = Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0').slice(0, 3));
  }
  return out;
}

export type RateProblem = 'not-positive' | 'above-official' | 'official-unavailable';

/** Positivity first, then the ceiling (API contract §3.3: the two are disjoint). */
export function rateProblem(currency: string, rateMilli: number, live?: Ceilings | null): RateProblem | null {
  if (!Number.isSafeInteger(rateMilli) || rateMilli <= 0) return 'not-positive';
  const ceiling = officialRateFor(currency, live);
  if (ceiling === null) return 'official-unavailable';
  return rateMilli > ceiling ? 'above-official' : null;
}
