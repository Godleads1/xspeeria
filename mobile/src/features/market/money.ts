/**
 * Market input parsing and arithmetic — strings and integers only.
 *
 * Amounts the user types are parsed straight into integer hundredths of a unit (cents/kobo;
 * for a currency with no cents, such as the CFA franc, always whole units × 100), and rates
 * into integer thousandths of a naira (up to 3 decimals: owner 2026-11-10, "3 decimal not 6"). Nothing passes through binary floating point
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
 * Amount to pay in kobo: `amountMinor` (hundredths of the foreign unit) × `rateMilli`
 * (NGN per 1 unit, ×1000) ÷ 1000, rounded half to even. Exact integer arithmetic via BigInt.
 */
export function quoteMinor(amountMinor: number, rateMilli: number): number {
  // Amounts and rates are always positive; anything else is a caller error.
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(rateMilli) || amountMinor < 0 || rateMilli < 0) {
    throw new Error('quoteMinor needs non-negative safe integers');
  }
  const product = BigInt(amountMinor) * BigInt(rateMilli);
  const rounded = divRoundHalfEven(product, BigInt(RATE_SCALE));
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('Amount to pay is out of range');
  return result;
}

/** quoteMinor, or null when the result would be out of the safe integer range. */
export function quoteMinorOrNull(amountMinor: number, rateMilli: number): number | null {
  try {
    return quoteMinor(amountMinor, rateMilli);
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
  rateMilli: number,
  band: { low: number; high: number },
): number {
  const span = band.high - band.low;
  if (span <= 0) return 0;
  const position = side === 'buy' ? rateMilli - band.low : band.high - rateMilli;
  const pct = Math.floor((position * 100) / span);
  return Math.max(0, Math.min(100, pct));
}

// ---------------------------------------------------------------------------------------
// Rates: NGN per 1 unit, ×1000 (owner 2026-11-10: "3 decimal not 6"; the server refuses a
// 4th decimal and never rounds one).

/** A rate is held in thousandths of a naira. */
export const RATE_SCALE = 1000;

const RATE_TEXT = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,3})?$/;

/**
 * Typed rate → thousandths: `"1,320.5"` → 1320500, `"0.306"` → 306, `"2.273"` → 2273.
 * Null for empty, malformed, misplaced commas, a 4th decimal (refused, never rounded) or not
 * positive. Commas follow the same rule as amounts (FIN-07).
 */
export function parseRate(input: string): number | null {
  const trimmed = input.trim();
  if (!RATE_TEXT.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.replace(/,/g, '').split('.');
  const milli = Number(whole) * RATE_SCALE + Number(fraction.padEnd(3, '0'));
  return Number.isSafeInteger(milli) && milli > 0 ? milli : null;
}

/**
 * Server rate text → thousandths, only when exact: `"1320.50"` → 1320500, `"2.273"` → 2273.
 * A rate with more decimals (one stored before the 3-decimal rule) is null: callers keep its
 * exact text instead of rounding it.
 */
export function exactRate(text: string): number | null {
  return /^[0-9]+(\.[0-9]{1,3})?$/.test(text) ? parseRate(text) : null;
}

/** Thousandths → `"1,320.50"`, `"2.273"`, `"0.306"`: grouped, 2 decimals, a 3rd when it isn't 0. */
export function formatRate(milli: number): string {
  if (!Number.isInteger(milli)) throw new Error('formatRate needs an integer');
  const abs = Math.abs(milli);
  const whole = String(Math.trunc(abs / RATE_SCALE)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let fraction = String(abs % RATE_SCALE).padStart(3, '0');
  if (fraction.endsWith('0')) fraction = fraction.slice(0, 2);
  return `${milli < 0 ? '-' : ''}${whole}.${fraction}`;
}

/** Thousandths → `"1,893"` when whole, else as `formatRate`. For compact rate display. */
export function formatRateCompact(milli: number): string {
  const full = formatRate(milli);
  return full.endsWith('.00') ? full.slice(0, -3) : full;
}

/** Thousandths → the plain text the server takes: `1320500` → `"1320.50"`, `2273` → `"2.273"`. */
export function rateText(milli: number): string {
  return formatRate(milli).replace(/,/g, '');
}

// ---------------------------------------------------------------------------------------
// Amounts per currency. Inside the app every amount is hundredths of a unit; a currency with
// no cents (the CFA franc, the Ugandan shilling: the server's SCALE 0) only ever holds whole
// units, is typed without decimals and is shown and sent without ".00".

/** Currencies with no smaller unit (backend `offer_rules.SCALE`). */
export const WHOLE_UNIT_CURRENCIES: ReadonlySet<string> = new Set(['XOF', 'UGX']);

/** Decimals a currency's amounts have: 0 for whole-unit currencies, else 2. */
export function amountDecimals(currency: string): 0 | 2 {
  return WHOLE_UNIT_CURRENCIES.has(currency) ? 0 : 2;
}

/** Typed amount → hundredths, refusing decimals for a whole-unit currency (`"500.5"` UGX → null). */
export function parseAmount(currency: string, input: string): number | null {
  if (amountDecimals(currency) === 0 && input.includes('.')) return null;
  return parseToHundredths(input);
}

/**
 * Hundredths → `"1,644.00"`, or `"500,000"` for a whole-unit currency. A whole-unit amount
 * that somehow has a fraction is shown with it, never silently cut.
 */
export function formatAmount(currency: string, minor: number): string {
  const full = formatHundredths(minor);
  return amountDecimals(currency) === 0 && minor % 100 === 0 ? full.slice(0, -3) : full;
}

/** Hundredths → the plain text the server takes: `"1644.00"`, or `"500000"` for UGX. */
export function amountText(currency: string, minor: number): string {
  return formatAmount(currency, minor).replace(/,/g, '');
}
