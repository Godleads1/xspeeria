/**
 * Market search results (ADR-059 Decision 1; Claude Design "Xspeeria Home — Search").
 *
 * - Header: back, and the search box (a currency and/or an amount).
 * - Buy / Sell switch for the currency (Decision 2 will hide the side a user's country may
 *   not see; until then both are offered, as on the Market tab).
 * - Chips showing what is switched on, and "Filters", which opens the sort-and-filter sheet.
 * - Rows: rate, amount, time and a Buy / Sell action; "Success" rows are completed trades
 *   with nothing to take and no names.
 *
 * Nothing here decides a price or an amount: taking an offer opens the Take screen, which
 * reads the offer again from the server.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageFor } from '../../api/client';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState, PrimaryButton } from '../../components/primitives';
import { tr } from '../../i18n';
import { brandWeight, color, numericTextStyle, radius, space, themed, typography } from '../../theme';
import { GhostButton } from '../auth/ui';
import type { Listing } from '../market/data';
import { formatAmount, formatRate } from '../market/money';
import {
  activeChips,
  DEFAULT_SEARCH,
  filterProblem,
  pairFor,
  readQuery,
  shownSearchCurrencies,
  SORTS,
  STATUSES,
  type SearchState,
} from './searchModel';
import type { SearchResult, SearchSource, TradeRow } from './serverSearch';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; result: SearchResult };

export function SearchScreen({
  initial = DEFAULT_SEARCH,
  initialQuery = '',
  openFilters = false,
  source,
  now = () => Date.now(),
  onBack,
  onTake,
  onPostRequest,
  onQueue,
  offered,
}: {
  /** The currencies the server offers now (server builds); see `shownSearchCurrencies`. */
  offered?: ReadonlySet<string> | null;
  /** ADR-059 Decision 4: join or leave the queue of a waiting offer; resolves with a note. */
  onQueue?: (listing: Listing) => Promise<string | null>;
  initial?: SearchState;
  initialQuery?: string;
  openFilters?: boolean;
  source: SearchSource;
  now?: () => number;
  onBack: () => void;
  onTake: (listing: Listing) => void;
  onPostRequest: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<SearchState>(initial);
  const [query, setQuery] = useState(initialQuery);
  const [sheet, setSheet] = useState(openFilters);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  /** Pairs the location rule hides for this user (ADR-059 Decision 2). */
  const [hiddenPairs, setHiddenPairs] = useState<readonly string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const asked = useRef(0);
  // Kept in refs so a new function or list each render never re-runs the search by itself.
  const clock = useRef(now);
  clock.current = now;
  const hiddenRef = useRef(hiddenPairs);
  hiddenRef.current = hiddenPairs;

  const run = useCallback(
    async (s: SearchState) => {
      const id = ++asked.current;
      setLoad({ status: 'loading' });
      try {
        const result = await source.run(s, clock.current());
        if (id !== asked.current) return;
        if (result.kind === 'blocked' && result.reason === 'hidden') {
          // Show the other side instead; this one stays switched off for the currency.
          const pair = pairFor(s);
          setHiddenPairs((h) => (h.includes(pair) ? h : [...h, pair]));
          const other = { ...s, side: s.side === 'buy' ? ('sell' as const) : ('buy' as const) };
          if (!hiddenRef.current.includes(pairFor(other))) {
            setState(other);
            return;
          }
        }
        setLoad({ status: 'ready', result });
      } catch (e) {
        if (id === asked.current) setLoad({ status: 'error', message: messageFor(e) });
      }
    },
    [source],
  );

  useEffect(() => {
    void run(state);
  }, [run, state]);

  const submitQuery = (): void => {
    const read = readQuery(query);
    setState((s) => ({ ...s, ...(read.currency ? { currency: read.currency } : {}), minAmount: read.minAmount ?? s.minAmount }));
  };

  const clearFilters = (): void => {
    setQuery('');
    setState((s) => ({ ...DEFAULT_SEARCH, currency: s.currency, side: s.side }));
  };

  const count = load.status === 'ready' ? load.result.rows.length : null;
  const heading =
    state.status === 'success'
      ? tr('Recent completed {{currency}} trades', { currency: state.currency })
      : count === null
        ? state.side === 'buy'
          ? tr('Offers selling {{currency}}', { currency: state.currency })
          : tr('Requests to buy {{currency}}', { currency: state.currency })
        : state.side === 'buy'
          ? tr('{{count}} offers selling {{currency}}', { count, currency: state.currency })
          : tr('{{count}} requests to buy {{currency}}', { count, currency: state.currency });
  const explain =
    state.status === 'success'
      ? tr('Paid and finished. These can’t be taken. Shown to help you judge today’s rates.')
      : state.side === 'buy'
        ? tr('You pay naira and get {{currency}}.', { currency: state.currency })
        : tr('You send {{currency}} and get naira.', { currency: state.currency });

  return (
    <View testID="search-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.top}>
        <Pressable testID="search-back" accessibilityRole="button" accessibilityLabel={tr('Back')} onPress={onBack} style={styles.round}>
          <Icon name="back" color={color.text.primary} size={20} />
        </Pressable>
        <View style={styles.box}>
          <Icon name="search" color={color.text.secondary} size={18} />
          <TextInput
            testID="search-input"
            accessibilityLabel={tr('Search')}
            value={query}
            onChangeText={(t) => setQuery(t.slice(0, 40))}
            onSubmitEditing={submitQuery}
            returnKeyType="search"
            placeholder={tr('Search USD, GBP, EUR offers')}
            placeholderTextColor={color.text.secondary}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.input}
          />
          {query ? (
            <Pressable testID="search-clear" accessibilityRole="button" accessibilityLabel={tr('Clear')} onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close" color={color.text.secondary} size={18} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.sides} accessibilityRole="tablist">
        {(['buy', 'sell'] as const).map((side) => {
          const on = state.side === side;
          const off = hiddenPairs.includes(pairFor({ ...state, side }));
          return (
            <Pressable
              key={side}
              testID={`search-side-${side}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on, disabled: off }}
              disabled={off}
              onPress={() => setState((s) => ({ ...s, side }))}
              style={[styles.side, on ? styles.sideOn : null]}
            >
              <Text style={[styles.sideText, on ? styles.sideTextOn : null, off ? styles.sideTextOff : null]}>
                {side === 'buy' ? tr('Buy {{currency}}', { currency: state.currency }) : tr('Sell {{currency}}', { currency: state.currency })}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {hiddenPairs.some((p) => p.includes(state.currency)) ? (
        <Text testID="search-hidden-note" style={styles.hiddenNote}>
          {tr('Listings that sell {{currency}} aren’t shown in your country.', {
            currency: hiddenPairs.find((p) => p.includes(state.currency))?.split('/')[0] ?? '',
          })}
        </Text>
      ) : null}

      <View style={styles.head}>
        <Text testID="search-heading" accessibilityRole="header" style={styles.heading}>{heading}</Text>
        <Text style={styles.explain}>{explain}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {activeChips(state).map((label) => (
          <View key={label} style={styles.activeChip}>
            <Text style={styles.activeChipText}>{label}</Text>
          </View>
        ))}
        <Pressable testID="search-filters" accessibilityRole="button" onPress={() => setSheet(true)} style={styles.filterChip}>
          <Icon name="sort" color={color.text.primary} size={16} />
          <Text style={styles.filterChipText}>{tr('Filters')}</Text>
        </Pressable>
      </ScrollView>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.lg }]}>
        {load.status === 'loading' ? <LoadingState label={tr('Searching')} /> : null}
        {load.status === 'error' ? <ErrorState title={load.message} onRetry={() => void run(state)} /> : null}
        {load.status === 'ready' && load.result.kind === 'blocked' && load.result.reason === 'needs_location' ? (
          <View testID="search-needs-location" style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="globe" color={color.brand.primary} size={30} />
            </View>
            <Text style={styles.emptyTitle}>{tr('Turn on location to see deals')}</Text>
            <Text style={styles.emptyText}>
              {tr('Deals shown depend on the country you are in. We use only your country, never your exact location.')}
            </Text>
            <PrimaryButton testID="search-location" label={tr('Turn on location')} onPress={() => void run(state)} />
          </View>
        ) : null}
        {load.status === 'ready' && load.result.kind !== 'blocked' && load.result.rows.length === 0 ? (
          <View testID="search-empty" style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="search" color={color.brand.primary} size={30} />
            </View>
            <Text style={styles.emptyTitle}>{state.status === 'success' ? tr('No completed trades yet') : tr('No offers match')}</Text>
            <Text style={styles.emptyText}>
              {state.status === 'success'
                ? tr('Completed trades from the last 7 days show here.')
                : tr('Try a smaller amount or a wider rate range, or post a buy request so sellers can come to you.')}
            </Text>
            {state.status === 'available' && state.side === 'buy' ? (
              <PrimaryButton testID="search-post-request" label={tr('Post a buy request')} onPress={onPostRequest} />
            ) : null}
            <GhostButton testID="search-clear-filters" label={tr('Clear filters')} onPress={clearFilters} />
          </View>
        ) : null}
        {note ? (
          <Text testID="search-note" accessibilityRole="alert" style={styles.explain}>
            {note}
          </Text>
        ) : null}
        {load.status === 'ready' && load.result.kind === 'offers'
          ? load.result.rows.map((row) => (
              <OfferCard
                key={row.id}
                row={row}
                side={state.side}
                onTake={onTake}
                onQueue={
                  onQueue
                    ? (l) =>
                        void onQueue(l).then((text) => {
                          setNote(text);
                          void run(state);
                        })
                    : undefined
                }
              />
            ))
          : null}
        {load.status === 'ready' && load.result.kind === 'trades' ? load.result.rows.map((row) => <TradeCard key={row.key} row={row} />) : null}
      </ScrollView>

      <FilterSheet
        visible={sheet}
        value={state}
        offered={offered}
        onClose={() => setSheet(false)}
        onApply={(next) => {
          setSheet(false);
          setState(next);
        }}
      />
    </View>
  );
}

function rateText(row: Listing): string {
  return `NGN ${row.rateLabel ?? formatRate(row.rateMilli)} / ${row.currency}`;
}

function OfferCard({
  row,
  side,
  onTake,
  onQueue,
}: {
  row: Listing;
  side: 'buy' | 'sell';
  onTake: (l: Listing) => void;
  onQueue?: (l: Listing) => void;
}): ReactElement {
  const amount = `${formatAmount(row.currency, row.availableMinor)} ${row.currency}`;
  // ADR-059 Decision 4: someone is paying for it; you may wait in its queue.
  const queued = row.waiting !== undefined && !row.waiting.yourTurn;
  return (
    <View testID={`search-row-${row.id}`} style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.rate}>{rateText(row)}</Text>
        {row.best ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{tr('Best rate')}</Text>
          </View>
        ) : queued ? (
          <View style={[styles.tag, styles.tagWaiting]}>
            <Text style={[styles.tagText, styles.tagWaitingText]}>{tr('Waiting for payment')}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text style={styles.amount}>{tr('Up to {{amount}}', { amount })}</Text>
          <Text style={styles.meta}>{row.meta}</Text>
        </View>
        {row.own ? null : queued ? (
          <Pressable
            testID={`search-queue-${row.id}`}
            accessibilityRole="button"
            onPress={() => onQueue?.(row)}
            disabled={!onQueue}
            style={({ pressed }) => [styles.act, styles.actQueue, pressed ? styles.pressed : null]}
          >
            <Text style={[styles.actText, styles.actQueueText]}>{row.waiting?.inQueue ? tr('In queue') : tr('Join queue')}</Text>
          </Pressable>
        ) : (
          <Pressable
            testID={`search-take-${row.id}`}
            accessibilityRole="button"
            accessibilityLabel={side === 'buy' ? tr('Buy {{amount}} at {{rate}}', { amount, rate: rateText(row) }) : tr('Sell {{amount}} at {{rate}}', { amount, rate: rateText(row) })}
            onPress={() => onTake(row)}
            style={({ pressed }) => [styles.act, pressed ? styles.pressed : null]}
          >
            <Text style={styles.actText}>{side === 'buy' ? tr('Buy') : tr('Sell')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function TradeCard({ row }: { row: TradeRow }): ReactElement {
  return (
    <View testID="search-trade" style={[styles.card, styles.tradeCard]}>
      <View style={styles.row}>
        <Text style={styles.rate}>{`NGN ${row.rateLabel} / ${row.currency}`}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{tr('Success')}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.amount}>{`${formatAmount(row.currency, row.amountMinor)} ${row.currency}`}</Text>
        <Text style={styles.meta}>{row.when}</Text>
      </View>
    </View>
  );
}

/** The sort-and-filter sheet. Changes are a draft until "Show results". */
export function FilterSheet({
  visible,
  value,
  onClose,
  onApply,
  offered,
}: {
  visible: boolean;
  value: SearchState;
  offered?: ReadonlySet<string> | null;
  onClose: () => void;
  onApply: (s: SearchState) => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);
  const problem = filterProblem(draft);
  const set = (patch: Partial<SearchState>) => setDraft((d) => ({ ...d, ...patch }));
  const numeric = (t: string) => t.replace(/[^0-9.,]/g, '').slice(0, 16);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable testID="filter-scrim" accessibilityLabel={tr('Close')} style={styles.scrim} onPress={onClose} />
      <View testID="filter-sheet" accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.handle} />
        <View style={styles.row}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>{tr('Sort and filter')}</Text>
          <Pressable testID="filter-reset" accessibilityRole="button" onPress={() => setDraft({ ...DEFAULT_SEARCH, currency: draft.currency, side: draft.side })}>
            <Text style={styles.reset}>{tr('Reset')}</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetContent}>
          <Text style={styles.label}>{tr('SORT BY')}</Text>
          {SORTS.map((o) => {
            const on = draft.sort === o.key;
            return (
              <Pressable key={o.key} testID={`filter-sort-${o.key}`} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => set({ sort: o.key })} style={styles.option}>
                <Text style={styles.optionText}>{tr(o.label)}</Text>
                <View style={[styles.radio, on ? styles.radioOn : null]} />
              </Pressable>
            );
          })}

          <Text style={styles.label}>{tr('STATUS')}</Text>
          <View style={styles.chipRow}>
            {STATUSES.map((o) => (
              <Chip key={o.key} testID={`filter-status-${o.key}`} label={tr(o.label)} on={draft.status === o.key} onPress={() => set({ status: o.key })} />
            ))}
          </View>

          <Text style={styles.label}>{tr('CURRENCY')}</Text>
          <View style={styles.chipRow}>
            {shownSearchCurrencies(offered).map((c) => (
              <Chip key={c} testID={`filter-currency-${c}`} label={c} on={draft.currency === c} onPress={() => set({ currency: c })} />
            ))}
          </View>

          <Text style={styles.label}>{tr('RATE RANGE (NGN PER {{currency}})', { currency: draft.currency })}</Text>
          <View style={styles.pair}>
            <Field testID="filter-min-rate" label={tr('Lowest')} value={draft.minRate} onChange={(t) => set({ minRate: numeric(t) })} />
            <Text style={styles.dash}>–</Text>
            <Field testID="filter-max-rate" label={tr('Highest')} value={draft.maxRate} onChange={(t) => set({ maxRate: numeric(t) })} />
          </View>

          <Text style={styles.label}>{tr('AMOUNT ({{currency}})', { currency: draft.currency })}</Text>
          <View style={styles.pair}>
            <Field testID="filter-min-amount" label={tr('From')} value={draft.minAmount} onChange={(t) => set({ minAmount: numeric(t) })} />
            <Text style={styles.dash}>–</Text>
            <Field testID="filter-max-amount" label={tr('To')} value={draft.maxAmount} onChange={(t) => set({ maxAmount: numeric(t) })} />
          </View>
          {problem ? (
            <Text testID="filter-problem" accessibilityRole="alert" style={styles.problem}>{problem}</Text>
          ) : null}
        </ScrollView>
        <PrimaryButton testID="filter-apply" label={tr('Show results')} disabled={problem !== null} onPress={() => onApply(draft)} />
      </View>
    </Modal>
  );
}

function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }): ReactElement {
  return (
    <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} style={[styles.chip, on ? styles.chipOn : null]}>
      <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChange, testID }: { label: string; value: string; onChange: (t: string) => void; testID: string }): ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={tr('Any')}
        placeholderTextColor={color.text.secondary}
        keyboardType="decimal-pad"
        inputMode="decimal"
        maxLength={16}
        style={styles.fieldInput}
      />
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: color.border.subtle, alignItems: 'center', justifyContent: 'center' },
  box: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: color.brand.primary, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, ...typography.body, color: color.text.primary, paddingVertical: 0 },
  sides: { flexDirection: 'row', marginHorizontal: space.lg, marginTop: space.md, padding: 4, borderRadius: 12, backgroundColor: color.bg.sunken },
  side: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sideOn: { backgroundColor: color.bg.canvas },
  sideText: { ...typography.body, color: color.text.secondary },
  sideTextOn: { ...brandWeight('700'), color: color.brand.primary },
  sideTextOff: { color: color.text.disabled },
  hiddenNote: { ...typography.caption, color: color.text.secondary, paddingHorizontal: space.lg, marginTop: space.xs },
  head: { paddingHorizontal: space.lg, marginTop: space.md, gap: 4 },
  heading: { ...brandWeight('700'), fontSize: 20, lineHeight: 26, color: color.text.primary },
  explain: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  chips: { gap: 8, paddingHorizontal: space.lg, paddingVertical: space.sm, alignItems: 'center' },
  activeChip: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: color.brand.primary, backgroundColor: color.brand.secondarySurface, justifyContent: 'center' },
  activeChipText: { ...typography.chipLabel, fontSize: 13, color: color.brand.primary },
  filterChip: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: color.border.subtle, flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterChipText: { ...typography.caption, fontSize: 13, color: color.text.primary },
  list: { paddingHorizontal: space.lg, gap: 12 },
  card: { borderWidth: 1, borderColor: color.border.subtle, borderRadius: 14.37, padding: 14, gap: 10, backgroundColor: color.bg.canvas },
  tradeCard: { backgroundColor: color.bg.sunken },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  grow: { flex: 1, gap: 2 },
  rate: { ...brandWeight('700'), ...numericTextStyle, fontSize: 18, color: color.text.primary, flexShrink: 1 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: color.success.surface },
  tagText: { ...typography.chipLabel, fontSize: 11, color: color.success.text },
  tagWaiting: { backgroundColor: color.warning.surface },
  tagWaitingText: { color: color.warning.text },
  actQueue: { borderColor: color.border.subtle },
  actQueueText: { color: color.text.primary },
  amount: { ...typography.rowLabel, fontSize: 14, color: color.text.primary },
  meta: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  act: { height: 36, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: color.brand.primary, alignItems: 'center', justifyContent: 'center' },
  actText: { ...typography.rowLabel, fontSize: 13, color: color.brand.primary },
  pressed: { opacity: 0.7 },
  empty: { alignItems: 'center', gap: 12, paddingTop: space.lg },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: color.brand.secondarySurface, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...brandWeight('700'), fontSize: 20, color: color.text.primary, textAlign: 'center' },
  emptyText: { ...typography.body, fontSize: 14, color: color.text.secondary, textAlign: 'center' },
  scrim: { flex: 1, backgroundColor: color.bg.overlay },
  sheet: { backgroundColor: color.bg.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: space.lg, paddingTop: 10, gap: 12, maxHeight: '88%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: color.border.subtle, alignSelf: 'center' },
  sheetTitle: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  reset: { ...typography.rowLabel, fontSize: 14, color: color.brand.primary },
  sheetBody: { flexGrow: 0 },
  sheetContent: { gap: 10, paddingBottom: space.sm },
  label: { ...typography.chipLabel, fontSize: 13, letterSpacing: 0.5, color: color.text.secondary, marginTop: 6 },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.border.subtle },
  optionText: { ...typography.body, color: color.text.primary },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color.border.subtle },
  radioOn: { borderWidth: 6, borderColor: color.brand.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: color.border.subtle, justifyContent: 'center' },
  chipOn: { borderColor: color.brand.primary, backgroundColor: color.brand.primary },
  chipText: { ...typography.caption, fontSize: 13, color: color.text.primary },
  chipTextOn: { ...brandWeight('700'), color: color.text.onFill },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dash: { color: color.text.secondary },
  field: { flex: 1, height: 52, borderWidth: 1, borderColor: color.border.subtle, borderRadius: radius.md, paddingHorizontal: 12, justifyContent: 'center' },
  fieldLabel: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  fieldInput: { ...brandWeight('500'), ...numericTextStyle, fontSize: 15, color: color.text.primary, paddingVertical: 0 },
  problem: { ...typography.caption, color: color.error.text },
}));
