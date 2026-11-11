/**
 * ADR-111: any currency for any other. How a pair is quoted, which rate limit applies, and
 * exact conversions between the two sides — the same rules as the server
 * (`backend/app/domain/offer_rules.py`, `payout_rules.counter_amount_minor`).
 *
 * A rate is always the price of 1 unit of the pair's **base** in its **quote**:
 * - with naira: naira per unit (NGN 1,333.26 per USD), as before;
 * - without naira: the weaker currency per 1 unit of the stronger (`STRENGTH`), such as
 *   GHS 11.604 per USD — whichever side is being sold.
 *
 * Amounts inside the app are hundredths of a unit (whole units × 100 for UGX and XOF). Only
 * integers and BigInt; the server checks every figure again.
 */

import { amountDecimals, divRoundHalfEven, rateText } from './money';

/** Strongest first (backend `STRENGTH`): the earlier currency of a pair is its base. */
export const STRENGTH: readonly string[] = [
  'GBP', 'EUR', 'USD', 'CAD', 'CNY', 'MAD', 'GHS', 'ZAR', 'ZMW', 'EGP', 'KES', 'ETB', 'XOF', 'TZS', 'UGX',
];

export interface Quote {
  readonly base: string;
  readonly quote: string;
}

/** The base and quote of a pair, whichever order its currencies come in. */
export function quoteOf(a: string, b: string): Quote {
  if (a === 'NGN') return { base: b, quote: 'NGN' };
  if (b === 'NGN') return { base: a, quote: 'NGN' };
  const ia = STRENGTH.indexOf(a);
  const ib = STRENGTH.indexOf(b);
  // An unknown currency sorts last; the server refuses it anyway.
  const first = ib === -1 || (ia !== -1 && ia < ib) ? a : b;
  return first === a ? { base: a, quote: b } : { base: b, quote: a };
}

/** The key of a pair's rate limit: "USD" for naira pairs (as before), else "USD/GHS". */
export function ceilingKey(a: string, b: string): string {
  const { base, quote } = quoteOf(a, b);
  return quote === 'NGN' ? base : `${base}/${quote}`;
}

/** Whether a pair has naira on one side. */
export function hasNaira(a: string, b: string): boolean {
  return a === 'NGN' || b === 'NGN';
}

/**
 * `minor` hundredths of `from` in `to`, at `rate` (decimal text, quote per base, read to 6
 * decimals so an older stored rate stays exact). Half to even in `to`'s own unit — whole units
 * for UGX and XOF. Null when the inputs are not exact or the result is out of range.
 */
export function convertMinor(minor: number, from: string, to: string, rate: string): number | null {
  const m = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(rate);
  if (!m || !Number.isSafeInteger(minor) || minor < 0 || from === to) return null;
  const micro = BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
  if (micro <= 0n) return null;
  const fromBase = quoteOf(from, to).base === from;
  const num = BigInt(minor) * (fromBase ? micro : 1_000_000n);
  let den = fromBase ? 1_000_000n : micro;
  const whole = amountDecimals(to) === 0;
  if (whole) den *= 100n;
  const q = divRoundHalfEven(num, den);
  const n = Number(whole ? q * 100n : q);
  return Number.isSafeInteger(n) ? n : null;
}

/** `convertMinor` for a rate held in thousandths. */
export function convertAtMilli(minor: number, from: string, to: string, rateMilli: number): number | null {
  if (!Number.isSafeInteger(rateMilli) || rateMilli <= 0) return null;
  return convertMinor(minor, from, to, rateText(rateMilli));
}
