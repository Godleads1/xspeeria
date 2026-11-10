/**
 * Exact money helpers for every currency (ADR-107 part 3, step 1).
 *
 * The first Market code worked in hundredths: rates to 2 decimals and amounts in cents. The
 * African currencies need more: a Ugandan shilling is worth about ₦0.307, so rates go to
 * **6 decimals** (owner, 2026-11-10: "Allow up to 6 decimals"), and the Ugandan shilling
 * and the CFA franc have **no cents**, so their amounts are whole numbers.
 *
 * Everything here is strings and integers: rates in millionths ("micros"), amounts in each
 * currency's own minor units. Products use BigInt and round half to even, the server's rule
 * (ADR-002 §4.4). Nothing passes through binary floating point. The server checks every
 * value again; these helpers are for display and form feedback.
 */

import { divRoundHalfEven } from './money';

/** Decimal places per currency (ISO 4217), as the server's `offer_rules.SCALE`. */
export const CURRENCY_DECIMALS: Readonly<Record<string, number>> = {
  NGN: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
  CAD: 2,
  CNY: 2,
  EGP: 2,
  ZAR: 2,
  MAD: 2,
  ETB: 2,
  KES: 2,
  XOF: 0,
  GHS: 2,
  UGX: 0,
  ZMW: 2,
  TZS: 2,
};

/** Rates are NGN per 1 unit, to 6 decimals (the server's NUMERIC(12,6)). */
export const RATE_PLACES = 6;
const RATE_UNIT = 1_000_000;
const RATE_MAX_MICROS = 999_999_999_999; // 999,999.999999

export function decimalsOf(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

const pow10 = (n: number): bigint => 10n ** BigInt(n);

/**
 * Plain digits, or digits in correct groups of three ("1,644"), then a point and decimals.
 * A misplaced comma is refused, never guessed (FIN-07: "1,50" might mean 1.50).
 */
function split(input: string, maxDecimals: number): { whole: string; fraction: string } | null {
  const trimmed = input.trim();
  const re = new RegExp(`^(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{0,${maxDecimals}}))?$`);
  const m = re.exec(trimmed);
  if (!m) return null;
  const [whole] = trimmed.replace(/,/g, '').split('.');
  return { whole: whole ?? '', fraction: m[1] ?? '' };
}

/**
 * Typed amount → minor units of `currency` (`"5,000"` UGX → 5000; `"10.5"` KES → 1050).
 * Null when empty, malformed, more decimals than the currency has, zero or not a safe integer.
 */
export function parseAmountMinor(input: string, currency: string): number | null {
  const places = decimalsOf(currency);
  if (places === 0 && input.trim().includes('.')) return null;
  const parts = split(input, places);
  if (!parts) return null;
  const minor = Number(parts.whole) * 10 ** places + Number((parts.fraction || '0').padEnd(places, '0').slice(0, places) || 0);
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  return minor;
}

/** Minor units → grouped text with the currency's own decimals (`5000` UGX → `"5,000"`). */
export function formatMinor(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new Error('formatMinor needs a safe integer');
  const places = decimalsOf(currency);
  const negative = minor < 0;
  const abs = BigInt(Math.abs(minor));
  const unit = pow10(places);
  const whole = String(abs / unit).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = places > 0 ? `.${String(abs % unit).padStart(places, '0')}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

/** Minor units → the plain decimal text the server takes (`1050` KES → `"10.50"`). */
export function minorToText(minor: number, currency: string): string {
  return formatMinor(minor, currency).replace(/,/g, '');
}

/** Typed rate → millionths (`"0.3069"` → 306900; `"1,320.5"` → 1320500000). */
export function parseRateMicros(input: string): number | null {
  const parts = split(input, RATE_PLACES);
  if (!parts) return null;
  const micros = Number(parts.whole) * RATE_UNIT + Number((parts.fraction || '').padEnd(RATE_PLACES, '0') || 0);
  if (!Number.isSafeInteger(micros) || micros <= 0 || micros > RATE_MAX_MICROS) return null;
  return micros;
}

/** The server's rate text (up to 6 decimals) → millionths, or null. */
export function rateTextToMicros(text: string): number | null {
  const m = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * RATE_UNIT + Number((m[2] ?? '').padEnd(RATE_PLACES, '0'));
}

/**
 * Millionths → display text: grouped, at least 2 decimals, at most 6, trailing zeros beyond
 * the second dropped (`1320500000` → `"1,320.50"`, `306904` → `"0.306904"`).
 */
export function formatRateMicros(micros: number): string {
  if (!Number.isSafeInteger(micros) || micros < 0) throw new Error('formatRateMicros needs a non-negative safe integer');
  const whole = String(Math.trunc(micros / RATE_UNIT)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let fraction = String(micros % RATE_UNIT).padStart(RATE_PLACES, '0');
  while (fraction.length > 2 && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return `${whole}.${fraction}`;
}

/** Millionths → the plain text the server takes (`306904` → `"0.306904"`). */
export function rateMicrosToText(micros: number): string {
  return formatRateMicros(micros).replace(/,/g, '');
}

function toSafe(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error('Amount is out of range');
  return n;
}

/**
 * Naira for an amount of a foreign currency at a rate (NGN per 1 unit), in kobo, half to
 * even: `amountMinor` / 10^d × `rateMicros` / 10^6 × 100.
 */
export function nairaFor(amountMinor: number, currency: string, rateMicros: number): number {
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(rateMicros) || amountMinor < 0 || rateMicros < 0) {
    throw new Error('nairaFor needs non-negative safe integers');
  }
  const numerator = BigInt(amountMinor) * BigInt(rateMicros) * 100n;
  return toSafe(divRoundHalfEven(numerator, pow10(decimalsOf(currency) + RATE_PLACES)));
}

/**
 * Foreign currency for an amount of naira at a rate, in the currency's minor units, half to
 * even: `nairaKobo` / 100 ÷ (`rateMicros` / 10^6) × 10^d. Null for a zero rate.
 */
export function foreignFor(nairaKobo: number, currency: string, rateMicros: number): number | null {
  if (!Number.isSafeInteger(nairaKobo) || !Number.isSafeInteger(rateMicros) || nairaKobo < 0 || rateMicros < 0) {
    throw new Error('foreignFor needs non-negative safe integers');
  }
  if (rateMicros === 0) return null;
  const numerator = BigInt(nairaKobo) * pow10(RATE_PLACES + decimalsOf(currency));
  return toSafe(divRoundHalfEven(numerator, BigInt(rateMicros) * 100n));
}

/** The server's ceilings (`max_rate` text) as millionths; malformed entries are left out. */
export function ceilingsMicrosFromServer(
  items: readonly { currency: string; max_rate: string }[],
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const { currency, max_rate } of items) {
    const v = rateTextToMicros(max_rate);
    if (v !== null && v > 0) out[currency] = v;
  }
  return out;
}

/** The fee on one side (ADR-037: a flat 1%), in that side's minor units, half to even. */
export function onePercent(minor: number): number {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('onePercent needs a non-negative safe integer');
  return toSafe(divRoundHalfEven(BigInt(minor), 100n));
}
