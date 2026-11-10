/**
 * Transaction receipt (Figma frame 344:6152), ADR-006.
 *
 * A ticket-style summary: status, reference, the NGN ⇄ foreign corridor, amount and rate;
 * transaction details (amount, the 1% coordination fee, amount paid into escrow);
 * the payout ("settlement") accounts with only their last four digits; and the trade's
 * progress through escrow. Figures are computed in integers and always add up.
 * MOCK DATA ONLY.
 */

import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { RoundFlag } from "../../components/flags";
import { Icon } from "../../components/icons";
import { brandWeight, color, space, typography, themed } from "../../theme";
import { SectionLabel } from "../home/SectionLabel";
import { formatCompact, formatHundredths, formatRateCompact, quoteMinor } from "../market/money";
import {
  COORDINATION_FEE_LABEL,
  coordinationFeeMinor,
  type HistoryItem,
} from "./data";
import { tr, k } from "../../i18n";

const STATUS_TITLE = {
  completed: k("TRANSACTION SUCCESSFUL"),
  pending: k("TRANSACTION IN PROGRESS"),
  failed: k("TRANSACTION FAILED"),
} as const;

/** A dashed rule with half-circle notches at each end, like a tear-off ticket. */
function TicketTear(): ReactElement {
  return (
    <View
      style={styles.tear}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View style={[styles.notch, styles.notchLeft]} />
      <View style={styles.dash} />
      <View style={[styles.notch, styles.notchRight]} />
    </View>
  );
}

function Line({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** Figma sell receipt shows "Amount to pay" in green (readable success text, not the fill). */
  tone?: "sell";
}): ReactElement {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text
        style={[
          styles.lineValue,
          strong ? styles.lineStrong : null,
          tone === "sell" ? { color: color.success.text } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function StepDot({ done }: { done: boolean }): ReactElement {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Circle
        cx={11}
        cy={11}
        r={10}
        fill={done ? color.success.text : color.bg.sunken}
        stroke={done ? color.success.text : color.border.strong}
      />
      {done ? (
        <Path
          d="M6.5 11.2l3 3 6-6"
          stroke={color.text.onFill}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

export function ReceiptScreen({
  item,
  onClose,
}: {
  item: HistoryItem;
  onClose: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const isBuy = item.side === "buy";
  const ngnMinor = quoteMinor(item.amountMinor, item.rateMilli);
  // Recorded figures win (FIN-02); older mock items fall back to the computed ones.
  const sentMinor = isBuy ? ngnMinor : item.amountMinor;
  const feeMinor = item.recorded ? item.recorded.feeMinor : coordinationFeeMinor(sentMinor);
  const paidMinor = item.recorded ? item.recorded.transferMinor : sentMinor + feeMinor;
  // Labels follow the status (FIN-03): nothing is "paid" or "received" on a failed trade.
  const done = item.status === "completed";
  const failed = item.status === "failed";
  // Completed buy receipts use Figma's "Received"/"Paid"; Figma's sell receipt says "to
  // receive"/"to pay" throughout, so that wording stays for sells.
  const receivedLabel = failed ? tr("Amount (not received)") : done && isBuy ? tr("Amount Received") : tr("Amount to receive");
  const paidLabel = failed ? tr("Amount (not paid)") : done && isBuy ? tr("Amount Paid") : tr("Amount to pay");
  const foreign = `${formatHundredths(item.amountMinor)} ${item.currency}`;
  const rate = `NGN ${formatRateCompact(item.rateMilli)}/${item.currency}`;
  const [fromCode, toCode] = isBuy
    ? ["NGN", item.currency]
    : [item.currency, "NGN"];
  // Payouts are in the currency received: foreign when buying, NGN when selling.
  const payoutCurrency = isBuy ? item.currency : "NGN";

  return (
    <View
      testID="receipt-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
    >
      <View style={styles.topBar}>
        <Pressable
          testID="receipt-close"
          accessibilityRole="button"
          accessibilityLabel={tr("Close receipt")}
          onPress={onClose}
          hitSlop={12}
          style={styles.close}
        >
          <Icon
            name="back"
            color={color.text.primary}
            size={22}
            weight={2.25}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <View style={styles.ticket}>
          <View style={styles.ticketHead}>
            <Text
              accessibilityRole="header"
              style={[
                styles.status,
                item.status === "failed" ? styles.statusFailed : null,
              ]}
            >
              {tr(STATUS_TITLE[item.status])}
            </Text>
          </View>
          <TicketTear />
          <View style={styles.ticketBody}>
            <Line label={tr("Transaction Reference")} value={item.reference} />
            <View
              style={styles.corridor}
              accessible
              accessibilityLabel={tr("{{fromCode}} to {{toCode}}", { fromCode, toCode })}
            >
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
            <Line
              label={receivedLabel}
              value={isBuy ? foreign : `${formatHundredths(ngnMinor)} NGN`}
            />
            <Line label={tr("Rate")} value={rate} />
          </View>
          <TicketTear />
          <View style={styles.ticketBody}>
            <Text style={styles.detailsTitle}>{tr("Transaction details")}</Text>
            <Line
              label={tr("Transaction Amount")}
              value={isBuy ? `${formatHundredths(ngnMinor)} NGN` : foreign}
            />
            {isBuy ? (
              <>
                <Line
                  label={tr("Coordination Fee ({{COORDINATION_FEE_LABEL}})", { COORDINATION_FEE_LABEL })}
                  value={`${formatHundredths(feeMinor)} NGN`}
                />
                <Line
                  label={paidLabel}
                  value={`${formatHundredths(paidMinor)} NGN`}
                  strong
                />
                <Text style={styles.note}>
                  {tr("Paid into the partner bank's escrow, never to Xspeeria.")}
                </Text>
              </>
            ) : (
              <>
                {/* Figma sell receipt: fee and amount to pay in the currency the seller sends. */}
                <Line
                  label={tr("Transaction fee ({{COORDINATION_FEE_LABEL}})", { COORDINATION_FEE_LABEL })}
                  value={`${formatHundredths(feeMinor)} ${item.currency}`}
                />
                <Line
                  label={paidLabel}
                  value={`${formatHundredths(paidMinor)} ${item.currency}`}
                  strong
                  tone="sell"
                />
                <Text style={styles.note}>
                  {tr("Paid into the partner bank's escrow, never to Xspeeria.")}
                </Text>
              </>
            )}
          </View>
        </View>

        {item.payouts.length > 0 ? (
          <View style={styles.section}>
            <SectionLabel>{tr("Settlement account")}</SectionLabel>
            {item.payouts.map((p) => (
              <View
                key={`${p.name}-${p.last4}-${p.amountMinor}`}
                style={styles.account}
                accessible
                accessibilityLabel={tr("{{name}}, {{bank}} account ending {{last4}}, {{amountMinor}} {{payoutCurrency}}", { name: p.name, bank: p.bank, last4: p.last4, amountMinor: formatCompact(p.amountMinor), payoutCurrency })}
              >
                <View style={styles.accountMain}>
                  <Text style={styles.accountName}>{p.name}</Text>
                  <Text
                    style={styles.accountBank}
                  >{`${p.bank} •••• ${p.last4}`}</Text>
                </View>
                <Text
                  style={styles.accountAmount}
                >{`${formatCompact(p.amountMinor)} ${payoutCurrency}`}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionLabel>{tr("Transaction progress")}</SectionLabel>
          {item.progress.map((step, i) => {
            const done = step.at !== undefined;
            const last = i === item.progress.length - 1;
            return (
              <View
                key={step.label}
                style={styles.step}
                accessible
                accessibilityLabel={done ? tr("{{label}}: completed {{at}}", { label: tr(step.label), at: step.at }) : tr("{{label}}: not yet", { label: tr(step.label) })}
              >
                <View style={styles.stepRail}>
                  <StepDot done={done} />
                  {!last ? (
                    <View
                      style={[
                        styles.stepLine,
                        done ? styles.stepLineDone : null,
                      ]}
                    />
                  ) : null}
                </View>
                <View style={styles.stepText}>
                  <Text
                    style={[
                      styles.stepLabel,
                      !done ? styles.stepPending : null,
                    ]}
                  >
                    {tr(step.label)}
                  </Text>
                  {done ? (
                    <Text
                      style={styles.stepAt}
                    >{tr("Completed . {{at}}", { at: step.at })}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  topBar: { paddingHorizontal: space.md, paddingBottom: 4 },
  close: { width: 36, height: 36, justifyContent: "center" },
  content: { paddingHorizontal: space.md, gap: space.md },
  ticket: { borderRadius: 18, overflow: "hidden" },
  ticketHead: {
    backgroundColor: color.bg.sunken,
    paddingVertical: 28,
    alignItems: "center",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  status: {
    ...brandWeight("700"),
    fontSize: 18,
    color: color.text.primary,
    letterSpacing: 0.3,
  },
  statusFailed: { color: color.error.text },
  tear: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: color.bg.sunken,
    height: 16,
  },
  notch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.bg.canvas,
  },
  notchLeft: { marginLeft: -8 },
  notchRight: { marginRight: -8 },
  dash: {
    flex: 1,
    height: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: color.border.strong,
    opacity: 0.4,
    marginHorizontal: 4,
  },
  ticketBody: {
    backgroundColor: color.bg.sunken,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    gap: 14,
  },
  line: { flexDirection: "row", alignItems: "center" },
  lineLabel: {
    ...typography.body,
    fontSize: 14,
    color: color.text.secondary,
    width: 150,
  },
  lineValue: {
    ...typography.body,
    fontSize: 14,
    color: color.text.primary,
    flex: 1,
  },
  lineStrong: { ...brandWeight("700"), color: color.brand.primary },
  note: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  detailsTitle: {
    ...typography.body,
    ...brandWeight("500"),
    fontSize: 17,
    color: color.text.primary,
  },
  corridor: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  side: { alignItems: "center", gap: 4, width: 56 },
  code: { ...brandWeight("700"), fontSize: 16, color: color.text.primary },
  track: { flex: 1, flexDirection: "row", alignItems: "center" },
  dotted: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: "dotted",
    borderColor: color.border.strong,
    opacity: 0.4,
  },
  // The back glyph rotated reads as "→".
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.bg.canvas,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "180deg" }],
  },
  section: {
    gap: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border.subtle,
    paddingTop: space.sm,
  },
  account: {
    flexDirection: "row",
    alignItems: "center",
    padding: space.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.sunken,
  },
  accountMain: { flex: 1, gap: 4 },
  accountName: {
    ...typography.body,
    ...brandWeight("500"),
    fontSize: 14,
    color: color.text.primary,
  },
  accountBank: {
    ...typography.caption,
    fontSize: 11,
    color: color.text.secondary,
  },
  accountAmount: {
    ...typography.body,
    fontSize: 14,
    color: color.text.primary,
  },
  step: { flexDirection: "row", gap: 12, minHeight: 52 },
  stepRail: { alignItems: "center", width: 22 },
  stepLine: {
    flex: 1,
    width: 0,
    borderLeftWidth: 1,
    borderStyle: "dashed",
    borderColor: color.border.strong,
    opacity: 0.5,
    marginVertical: 2,
  },
  stepLineDone: {
    borderStyle: "solid",
    borderColor: color.success.text,
    opacity: 1,
  },
  stepText: { flex: 1, gap: 2, paddingBottom: 10 },
  stepLabel: { ...typography.body, fontSize: 15, color: color.text.primary },
  stepPending: { color: color.text.disabled },
  stepAt: { ...typography.caption, fontSize: 11, color: color.text.disabled },
}));
