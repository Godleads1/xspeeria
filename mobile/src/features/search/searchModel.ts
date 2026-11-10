/**
 * Market search on Home (ADR-059 Decision 1): what the user is looking for, checked before it
 * is sent. The server checks every value again; this only gives quick, clear messages.
 *
 * Amounts and rates stay decimal text and are compared as whole numbers (BigInt), never
 * floating point.
 */

import type { SearchParams } from '../../api/offersApi';
import { k, tr } from '../../i18n';

/**
 * Currencies with an official rate limit (ADR-020). CAD has one since ADR-101 (owner
 * 2026-11-10: "Show CAD, and CNY when on", replacing the 2026-10-21 "no CAD chip"); the yuan
 * only when the server offers it (ADR-105). See `shownSearchCurrencies`.
 */
export const SEARCH_CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'CNY'] as const;
export type SearchCurrency = (typeof SEARCH_CURRENCIES)[number];
/** Shown only when the server lists them (switched off until then). */
const SWITCHED: ReadonlySet<string> = new Set(['CNY']);

/**
 * The chips to show. `offered`: the currencies with a rate limit on the server now (server
 * builds); without it (demo builds, or before it loads) every built-in one but the switched.
 */
export function shownSearchCurrencies(offered?: ReadonlySet<string> | null): readonly SearchCurrency[] {
  return SEARCH_CURRENCIES.filter((c) => (offered ? offered.has(c) : !SWITCHED.has(c)));
}

/** `buy`: people selling the currency for naira. `sell`: buy requests paying naira. */
export type Side = 'buy' | 'sell';
export type Sort = NonNullable<SearchParams['sort']>;
export type Status = NonNullable<SearchParams['status']>;

export const SORTS: readonly { key: Sort; label: string }[] = [
  { key: 'best_rate', label: k('Best rate') },
  { key: 'newest', label: k('Newest first') },
  { key: 'oldest', label: k('Oldest first') },
  { key: 'largest', label: k('Largest amount') },
  { key: 'smallest', label: k('Smallest amount') },
];

export const STATUSES: readonly { key: Status; label: string }[] = [
  { key: 'available', label: k('Available now') },
  { key: 'success', label: k('Success') },
];

export interface SearchState {
  readonly currency: SearchCurrency;
  readonly side: Side;
  readonly sort: Sort;
  readonly status: Status;
  /** Decimal text as typed; empty means "any". */
  readonly minRate: string;
  readonly maxRate: string;
  readonly minAmount: string;
  readonly maxAmount: string;
}

export const DEFAULT_SEARCH: SearchState = {
  currency: 'USD',
  side: 'buy',
  sort: 'best_rate',
  status: 'available',
  minRate: '',
  maxRate: '',
  minAmount: '',
  maxAmount: '',
};

export function isSearchCurrency(value: unknown): value is SearchCurrency {
  return typeof value === 'string' && (SEARCH_CURRENCIES as readonly string[]).includes(value);
}

const WORDS: Record<string, SearchCurrency> = {
  usd: 'USD', dollar: 'USD', dollars: 'USD', $: 'USD',
  gbp: 'GBP', pound: 'GBP', pounds: 'GBP', '£': 'GBP',
  eur: 'EUR', euro: 'EUR', euros: 'EUR', '€': 'EUR',
  cad: 'CAD', 'c$': 'CAD',
  cny: 'CNY', yuan: 'CNY', rmb: 'CNY', renminbi: 'CNY',
};

/**
 * What the search box means: a currency ("usd", "pounds", "€") and/or an amount ("500",
 * "1,000.50"). The amount becomes "at least this much". Anything else is ignored.
 */
export function readQuery(text: string): { currency?: SearchCurrency; minAmount?: string } {
  const out: { currency?: SearchCurrency; minAmount?: string } = {};
  const spaced = text.slice(0, 60).toLowerCase().replace(/([$£€])/g, ' $1 ');
  for (const word of spaced.split(/\s+/)) {
    if (!word) continue;
    if (WORDS[word] && !out.currency) out.currency = WORDS[word];
    const number = word.replace(/,/g, '');
    if (!out.minAmount && /^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(number) && /[1-9]/.test(number)) {
      out.minAmount = number;
    }
  }
  return out;
}

/** Decimal text → integer with `places` decimals, or null when it is not plain decimal text. */
export function scaled(text: string, places: number): bigint | null {
  const m = new RegExp(`^([0-9]{1,12})(?:\\.([0-9]{1,${places}}))?$`).exec(text.trim().replace(/,/g, ''));
  if (!m) return null;
  return BigInt(m[1]) * 10n ** BigInt(places) + BigInt((m[2] ?? '').padEnd(places, '0'));
}

/** A message for the first thing wrong with the filters, or null when they can be sent. */
export function filterProblem(s: SearchState): string | null {
  // Owner 2026-11-10: "3 decimal not 6" (the server refuses a 4th decimal).
  const rate = (t: string) => (t ? scaled(t, 3) : 0n);
  const amount = (t: string) => (t ? scaled(t, 2) : 0n);
  const lowRate = rate(s.minRate);
  const highRate = rate(s.maxRate);
  if (lowRate === null || highRate === null) return tr('Enter the rate as a number with up to 3 decimal places.');
  if ((s.minRate && lowRate === 0n) || (s.maxRate && highRate === 0n)) return tr('The rate must be more than zero.');
  if (s.minRate && s.maxRate && lowRate > highRate) return tr('The lowest rate can’t be above the highest rate.');
  const low = amount(s.minAmount);
  const high = amount(s.maxAmount);
  if (low === null || high === null) return tr('Enter the amount as a number, e.g. 1000.00.');
  if ((s.minAmount && low === 0n) || (s.maxAmount && high === 0n)) return tr('The amount must be more than zero.');
  if (s.minAmount && s.maxAmount && low > high) return tr('The smallest amount can’t be above the largest amount.');
  return null;
}

/** The server pair: offers selling the currency, or buy requests paying naira for it. */
export function pairFor(s: SearchState): string {
  return s.side === 'buy' ? `${s.currency}/NGN` : `NGN/${s.currency}`;
}

/** What is sent. Commas are removed; empty filters are left out. */
export function toParams(s: SearchState): SearchParams {
  const clean = (t: string) => t.trim().replace(/,/g, '') || undefined;
  return {
    sort: s.sort,
    status: s.status,
    min_rate: clean(s.minRate),
    max_rate: clean(s.maxRate),
    min_amount: clean(s.minAmount),
    max_amount: clean(s.maxAmount),
  };
}

function grouped(text: string): string {
  const [whole, frac] = text.replace(/,/g, '').split('.');
  const g = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? g : `${g}.${frac}`;
}

/** Labels for the chips above the results: what is switched on. */
export function activeChips(s: SearchState): string[] {
  const chips = [tr(SORTS.find((x) => x.key === s.sort)?.label ?? 'Best rate'), s.currency];
  if (s.status === 'success') chips.push(tr('Success'));
  if (s.minRate || s.maxRate) {
    chips.push(
      s.minRate && s.maxRate
        ? tr('NGN {{low}}–{{high}}', { low: grouped(s.minRate), high: grouped(s.maxRate) })
        : s.minRate
          ? tr('From NGN {{low}}', { low: grouped(s.minRate) })
          : tr('Up to NGN {{high}}', { high: grouped(s.maxRate) }),
    );
  }
  if (s.minAmount || s.maxAmount) {
    chips.push(
      s.minAmount && s.maxAmount
        ? `${grouped(s.minAmount)}–${grouped(s.maxAmount)} ${s.currency}`
        : s.minAmount
          ? tr('{{amount}}+ {{currency}}', { amount: grouped(s.minAmount), currency: s.currency })
          : tr('Up to {{amount}} {{currency}}', { amount: grouped(s.maxAmount), currency: s.currency }),
    );
  }
  return chips;
}
