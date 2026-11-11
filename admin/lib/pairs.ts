/**
 * ADR-111: how a deal's rate reads — the price of 1 unit of the pair's base in its quote.
 * Naira pairs: naira per unit. Others: the weaker currency per 1 unit of the stronger, the
 * same order as the server (`backend/app/domain/offer_rules.STRENGTH`).
 */

const STRENGTH: readonly string[] = [
  'GBP', 'EUR', 'USD', 'CAD', 'CNY', 'MAD', 'GHS', 'ZAR', 'ZMW', 'EGP', 'KES', 'ETB', 'XOF', 'TZS', 'UGX',
];

export function quoteOf(a: string, b: string): { base: string; quote: string } {
  if (a === 'NGN') return { base: b, quote: 'NGN' };
  if (b === 'NGN') return { base: a, quote: 'NGN' };
  const ia = STRENGTH.indexOf(a);
  const ib = STRENGTH.indexOf(b);
  const aFirst = ib === -1 || (ia !== -1 && ia < ib);
  return aFirst ? { base: a, quote: b } : { base: b, quote: a };
}
