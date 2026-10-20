/**
 * MOCK DATA for History (ADR-006). Shapes follow the Figma History list (342:6121) and
 * receipt (344:6152); figures are corrected so they add up, the fee is the coordination
 * fee (1% of what each side sends, ADR-021; Figma's receipt also shows 1%), and
 * payout accounts carry only their last four digits — full account numbers are never
 * held or shown in the app.
 *
 * Amounts are integer minor units; rates are integer hundredths of NGN per 1 unit.
 */

import { divRoundHalfEven } from '../market/money';
import { k } from "../../i18n";

export type TradeSide = 'buy' | 'sell';
export type TradeStatus = 'completed' | 'pending' | 'failed';

export interface PayoutAccount {
  readonly name: string;
  readonly bank: string;
  /** Last four digits only. */
  readonly last4: string;
  /** Minor units of the currency paid out: the foreign currency when buying, NGN when selling. */
  readonly amountMinor: number;
}

export interface ProgressStep {
  readonly label: string;
  /** Display time, already formatted; absent when not reached yet. */
  readonly at?: string;
}

export interface HistoryItem {
  readonly id: string;
  readonly side: TradeSide;
  /** Foreign currency bought or sold. */
  readonly currency: string;
  readonly amountMinor: number;
  readonly rateHundredths: number;
  /** ISO date `YYYY-MM-DD`; compared as a string, never parsed to a float. */
  readonly date: string;
  readonly status: TradeStatus;
  readonly reference: string;
  readonly payouts: readonly PayoutAccount[];
  /** Ordered user-facing stages; reached ones carry a time. */
  readonly progress: readonly ProgressStep[];
  /**
   * Amounts as recorded when the trade was made (FIN-02). A receipt shows these, never a
   * figure recomputed from today's constants. Absent on older mock items only.
   */
  readonly recorded?: {
    /** What the user paid into escrow, minor units of `payCurrency`. */
    readonly transferMinor: number;
    readonly payCurrency: string;
    /** The user's own coordination fee, minor units of `payCurrency`. */
    readonly feeMinor: number;
  };
}

/**
 * Coordination fee: 1% of the money each side sends, charged in that side's currency
 * (product owner, 2026-10-17, `docs/adr/021-percentage-fee-and-split-payouts.md`;
 * supersedes the flat fee of Business Plan §5). Buyer: 1% of the NGN amount, in NGN.
 * Seller: 1% of the foreign amount, in that currency. Integer basis points, BigInt,
 * rounded half to even. The server computes the authoritative fee.
 */
export const COORDINATION_FEE_BPS = 100;

export function coordinationFeeMinor(sentMinor: number): number {
  if (!Number.isSafeInteger(sentMinor) || sentMinor < 0) throw new Error('amount must be a non-negative integer (minor units)');
  return Number(divRoundHalfEven(BigInt(sentMinor) * BigInt(COORDINATION_FEE_BPS), 10000n));
}

/** "1%" for labels, from the basis points (never a float). */
export const COORDINATION_FEE_LABEL = `${COORDINATION_FEE_BPS / 100}%`;

/**
 * The stages a trade passes through, in user language, mapped onto ADR-001 leg states:
 * match → ESCROW_PROVISIONED → FUNDED (each leg) → payout accounts → RELEASE_SENT → PAID_OUT.
 */
export const STAGES = [
  k("You accepted the offer"),
  k("Partner bank opened escrow"),
  k("You funded escrow"),
  k("Counterparty funded escrow"),
  k("Payout accounts added"),
  k("Bank released the funds"),
  k("Paid out"),
] as const;

function steps(reached: number, times: readonly string[]): readonly ProgressStep[] {
  return STAGES.map((label, i) => (i < reached ? { label, at: times[i] ?? times[times.length - 1] } : { label }));
}

const DONE = ['12:09 PM', '12:10 PM', '12:21 PM', '12:34 PM', '12:36 PM', '12:41 PM', '12:44 PM'];

export const HISTORY: readonly HistoryItem[] = [
  {
    id: 'h1', side: 'buy', currency: 'USD', amountMinor: 50000, rateHundredths: 125700,
    date: '2025-05-12', status: 'completed', reference: '27Y3UNDUEU',
    payouts: [
      { name: 'Peter Alabi Seun', bank: 'Capital One Bank', last4: '9633', amountMinor: 23000 },
      { name: 'Morayo Afolabi', bank: 'Wells Fargo Bank', last4: '9633', amountMinor: 27000 },
    ],
    progress: steps(7, DONE),
  },
  {
    id: 'h2', side: 'buy', currency: 'CAD', amountMinor: 50000, rateHundredths: 92000,
    date: '2025-05-12', status: 'pending', reference: '27Y3UNDQ8K',
    payouts: [],
    progress: steps(4, DONE),
  },
  {
    id: 'h3', side: 'sell', currency: 'USD', amountMinor: 50000, rateHundredths: 125700,
    date: '2025-05-10', status: 'completed', reference: '27Y3UNC2LP',
    payouts: [{ name: 'David Peters', bank: 'Access Bank', last4: '4417', amountMinor: 62850000 }],
    progress: steps(7, DONE),
  },
  {
    id: 'h4', side: 'buy', currency: 'CAD', amountMinor: 50000, rateHundredths: 92000,
    date: '2025-05-08', status: 'failed', reference: '27Y3UNB7RT',
    payouts: [],
    progress: steps(2, DONE),
  },
  {
    id: 'h5', side: 'buy', currency: 'USD', amountMinor: 50000, rateHundredths: 125700,
    date: '2025-05-03', status: 'completed', reference: '27Y3UNA1ZX',
    payouts: [{ name: 'Peter Alabi Seun', bank: 'Capital One Bank', last4: '9633', amountMinor: 50000 }],
    progress: steps(7, DONE),
  },
  {
    id: 'h6', side: 'buy', currency: 'EUR', amountMinor: 30000, rateHundredths: 176500,
    date: '2025-04-28', status: 'completed', reference: '27Y3UMZ9QE',
    payouts: [{ name: 'Peter Alabi Seun', bank: 'Deutsche Bank', last4: '2210', amountMinor: 30000 }],
    progress: steps(7, DONE),
  },
];

/** `2025-05-12` → `12/05/2025` (Figma's day/month/year). */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * `12/05/2025` → `2025-05-12`, or null if it is not a real calendar date. Used by the
 * date-range filter; validated without floating point.
 */
export function parseDisplayDate(input: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > days) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Newest first, optionally within an inclusive ISO date range. */
export function filterHistory(
  items: readonly HistoryItem[],
  from: string | null,
  to: string | null,
): readonly HistoryItem[] {
  return items
    .filter((i) => (from === null || i.date >= from) && (to === null || i.date <= to))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
