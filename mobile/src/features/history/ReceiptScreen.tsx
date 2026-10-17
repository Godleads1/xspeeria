/**
 * Transaction receipt (Figma frame 344:6152), ADR-006.
 *
 * A ticket-style summary: status, reference, the NGN ⇄ foreign corridor, amount and rate;
 * transaction details (amount, the flat coordination fee, amount paid into escrow);
 * the payout ("settlement") accounts with only their last four digits; and the trade's
 * progress through escrow. Figures are computed in integers and always add up.
 * MOCK DATA ONLY.
 */

import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { RoundFlag } from '../../components/flags';
import { Icon } from '../../components/icons';
import { brandWeight, color, space, typography } from '../../theme';
import { SectionLabel } from '../home/SectionLabel';
import { formatCompact, formatHundredths, quoteMinor } from '../market/money';
import { COORDINATION_FEE_KOBO, type HistoryItem } from './data';

const STATUS_TITLE = {
  completed: 'TRANSACTION SUCCESSFUL',
  pending: 'TRANSACTION IN PROGRESS',
  failed: 'TRANSACTION FAILED',
} as const;

/** A dashed rule with half-circle notches at each end, like a tear-off ticket. */
function TicketTear(): ReactElement {
  return (
    <View style={styles.tear} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[styles.notch, styles.notchLeft]} />
      <View style={styles.dash} />
      <View style={[styles.notch, styles.notchRight]} />
    </View>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }): ReactElement {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, strong ? styles.lineStrong : null]}>{value}</Text>
    </View>
  );
}

function StepDot({ done }: { done: boolean }): ReactElement {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Circle cx={11} cy={11} r={10} fill={done ? color.success.text : color.bg.sunken} stroke={done ? color.success.text : color.border.strong} />
      {done ? (
        <Path d="M6.5 11.2l3 3 6-6" stroke={color.text.onFill} strokeWidth={2} fill="none" strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}

export function ReceiptScreen({ item, onClose }: { item: HistoryItem; onClose: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const isBuy = item.side === 'buy';
  const ngnMinor = quoteMinor(item.amountMinor, item.rateHundredths);
  const paidMinor = ngnMinor + COORDINATION_FEE_KOBO;
  const foreign = `${formatHundredths(item.amountMinor)} ${item.currency}`;
  const rate = `NGN ${formatCompact(item.rateHundredths)}/${item.currency}`;
  const [fromCode, toCode] = isBuy ? ['NGN', item.currency] : [item.currency, 'NGN'];

  return (
    <View testID="receipt-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.topBar}>
        <Pressable
          testID="receipt-close"
          accessibilityRole="button"
          accessibilityLabel="Close receipt"
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
        >
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.ticket}>
          <View style={styles.ticketHead}>
            <Text accessibilityRole="header" style={[styles.status, item.status === 'failed' ? styles.statusFailed : null]}>
              {STATUS_TITLE[item.status]}
            </Text>
          </View>
          <TicketTear />
          <View style={styles.ticketBody}>
            <Line label="Transaction Reference" value={item.reference} />
            <View style={styles.corridor} accessible accessibilityLabel={`${fromCode} to ${toCode}`}>
              <View style={styles.side}>
                <RoundFlag code={fromCode} size={40} />
                <Text style={styles.code}>{fromCode}</Text>
              </View>
              <View style={styles.track}>
                <View style={styles.dotted} />
                <View style={styles.arrow}>
                  <Icon name="back" color={color.text.secondary} size={18} />
                </View>
                <View style={styles.dotted} />
              </View>
              <View style={styles.side}>
                <RoundFlag code={toCode} size={40} />
                <Text style={styles.code}>{toCode}</Text>
              </View>
            </View>
            <Line label={isBuy ? 'Amount Received' : 'Amount Sent'} value={foreign} />
            <Line label="Rate" value={rate} />
          </View>
          <TicketTear />
          <View style={styles.ticketBody}>
            <Text style={styles.detailsTitle}>Transaction details</Text>
            <Line label="Transaction Amount" value={`${formatHundredths(ngnMinor)} NGN`} />
            {isBuy ? (
              <>
                <Line label="Coordination Fee" value={`${formatHundredths(COORDINATION_FEE_KOBO)} NGN`} />
                <Line label="Amount Paid" value={`${formatHundredths(paidMinor)} NGN`} strong />
                <Text style={styles.note}>{"Paid into the partner bank's escrow, never to Xspeeria."}</Text>
              </>
            ) : (
              <Line label="Amount Received" value={`${formatHundredths(ngnMinor)} NGN`} strong />
            )}
          </View>
        </View>

        {item.payouts.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>Settlement account</SectionLabel>
            {item.payouts.map((p) => (
              <View
                key={`${p.name}-${p.last4}-${p.amountMinor}`}
                style={styles.account}
                accessible
                accessibilityLabel={`${p.name}, ${p.bank} account ending ${p.last4}, ${formatCompact(p.amountMinor)} ${item.currency}`}
              >
                <View style={styles.accountMain}>
                  <Text style={styles.accountName}>{p.name}</Text>
                  <Text style={styles.accountBank}>{`${p.bank} •••• ${p.last4}`}</Text>
                </View>
                <Text style={styles.accountAmount}>{`${formatCompact(p.amountMinor)} ${item.currency}`}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLabel>Transaction progress</SectionLabel>
          {item.progress.map((step, i) => {
            const done = step.at !== undefined;
            const last = i === item.progress.length - 1;
            return (
              <View key={step.label} style={styles.step} accessible accessibilityLabel={`${step.label}: ${done ? `completed ${step.at}` : 'not yet'}`}>
                <View style={styles.stepRail}>
                  <StepDot done={done} />
                  {!last ? <View style={[styles.stepLine, done ? styles.stepLineDone : null]} /> : null}
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepLabel, !done ? styles.stepPending : null]}>{step.label}</Text>
                  {done ? <Text style={styles.stepAt}>{`Completed . ${step.at}`}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const PANEL = color.bg.sunken;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  topBar: { paddingHorizontal: space.md, paddingBottom: 4 },
  close: { width: 36, height: 36, justifyContent: 'center' },
  content: { paddingHorizontal: space.md, gap: space.md },
  ticket: { borderRadius: 18, overflow: 'hidden' },
  ticketHead: { backgroundColor: PANEL, paddingVertical: 28, alignItems: 'center', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  status: { ...brandWeight('700'), fontSize: 18, color: color.text.primary, letterSpacing: 0.3 },
  statusFailed: { color: color.error.text },
  tear: { flexDirection: 'row', alignItems: 'center', backgroundColor: PANEL, height: 16 },
  notch: { width: 16, height: 16, borderRadius: 8, backgroundColor: color.bg.canvas },
  notchLeft: { marginLeft: -8 },
  notchRight: { marginRight: -8 },
  dash: { flex: 1, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: color.border.strong, opacity: 0.4, marginHorizontal: 4 },
  ticketBody: { backgroundColor: PANEL, paddingHorizontal: space.sm, paddingVertical: space.sm, gap: 14 },
  line: { flexDirection: 'row', alignItems: 'center' },
  lineLabel: { ...typography.body, fontSize: 14, color: color.text.secondary, width: 150 },
  lineValue: { ...typography.body, fontSize: 14, color: color.text.primary, flex: 1 },
  lineStrong: { ...brandWeight('700'), color: color.brand.primary },
  note: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  detailsTitle: { ...typography.body, ...brandWeight('500'), fontSize: 17, color: color.text.primary },
  corridor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  side: { alignItems: 'center', gap: 4, width: 56 },
  code: { ...brandWeight('700'), fontSize: 16, color: color.text.primary },
  track: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dotted: { flex: 1, height: 0, borderTopWidth: 1.5, borderStyle: 'dotted', borderColor: color.border.strong, opacity: 0.4 },
  // The back glyph rotated reads as "→".
  arrow: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: color.bg.canvas,
    alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '180deg' }],
  },
  section: { gap: space.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border.subtle, paddingTop: space.sm },
  account: {
    flexDirection: 'row', alignItems: 'center', padding: space.sm, borderRadius: 8,
    borderWidth: 1, borderColor: color.border.subtle, backgroundColor: PANEL,
  },
  accountMain: { flex: 1, gap: 4 },
  accountName: { ...typography.body, ...brandWeight('500'), fontSize: 14, color: color.text.primary },
  accountBank: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  accountAmount: { ...typography.body, fontSize: 14, color: color.text.primary },
  step: { flexDirection: 'row', gap: 12, minHeight: 52 },
  stepRail: { alignItems: 'center', width: 22 },
  stepLine: { flex: 1, width: 0, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: color.border.strong, opacity: 0.5, marginVertical: 2 },
  stepLineDone: { borderStyle: 'solid', borderColor: color.success.text, opacity: 1 },
  stepText: { flex: 1, gap: 2, paddingBottom: 10 },
  stepLabel: { ...typography.body, fontSize: 15, color: color.text.primary },
  stepPending: { color: color.text.disabled },
  stepAt: { ...typography.caption, fontSize: 11, color: color.text.disabled },
});
