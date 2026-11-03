/**
 * Deal totals at the top of History in server builds (ADR-097; owner 2026-11-03: "Totals in
 * History"). Home stays free of any aggregate currency figure (UI spec, CORRECTIONS_v3 §9.7).
 * Xspeeria has no wallet or ledger: these are sums of **completed deals only**, never a balance. Amounts are integer minor units from decimal text (`toMinor`), never floats.
 */

import type { ServerMatch } from '../../api/offersApi';
import { formatHundredths } from '../market/money';
import { toMinor } from './serverHistory';

export interface CurrencyTotal {
  readonly currency: string;
  /** Minor units (scale 2). */
  readonly minor: number;
}

export interface DealTotals {
  /** How many completed deals were counted. */
  readonly completed: number;
  readonly received: readonly CurrencyTotal[];
  readonly sent: readonly CurrencyTotal[];
}

function add(into: Map<string, number>, currency: string, minor: number): void {
  const next = (into.get(currency) ?? 0) + minor;
  if (!Number.isSafeInteger(next)) throw new Error('total too large');
  into.set(currency, next);
}

const sorted = (m: Map<string, number>): CurrencyTotal[] =>
  [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, minor]) => ({ currency, minor }));

/** Received and sent per currency over completed deals. A malformed row is skipped, not guessed. */
export function dealTotals(deals: readonly ServerMatch[]): DealTotals {
  const received = new Map<string, number>();
  const sent = new Map<string, number>();
  let completed = 0;
  for (const d of deals) {
    if (d.settlement_phase !== 'COMPLETED') continue;
    const inCurrency = d.you_receive_currency;
    const inAmount = d.you_receive_amount;
    if (!inCurrency || !inAmount || !d.counter_amount) continue;
    // What I send is the other side of the pair.
    const [outCurrency, outAmount] =
      inCurrency === d.currency ? [d.counter_currency, d.counter_amount] : [d.currency, d.allocated_amount];
    try {
      const inMinor = toMinor(inAmount);
      const outMinor = toMinor(outAmount);
      add(received, inCurrency, inMinor);
      add(sent, outCurrency, outMinor);
      completed += 1;
    } catch {
      continue;
    }
  }
  return { completed, received: sorted(received), sent: sorted(sent) };
}

/** `"USD 1,200.00"`. */
export function totalText(t: CurrencyTotal): string {
  return `${t.currency} ${formatHundredths(t.minor)}`;
}
