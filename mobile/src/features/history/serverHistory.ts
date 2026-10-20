/**
 * History and Home activity from my real deals (ADR-045). Amounts come from the server as
 * decimal text and are turned into integer minor units by string arithmetic — never floats.
 */

import type { ServerMatch, ServerOffer } from '../../api/offersApi';
import type { ActivityItem, MarketRate } from '../../fixtures';
import type { HistoryItem, TradeStatus } from './data';
import { tr, k } from "../../i18n";

/** "264100.00" → 26410000 (scale 2). Throws on anything that is not plain decimal text. */
export function toMinor(text: string, scale = 2): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new Error(`not a decimal amount: ${text}`);
  const frac = (m[2] ?? '').padEnd(scale, '0');
  if (frac.length > scale) throw new Error(`too many decimals: ${text}`);
  const n = Number(`${m[1]}${frac}`);
  if (!Number.isSafeInteger(n)) throw new Error(`amount too large: ${text}`);
  return n;
}

const DONE = new Set(['COMPLETED']);
const FAILED = new Set(['CANCELLED', 'CLOSED_UNWOUND', 'CLOSED_WITH_LOSS', 'CLOSED_RECOVERED']);

export function dealStatus(m: Pick<ServerMatch, 'settlement_phase' | 'preparation_state'>): TradeStatus {
  if (m.settlement_phase && DONE.has(m.settlement_phase)) return 'completed';
  if ((m.settlement_phase && FAILED.has(m.settlement_phase)) || m.preparation_state === 'expired') return 'failed';
  return 'pending';
}

/** One deal as a History row: the foreign currency side, the naira rate, today's state. */
export function dealToHistory(m: ServerMatch): HistoryItem | null {
  if (!m.counter_amount) return null;
  const foreignIsMatch = m.currency !== 'NGN';
  const currency = foreignIsMatch ? m.currency : m.counter_currency;
  const foreignText = foreignIsMatch ? m.allocated_amount : m.counter_amount;
  try {
    return {
      id: m.match_id,
      // "Bought" when I receive the foreign currency.
      side: (m.you_receive_currency ?? '') === 'NGN' ? 'sell' : 'buy',
      currency,
      amountMinor: toMinor(foreignText),
      rateHundredths: toMinor(m.agreed_rate),
      date: m.accepted_at.slice(0, 10),
      status: dealStatus(m),
      reference: m.match_id.slice(0, 8).toUpperCase(),
      payouts: [],
      progress: [],
    };
  } catch {
    return null; // malformed row: skipped rather than shown wrong
  }
}

export function dealsToHistory(ms: readonly ServerMatch[]): HistoryItem[] {
  return ms.flatMap((m) => {
    const h = dealToHistory(m);
    return h ? [h] : [];
  });
}

const TONE = { completed: 'success', pending: 'warning', failed: 'error' } as const;
const LABEL = { completed: k("Completed"), pending: k("In progress"), failed: k("Not completed") } as const;

/** The three newest deals for Home (amounts in what I receive). */
export function dealsToActivity(ms: readonly ServerMatch[]): ActivityItem[] {
  return ms.slice(0, 3).flatMap((m): ActivityItem[] => {
    const status = dealStatus(m);
    const receive = m.you_receive_currency;
    const amount = m.you_receive_amount;
    if (!receive || !amount) return [];
    const pay = receive === m.currency ? m.counter_currency : m.currency;
    try {
      return [
        {
          id: m.match_id,
          kind: status === 'pending' ? 'allocation' : 'settlement',
          title: `${pay} → ${receive}`,
          pair: `${pay} / ${receive}`,
          amountMinor: toMinor(amount),
          currency: receive,
          scale: 2,
          status: tr(LABEL[status]),
          statusTone: TONE[status],
          when: m.accepted_at.slice(0, 10).split('-').reverse().join('/'),
          nextAction:
            m.preparation_state === 'awaiting_payout_accounts' && !m.you_chose_payout_accounts
              ? tr("Add your payout account")
              : undefined,
          timeCritical: m.preparation_state === 'awaiting_payout_accounts' && !m.you_chose_payout_accounts,
        },
      ];
    } catch {
      return [];
    }
  });
}

/**
 * Best price to buy each foreign currency right now: the lowest naira rate among open
 * offers that sell it. Prices only — nobody's money.
 */
export function bestRates(offers: readonly ServerOffer[], currencies: readonly string[]): MarketRate[] {
  return currencies.flatMap((c): MarketRate[] => {
    const rates = offers
      .filter((o) => o.source_currency === c && o.target_currency === 'NGN' && !o.is_own)
      .map((o) => o.desired_rate);
    if (rates.length === 0) return [];
    const best = rates.reduce((a, b) => (toMinor(b) < toMinor(a) ? b : a));
    return [{ id: `ngn-${c.toLowerCase()}`, base: 'NGN', quote: c, rate: best }];
  });
}
