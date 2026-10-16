/**
 * Rate display helpers.
 *
 * Rates arrive as decimal strings and stay strings: grouping digits is done on the text,
 * so no value ever passes through binary floating point.
 */

import type { MarketRate } from '../../fixtures';

const DECIMAL = /^\d+(\.\d+)?$/;

/** `1603.78` → `1,603.78`. Throws on anything that is not a plain non-negative decimal. */
export function groupDigits(value: string): string {
  if (!DECIMAL.test(value)) {
    throw new Error(`Not a decimal string: ${value}`);
  }
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/**
 * Always states both currencies, `1 USD = 1,603.78 NGN`, so a rate can never be read as
 * an amount the user holds (`docs/09-ui-ux/UI_UX_SCREEN_SPEC.md`, Home, DEC-008).
 */
export function formatRate(rate: MarketRate): string {
  return `1 ${rate.quote} = ${groupDigits(rate.rate)} ${rate.base}`;
}

/** `NGN → USD` */
export function pairLabel(rate: MarketRate): string {
  return `${rate.base} → ${rate.quote}`;
}
