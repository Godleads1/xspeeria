/**
 * Formatting dashboard figures. Money arrives as integer minor units in text (never a float)
 * and is formatted with BigInt, so large naira totals stay exact.
 */

import type { MoneyFigure } from './api';
import { tr } from './i18n';

const SYMBOL: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "26410000", scale 2, NGN → "₦264,100.00". */
export function money(m: Pick<MoneyFigure, 'currency' | 'scale' | 'minor'>): string {
  if (!/^-?\d+$/.test(m.minor)) throw new Error('money needs integer minor units');
  let n = BigInt(m.minor);
  const negative = n < 0n;
  if (negative) n = -n;
  const div = 10n ** BigInt(m.scale);
  const whole = group((n / div).toString());
  const frac = m.scale > 0 ? `.${(n % div).toString().padStart(m.scale, '0')}` : '';
  const symbol = SYMBOL[m.currency];
  const body = symbol ? `${symbol}${whole}${frac}` : `${whole}${frac} ${m.currency}`;
  return negative ? `-${body}` : body;
}

export function count(n: number): string {
  return group(String(n));
}

/**
 * Change against the period before, to one decimal, from whole numbers. `null` when there is
 * nothing to compare with (the period before was zero).
 */
export function change(value: number, previous: number): { pct: string; up: boolean } | null {
  if (previous === 0) return null;
  const tenths = Math.round(((value - previous) * 1000) / previous);
  const abs = Math.abs(tenths);
  return { pct: `${Math.trunc(abs / 10)}.${abs % 10}%`, up: tenths >= 0 };
}

/** Same as `change`, for money in minor units (BigInt, exact). */
export function moneyChange(m: MoneyFigure): { pct: string; up: boolean } | null {
  const prev = BigInt(m.previous_minor ?? '0');
  if (prev === 0n) return null;
  const tenths = ((BigInt(m.minor) - prev) * 1000n) / prev;
  const abs = tenths < 0n ? -tenths : tenths;
  return { pct: `${abs / 10n}.${abs % 10n}%`, up: tenths >= 0n };
}

/** Whole-number percent with one decimal, e.g. part 979 of 1000 → "97.9%". */
export function share(part: number, whole: number): string | null {
  if (whole === 0) return null;
  const tenths = Math.round((part * 1000) / whole);
  return `${Math.trunc(tenths / 10)}.${tenths % 10}%`;
}

/** Seconds as "45 s", "2.3 min", "5.4 h" or "3.7 days". */
export function duration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const n = (v: number) => String(Math.round(v * 10) / 10);
  if (seconds < 60) return tr('{{n}} s', { n: seconds });
  if (seconds < 3600) return tr('{{n}} min', { n: n(seconds / 60) });
  if (seconds < 86400) return tr('{{n}} h', { n: n(seconds / 3600) });
  return tr('{{n}} days', { n: n(seconds / 86400) });
}
