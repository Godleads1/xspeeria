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

const DECIMAL = /^\d+(\.\d{0,2})?$/;

/** Strips grouping commas and spaces a user might type. */
function clean(input: string): string {
  return input.replace(/[,\s]/g, '');
}

/**
 * `"799"` → `79900`, `"1,644.5"` → `164450`. Returns null for empty, malformed, more than
 * two decimals, or values that are not positive safe integers in minor units.
 */
export function parseToHundredths(input: string): number | null {
  const value = clean(input);
  if (!DECIMAL.test(value)) return null;
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
 * Amount to pay in the quote currency's minor units:
 * `amountMinor` (e.g. US cents) × `rateHundredths` (NGN per 1 unit, ×100) ÷ 100,
 * rounded half-up. Exact integer arithmetic via BigInt.
 */
export function quoteMinor(amountMinor: number, rateHundredths: number): number {
  const product = BigInt(amountMinor) * BigInt(rateHundredths);
  const rounded = (product + 50n) / 100n;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('Amount to pay is out of range');
  return result;
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
