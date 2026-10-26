/**
 * New buy request in several currencies (ADR-059 Decision 5; Claude Design "Request in several
 * currencies"). The user pays one naira amount and accepts any one of 2–5 currencies, each at
 * its own rate. Whole amount only: one person takes the whole request in one currency, and
 * the others are hidden while that deal is paid (removed if it completes).
 *
 * Only currencies with an official rate can be chosen (USD, GBP, EUR today). The app shows
 * "You get X" per currency (naira ÷ rate, half to even); the server checks everything again.
 */

import { useRef, useState, type ReactElement } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { messageFor } from '../../api/client';
import { Icon } from '../../components/icons';
import { PrimaryButton, Screen } from '../../components/primitives';
import { tr } from '../../i18n';
import { brandWeight, color, numericTextStyle, space, themed, typography } from '../../theme';
import { formatHundredths, parseToHundredths } from './money';
import { foreignMinorFor } from './serverOffers';

/** Owner, 2026-10-21: up to 5; only currencies with an official rate (ADR-020). */
export const GROUP_CURRENCIES = ['USD', 'GBP', 'EUR'] as const;
export const GROUP_MAX = 5;
export const GROUP_MIN = 2;

export interface GroupLine {
  readonly currency: string;
  readonly rate: string;
}

export interface MultiRequestSource {
  publish(nairaMinor: number, lines: readonly { currency: string; rateHundredths: number }[], key: string): Promise<unknown>;
  newKey(): string;
}

/** What is wrong with the form, or null when it can be sent. */
export function groupProblem(naira: string, lines: readonly GroupLine[]): string | null {
  if (parseToHundredths(naira) === null) return tr('Enter the naira amount as a number, e.g. 1000000.00.');
  if (lines.length < GROUP_MIN) return tr('Add at least 2 currencies.');
  if (lines.length > GROUP_MAX) return tr('You can add up to 5 currencies.');
  if (new Set(lines.map((l) => l.currency)).size !== lines.length) return tr('Each currency can be chosen once.');
  if (lines.some((l) => parseToHundredths(l.rate) === null)) return tr('Enter each rate as a number, e.g. 1320.50.');
  return null;
}

/** "You get 757.58 USD" for a line, or null when it can't be worked out yet. */
export function youGet(naira: string, rate: string): number | null {
  const n = parseToHundredths(naira);
  const r = parseToHundredths(rate);
  if (n === null || r === null) return null;
  return foreignMinorFor(n, formatHundredths(r).replace(/,/g, ''));
}

export function MultiRequestScreen({
  source,
  onBack,
  onDone,
}: {
  source: MultiRequestSource;
  onBack: () => void;
  onDone: () => void;
}): ReactElement {
  const [naira, setNaira] = useState('');
  const [lines, setLines] = useState<GroupLine[]>([
    { currency: 'USD', rate: '' },
    { currency: 'GBP', rate: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const problem = groupProblem(naira, lines);
  const unused = GROUP_CURRENCIES.filter((c) => !lines.some((l) => l.currency === c));

  const change = (next: GroupLine[]): void => {
    setLines(next);
    setError(null);
    key.current = null; // a changed request is a new request
  };

  const post = async (): Promise<void> => {
    const nairaMinor = parseToHundredths(naira);
    if (problem || nairaMinor === null) return;
    key.current ??= source.newKey();
    setBusy(true);
    setError(null);
    try {
      await source.publish(
        nairaMinor,
        lines.map((l) => ({ currency: l.currency, rateHundredths: parseToHundredths(l.rate) ?? 0 })),
        key.current,
      );
      onDone();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="multi-request-screen">
      <View style={styles.header}>
        <Pressable testID="multi-back" accessibilityRole="button" accessibilityLabel={tr('Back')} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr('New buy request')}</Text>
        <View style={styles.spacer} />
      </View>

      <Text style={styles.label}>{tr('YOU PAY')}</Text>
      <View style={styles.amountBox}>
        <TextInput
          testID="multi-naira"
          accessibilityLabel={tr('You pay (NGN)')}
          value={naira}
          onChangeText={(t) => {
            setNaira(t.replace(/[^0-9.,]/g, '').slice(0, 18));
            setError(null);
            key.current = null;
          }}
          placeholder="1,000,000.00"
          placeholderTextColor={color.text.secondary}
          keyboardType="decimal-pad"
          inputMode="decimal"
          style={styles.amountInput}
        />
        <Text style={styles.amountCode}>NGN</Text>
      </View>
      <Text style={styles.small}>{tr('Whole amount only. One person takes the whole request in one currency.')}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{tr('CURRENCIES YOU ACCEPT')}</Text>
        <Text style={styles.small}>{tr('{{count}} of {{max}}', { count: lines.length, max: Math.min(GROUP_MAX, GROUP_CURRENCIES.length) })}</Text>
      </View>
      {lines.map((line, i) => {
        const got = youGet(naira, line.rate);
        return (
          <View key={line.currency} testID={`multi-line-${line.currency}`} style={styles.line}>
            <View style={styles.code}>
              <Text style={styles.codeText}>{line.currency}</Text>
            </View>
            <View style={styles.grow}>
              <View style={styles.rateRow}>
                <Text style={styles.small}>{tr('NGN')}</Text>
                <TextInput
                  testID={`multi-rate-${line.currency}`}
                  accessibilityLabel={tr('Rate (NGN per {{currency}})', { currency: line.currency })}
                  value={line.rate}
                  onChangeText={(t) => change(lines.map((l, j) => (j === i ? { ...l, rate: t.replace(/[^0-9.,]/g, '').slice(0, 12) } : l)))}
                  placeholder={tr('rate')}
                  placeholderTextColor={color.text.secondary}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  style={styles.rateInput}
                />
                <Text style={styles.small}>{`/ ${line.currency}`}</Text>
              </View>
              <Text style={styles.small}>
                {got === null ? ' ' : tr('You get {{amount}} {{currency}}', { amount: formatHundredths(got), currency: line.currency })}
              </Text>
            </View>
            {lines.length > GROUP_MIN ? (
              <Pressable
                testID={`multi-remove-${line.currency}`}
                accessibilityRole="button"
                accessibilityLabel={tr('Remove {{currency}}', { currency: line.currency })}
                onPress={() => change(lines.filter((_, j) => j !== i))}
                hitSlop={8}
              >
                <Icon name="close" color={color.text.secondary} size={18} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {unused.length > 0 && lines.length < GROUP_MAX ? (
        <Pressable
          testID="multi-add"
          accessibilityRole="button"
          onPress={() => change([...lines, { currency: unused[0], rate: '' }])}
          style={styles.add}
        >
          <Text style={styles.addText}>{tr('Add {{currency}}', { currency: unused[0] })}</Text>
        </Pressable>
      ) : null}

      <View style={styles.note}>
        <Icon name="info" color={color.brand.primary} size={20} />
        <Text style={styles.noteText}>
          {tr('When someone starts a deal in one currency, the others are hidden. If the deal completes, the others are removed. If they don’t pay, the others come back.')}
        </Text>
      </View>

      {error ? (
        <Text testID="multi-error" accessibilityRole="alert" style={styles.error}>{error}</Text>
      ) : naira && problem ? (
        <Text testID="multi-problem" style={styles.small}>{problem}</Text>
      ) : null}
      <PrimaryButton testID="multi-post" label={busy ? tr('Publishing…') : tr('Post request')} disabled={busy || problem !== null} onPress={() => void post()} />
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 24 },
  title: { ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  label: { ...typography.chipLabel, fontSize: 13, letterSpacing: 0.5, color: color.text.secondary, marginTop: space.sm },
  amountBox: { flexDirection: 'row', alignItems: 'center', height: 56, borderWidth: 1.5, borderColor: color.brand.primary, borderRadius: 12, paddingHorizontal: 14 },
  amountInput: { flex: 1, ...brandWeight('700'), ...numericTextStyle, fontSize: 20, color: color.text.primary, paddingVertical: 0 },
  amountCode: { ...brandWeight('700'), fontSize: 14, color: color.text.secondary },
  small: { ...typography.caption, color: color.text.secondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: color.border.subtle, borderRadius: 14.37, padding: 12 },
  code: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.brand.secondarySurface, alignItems: 'center', justifyContent: 'center' },
  codeText: { ...brandWeight('700'), fontSize: 13, color: color.brand.primary },
  grow: { flex: 1, gap: 2 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rateInput: { flex: 1, ...brandWeight('700'), ...numericTextStyle, fontSize: 15, color: color.text.primary, borderBottomWidth: 1, borderBottomColor: color.border.subtle, paddingVertical: 2 },
  add: { height: 48, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: color.brand.primary, backgroundColor: color.brand.secondarySurface, alignItems: 'center', justifyContent: 'center' },
  addText: { ...brandWeight('700'), fontSize: 15, color: color.brand.primary },
  note: { flexDirection: 'row', gap: 10, backgroundColor: color.bg.sunken, borderRadius: 12, padding: 12 },
  noteText: { flex: 1, ...typography.caption, fontSize: 13, lineHeight: 19, color: color.text.secondary },
  error: { ...typography.caption, color: color.error.text },
}));
