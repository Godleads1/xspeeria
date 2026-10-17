/**
 * Calendar sheet for date fields (History start/end, ADR-006).
 *
 * A bottom sheet in the same style as the app's other sheets: month and year header with
 * previous/next controls, a Monday-first week grid, and the chosen day filled in brand
 * navy. Days outside `min`/`max` are disabled. Pure JS — no native date-picker module, so
 * it works in Expo Go and every build without a rebuild.
 *
 * Dates travel as ISO `YYYY-MM-DD` strings; Date is used only to find weekdays.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Icon } from './icons';
import { brandWeight, color, typography, themed } from '../theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad = (n: number): string => String(n).padStart(2, '0');
export const toIso = (y: number, m: number, d: number): string => `${y}-${pad(m + 1)}-${pad(d)}`;

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** Monday-first index (0–6) of the first day of the month. */
function firstWeekday(y: number, m: number): number {
  return (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
}

function parseIso(iso: string): { y: number; m: number } {
  const [y, m] = iso.split('-').map(Number);
  return { y, m: m - 1 };
}

export function CalendarSheet({
  visible,
  title,
  value,
  initialMonth,
  min,
  max,
  onSelect,
  onClear,
  onClose,
  testID = 'calendar',
}: {
  visible: boolean;
  title: string;
  /** Selected ISO date, if any. */
  value: string | null;
  /** ISO date whose month opens first when nothing is selected. */
  initialMonth: string;
  min?: string | null;
  max?: string | null;
  onSelect: (iso: string) => void;
  onClear: () => void;
  onClose: () => void;
  testID?: string;
}): ReactElement {
  const start = parseIso(value ?? initialMonth);
  const [year, setYear] = useState(start.y);
  const [month, setMonth] = useState(start.m);

  // Re-centre on the selection each time the sheet opens.
  useEffect(() => {
    if (visible) {
      const s = parseIso(value ?? initialMonth);
      setYear(s.y);
      setMonth(s.m);
    }
  }, [visible, value, initialMonth]);

  const step = (delta: number): void => {
    const total = year * 12 + month + delta;
    setYear(Math.floor(total / 12));
    setMonth(((total % 12) + 12) % 12);
  };

  const lead = firstWeekday(year, month);
  const count = daysIn(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close calendar" />
      <View testID={testID} style={styles.sheet}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.header}>
            <Pressable testID={`${testID}-prev-year`} accessibilityRole="button" accessibilityLabel="Previous year" onPress={() => step(-12)} hitSlop={8} style={styles.nav}>
              <Text style={styles.navText}>«</Text>
            </Pressable>
            <Pressable testID={`${testID}-prev`} accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => step(-1)} hitSlop={8} style={styles.nav}>
              <Icon name="back" color={color.text.primary} size={18} />
            </Pressable>
            <Text testID={`${testID}-month`} accessibilityRole="header" style={styles.month}>
              {`${MONTHS[month]} ${year}`}
            </Text>
            <Pressable testID={`${testID}-next`} accessibilityRole="button" accessibilityLabel="Next month" onPress={() => step(1)} hitSlop={8} style={[styles.nav, styles.flip]}>
              <Icon name="back" color={color.text.primary} size={18} />
            </Pressable>
            <Pressable testID={`${testID}-next-year`} accessibilityRole="button" accessibilityLabel="Next year" onPress={() => step(12)} hitSlop={8} style={styles.nav}>
              <Text style={styles.navText}>»</Text>
            </Pressable>
          </View>

          <View style={styles.week}>
            {WEEKDAYS.map((d) => (
              <Text key={d} style={styles.weekday}>{d}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`e${i}`} style={styles.cell} />;
              const iso = toIso(year, month, day);
              const disabled = (min != null && iso < min) || (max != null && iso > max);
              const selected = iso === value;
              return (
                <Pressable
                  key={iso}
                  testID={`${testID}-day-${iso}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${day} ${MONTHS[month]} ${year}`}
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => onSelect(iso)}
                  style={styles.cell}
                >
                  <View style={[styles.day, selected ? styles.daySelected : null]}>
                    <Text style={[styles.dayText, selected ? styles.dayTextSelected : null, disabled ? styles.dayDisabled : null]}>
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {value ? (
            <Pressable testID={`${testID}-clear`} accessibilityRole="button" onPress={onClear} style={styles.clear}>
              <Text style={styles.clearText}>Clear date</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable testID={`${testID}-cancel`} accessibilityRole="button" onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  scrim: { flex: 1, backgroundColor: color.bg.overlay },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 16, padding: 10, gap: 8 },
  card: { backgroundColor: color.bg.canvas, borderRadius: 16, padding: 16, gap: 10 },
  title: { ...typography.body, color: color.text.secondary, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ rotate: '180deg' }] },
  navText: { ...typography.body, fontSize: 20, color: color.text.primary },
  month: { ...typography.body, ...brandWeight('700'), fontSize: 17, color: color.text.primary },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', ...typography.caption, color: color.text.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: color.brand.fill },
  dayText: { ...typography.body, color: color.text.primary },
  dayTextSelected: { ...brandWeight('700'), color: color.text.onFill },
  dayDisabled: { color: color.text.disabled },
  clear: { alignSelf: 'center', paddingVertical: 6 },
  clearText: { ...typography.body, ...brandWeight('500'), color: color.brand.primary },
  cancel: { backgroundColor: color.bg.canvas, borderRadius: 16, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...typography.body, fontSize: 17, color: color.error.text },
}));
