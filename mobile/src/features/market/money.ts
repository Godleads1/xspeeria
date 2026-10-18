/**
 * Market input parsing and arithmetic — strings and integers only.
 *
 * Amounts the user types are parsed straight into integer minor units (cents/kobo), and
 * rates into integer hundredths. Nothing passes through binary floating point
 * (CLAUDE.md: never use floats for monetary values). BigInt is used where a product could
 * exceed 2^53.
 *
 * Client-side parsing is for display and form feedback only; the server must re-validate
 * every value (frontend restrictions are not security controls).
 */

/**
 * Plain digits, or digits in correct groups of three with commas ("1,644"), then up to two
 * decimals after a point. A comma anywhere else is refused, never guessed: "1,50" might mean
 * 1.50 to a user who writes a decimal comma, and silently reading it as 150 is a 100×
 * error (FIN-07). Digits must be ASCII.
 */
const DECIMAL = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?$/;

/**
 * `"799"` → `79900`, `"1,644.5"` → `164450`. Returns null for empty, malformed, misplaced
 * commas, inner spaces, more than two decimals, or values that are not positive safe
 * integers in minor units. Surrounding spaces are ignored.
 */
export function parseToHundredths(input: string): number | null {
  const trimmed = input.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const value = trimmed.replace(/,/g, '');
  const [whole, fraction = ''] = value.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor <= 0) return null;
  return minor;
}

/** Hundredths → `"1,644.00"` (always two decimals, grouped). */
export function formatHundredths(hundredths: number): string {
  if (!Number.isInteger(hundredths)) throw new Error('formatHundredths needs an integer');
  const negative = hundredths < 0;
  const abs = Math.abs(hundredths);
  const whole = String(Math.trunc(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Hundredths → `"1,893"` when whole, else `"1,893.50"`. For compact rate display. */
export function formatCompact(hundredths: number): string {
  const full = formatHundredths(hundredths);
  return full.endsWith('.00') ? full.slice(0, -3) : full;
}

/**
 * Integer division of a non-negative BigInt, rounding half to even (banker's rounding):
 * the rule the ledger uses (`docs/adr/002-financial-event-ledger-architecture.md` §4.4,
 * product owner decision 2026-10-17, `docs/adr/019-review-decisions-and-multi-offer-fill.md`).
 */
export function divRoundHalfEven(numerator: bigint, divisor: bigint): bigint {
  const q = numerator / divisor;
  const r = numerator % divisor;
  const twice = r * 2n;
  if (twice > divisor || (twice === divisor && q % 2n === 1n)) return q + 1n;
  return q;
}

/**
 * Amount to pay in the quote currency's minor units:
 * `amountMinor` (e.g. US cents) × `rateHundredths` (NGN per 1 unit, ×100) ÷ 100,
 * rounded half to even. Exact integer arithmetic via BigInt.
 */
export function quoteMinor(amountMinor: number, rateHundredths: number): number {
  // Amounts and rates are always positive; anything else is a caller error.
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(rateHundredths) || amountMinor < 0 || rateHundredths < 0) {
    throw new Error('quoteMinor needs non-negative safe integers');
  }
  const product = BigInt(amountMinor) * BigInt(rateHundredths);
  const rounded = divRoundHalfEven(product, 100n);
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('Amount to pay is out of range');
  return result;
}

/** quoteMinor, or null when the result would be out of the safe integer range. */
export function quoteMinorOrNull(amountMinor: number, rateHundredths: number): number | null {
  try {
    return quoteMinor(amountMinor, rateHundredths);
  } catch {
    return null;
  }
}

/**
 * Strict parse of a positive integer from untrusted text (route params): ASCII digits
 * only, no sign, exponent, hex, spaces or leading zero. Returns null otherwise.
 */
export function parsePositiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Mock "match potential": where a proposed rate sits inside the current market band, as a
 * whole percentage 0–100. A higher buy rate (or lower sell rate) matches more offers.
 * Integer arithmetic only. This is a display heuristic on mock data, not a promise.
 */
export function matchPotential(
  side: 'buy' | 'sell',
  rateHundredths: number,
  band: { low: number; high: number },
): number {
  const span = band.high - band.low;
  if (span <= 0) return 0;
  const position = side === 'buy' ? rateHundredths - band.low : band.high - rateHundredths;
  const pct = Math.floor((position * 100) / span);
  return Math.max(0, Math.min(100, pct));
}
