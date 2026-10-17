/**
 * Transaction History (Figma frame 342:6121), ADR-006.
 *
 * Title, ⋮, a start/end date filter, and one row per trade: flag, "You bought 500 USD",
 * "Rate - NGN 1,257/USD", date. Tapping a row opens its receipt. Each row carries its own
 * amount; nothing is ever summed into a total. MOCK DATA ONLY.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { CalendarSheet } from '../../components/CalendarSheet';
import { RoundFlag } from '../../components/flags';
import { Screen } from '../../components/primitives';
import { brandWeight, color, space, typography } from '../../theme';
import { ActionSheet, RoundButton } from '../market/controls';
import { formatCompact } from '../market/money';
import {
  HISTORY,
  displayDate,
  filterHistory,
  type HistoryItem,
} from './data';

function CalendarGlyph(): ReactElement {
  const s = { stroke: color.text.disabled, strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round' as const };
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Rect x={3.5} y={5} width={17} height={15} rx={2} {...s} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" {...s} />
    </Svg>
  );
}

/** Figma date field: tapping it opens the calendar sheet. */
function DateField({
  label,
  value,
  onPress,
  testID,
}: {
  label: string;
  value: string | null;
  onPress: () => void;
  testID: string;
}): ReactElement {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${displayDate(value)}. Change` : `${label}. Choose a date`}
      onPress={onPress}
      style={({ pressed }) => [styles.dateField, pressed ? styles.rowPressed : null]}
    >
      <Text style={[styles.dateText, value ? null : styles.datePlaceholder]}>
        {value ? displayDate(value) : label}
      </Text>
      <CalendarGlyph />
    </Pressable>
  );
}

export function HistoryRow({
  item,
  onPress,
}: {
  item: HistoryItem;
  onPress?: (item: HistoryItem) => void;
}): ReactElement {
  const verb = item.side === 'buy' ? 'bought' : 'sold';
  const amount = `${formatCompact(item.amountMinor)} ${item.currency}`;
  const status = item.status === 'completed' ? '' : item.status === 'pending' ? ' · Pending' : ' · Failed';
  return (
    <Pressable
      testID={`history-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`You ${verb} ${amount} at ${formatCompact(item.rateHundredths)} NGN per ${item.currency}, ${displayDate(item.date)}${status}`}
      disabled={!onPress}
      onPress={() => onPress?.(item)}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <RoundFlag code={item.currency} size={26} />
      <View style={styles.rowDivided}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>
          {`You ${verb} `}
          <Text style={styles.rowAmount}>{amount}</Text>
        </Text>
        <Text style={styles.rowRate}>
          {`Rate - NGN ${formatCompact(item.rateHundredths)}/${item.currency}`}
          {status ? <Text style={item.status === 'failed' ? styles.failed : styles.pending}>{status}</Text> : null}
        </Text>
      </View>
      <Text style={styles.rowDate}>{displayDate(item.date)}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Figma History ⋮ menu (product-owner reference, 2026-10-17). "Block card" is omitted:
 * Cards is COMING SOON and no card functionality may be exposed until it ships (ADR-006).
 */
export type HistoryMenuKey = 'support' | 'statement';
const MENU: readonly { key: HistoryMenuKey; label: string }[] = [
  { key: 'support', label: 'Contact support' },
  { key: 'statement', label: 'Download Statement' },
];

export function HistoryScreen({
  items = HISTORY,
  onOpen,
  onMenu,
}: {
  items?: readonly HistoryItem[];
  onOpen?: (item: HistoryItem) => void;
  onMenu?: (key: HistoryMenuKey) => void;
}): ReactElement {
  const [menu, setMenu] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);

  const visible = useMemo(() => filterHistory(items, from, to), [items, from, to]);
  // Open the calendar on the newest trade's month, not today's, so history is one tap away.
  const newest = filterHistory(items, null, null)[0]?.date ?? '2025-01-01';

  return (
    <Screen testID="history-screen">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Transaction History
        </Text>
        <RoundButton icon="more" label="More options" testID="history-more" onPress={() => setMenu(true)} />
      </View>

      <View style={styles.dates}>
        <DateField label="Start date" value={from} onPress={() => setPicking('start')} testID="history-start" />
        <DateField label="End date" value={to} onPress={() => setPicking('end')} testID="history-end" />
      </View>

      {visible.length === 0 ? (
        <Text testID="history-empty" style={styles.empty}>
          {from || to ? 'No transactions in these dates' : 'No transactions yet'}
        </Text>
      ) : (
        <View testID="history-list">
          {visible.map((item) => (
            <HistoryRow key={item.id} item={item} onPress={onOpen} />
          ))}
        </View>
      )}

      <CalendarSheet
        testID="history-calendar"
        visible={picking !== null}
        title={picking === 'end' ? 'End date' : 'Start date'}
        value={picking === 'end' ? to : from}
        initialMonth={(picking === 'end' ? from : to) ?? newest}
        // The end can never be before the start, and the start never after the end.
        min={picking === 'end' ? from : null}
        max={picking === 'start' ? to : null}
        onSelect={(iso) => {
          if (picking === 'end') setTo(iso);
          else setFrom(iso);
          setPicking(null);
        }}
        onClear={() => {
          if (picking === 'end') setTo(null);
          else setFrom(null);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />

      <ActionSheet
        testID="history-menu"
        visible={menu}
        onClose={() => setMenu(false)}
        actions={MENU.map((item) => ({
          ...item,
          onPress: () => {
            setMenu(false);
            if (onMenu) onMenu(item.key);
            else Alert.alert(item.label, `${item.label} is one of the next screens to be built.`);
          },
        }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.xs },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 19, color: color.text.primary },
  dates: { flexDirection: 'row', gap: space.sm },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: color.border.strong,
    borderRadius: 8,
  },
  dateText: { flex: 1, ...typography.body, fontSize: 14, color: color.text.primary },
  datePlaceholder: { color: color.text.disabled },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 },
  // Figma: the divider starts under the text, not under the flag.
  rowDivided: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  rowPressed: { backgroundColor: color.bg.sunken },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, color: color.text.primary },
  rowAmount: { ...brandWeight('700'), color: color.text.primary },
  rowRate: { ...typography.caption, fontSize: 11, color: color.text.primary },
  pending: { color: color.warning.text },
  failed: { color: color.error.text },
  rowDate: { ...typography.caption, fontSize: 11, color: color.text.primary },
  empty: { ...typography.body, color: color.text.secondary, textAlign: 'center', paddingVertical: space.lg },
});
