/**
 * Transaction In Progress / Transaction Completed (Figma 120:990, 189:1429, 122:1602,
 * 122:1773, 124:1243, 124:1408), ADR-014.
 *
 * Note box, the transfer details with a countdown, "Request Extension" / "I Have Paid",
 * then "Confirming payment", "Payment received", and the live Transaction progress list.
 * When paid out: the completed view with "View Receipt" and the rating form.
 * DEMO: the partner bank and the other person are simulated; the screen says so.
 */

import { useEffect, useState, type ReactElement } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import Svg, { Circle, Path } from "react-native-svg";

import { Icon } from "../../components/icons";
import { PrimaryButton } from "../../components/primitives";
import { brandWeight, color, space, themed, typography } from "../../theme";
import { DemoNote, GhostButton } from "../auth/ui";
import { ActionSheet, RoundButton } from "../market/controls";
import { formatHundredths } from "../market/money";
import { orderSiblings, progressFor, tradeStore, useTrade, useTrades, type Trade } from "./tradeStore";
import { trRich } from "../../i18n/rich";
import { tr, k } from "../../i18n";

/** Demo escrow details — obviously not a real account. */
export const DEMO_ESCROW = {
  bank: k("Partner bank (demo)"),
  account: "00 0000 0000",
} as const;

export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Step({ label, at }: { label: string; at?: string }): ReactElement {
  const done = at !== undefined;
  return (
    <View
      style={styles.step}
      accessible
      accessibilityLabel={done ? tr("{{label}}. Completed {{at}}", { label, at }) : tr("{{label}}. Pending", { label })}
    >
      <View style={[styles.stepDot, done ? styles.stepDone : styles.stepTodo]}>
        <Icon name="check" color={color.text.onFill} size={12} weight={3} />
      </View>
      <View style={styles.stepText}>
        <View style={styles.stepHead}>
          <Text style={styles.stepLabel}>{label}</Text>
          <View style={[styles.stepLine, done ? styles.stepLineDone : null]} />
        </View>
        <Text style={styles.stepTime}>
          {done ? tr("Completed . {{at}}", { at }) : tr("Pending")}
        </Text>
      </View>
    </View>
  );
}

function DoneArt(): ReactElement {
  return (
    <Svg
      width={64}
      height={64}
      viewBox="0 0 64 64"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={32} cy={32} r={28} fill={color.success.surface} />
      <Circle cx={32} cy={32} r={20} fill={color.success.fill} />
      <Path
        d="M23 32l6 6 12-12"
        stroke="#FFFFFF"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Completed({
  trade,
  onReceipt,
  onFinish,
}: {
  trade: Trade;
  onReceipt: () => void;
  onFinish: () => void;
}): ReactElement {
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState(Boolean(trade.rating));
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.doneHead}>
        <DoneArt />
        <Text testID="trade-done-text" style={styles.doneText}>{tr("Your transaction (Ref No. {{reference}}) has been completed successfully.", { reference: trade.reference })}</Text>
        <Pressable
          testID="trade-receipt"
          accessibilityRole="link"
          onPress={onReceipt}
          style={styles.receiptLink}
          hitSlop={8}
        >
          <Icon name="info" color={color.success.text} size={16} />
          <Text style={styles.receiptText}>{tr("View Receipt")}</Text>
        </Pressable>
      </View>
      <View style={styles.rule} />
      <Text style={styles.sectionTitle}>{tr("RATE THIS TRANSACTION")}</Text>
      {sent ? (
        <Text testID="trade-rated" style={styles.thanks}>{tr("Thank you for your feedback.")}</Text>
      ) : (
        <>
          <View style={styles.stars} accessibilityRole="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                testID={`trade-star-${n}`}
                accessibilityRole="radio"
                accessibilityLabel={(n === 1 ? tr("1 star") : tr("{{count}} stars", { count: n }))}
                accessibilityState={{ checked: stars === n }}
                onPress={() => setStars(n)}
                hitSlop={6}
              >
                <Svg width={40} height={40} viewBox="0 0 24 24">
                  <Path
                    d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
                    fill={
                      n <= stars ? color.decorative.star : color.border.subtle
                    }
                  />
                </Svg>
              </Pressable>
            ))}
          </View>
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackLabel}>{tr("Leave a feedback")}</Text>
            <TextInput
              testID="trade-feedback"
              value={feedback}
              onChangeText={setFeedback}
              placeholder={tr("enter feedback")}
              placeholderTextColor={color.text.disabled}
              multiline
              maxLength={500}
              accessibilityLabel={tr("Leave a feedback")}
              style={styles.feedbackInput}
            />
          </View>
        </>
      )}
      <View style={styles.actions}>
        {sent ? (
          <PrimaryButton
            testID="trade-finish"
            label={tr("Done")}
            onPress={onFinish}
          />
        ) : (
          <>
            <PrimaryButton
              testID="trade-submit-feedback"
              label={tr("Submit Feedback")}
              disabled={stars === 0}
              onPress={() => {
                if (tradeStore.rate(trade.id, stars, feedback)) setSent(true);
              }}
            />
            <GhostButton testID="trade-skip" label={tr("Skip")} onPress={onFinish} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const PHASE_LABEL: Record<Trade["phase"], string> = {
  awaiting_payment: k("Waiting for your transfer"),
  confirming: k("Checking your payment"),
  awaiting_counterparty: k("Waiting for the other side"),
  releasing: k("Releasing funds"),
  completed: "Completed",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** The other trades of a multi-listing order (ADR-019): each is paid and tracked on its own. */
function OrderStrip({ trade, onOpenTrade }: { trade: Trade; onOpenTrade?: (id: string) => void }): ReactElement | null {
  const all = useTrades();
  const others = orderSiblings(trade, all);
  if (others.length === 0) return null;
  const total = others.length + 1;
  return (
    <View testID="trade-order" style={styles.order}>
      <Text style={styles.orderTitle}>{tr("This order has {{total}} trades. Pay each one separately.", { total })}</Text>
      {others.map((o) => (
        <Pressable
          key={o.id}
          testID={`trade-order-${o.id}`}
          accessibilityRole="button"
          accessibilityLabel={tr("Open trade {{reference}}, {{amountMinor}} {{currency}}, {{value}}", { reference: o.reference, amountMinor: formatHundredths(o.amountMinor), currency: o.currency, value: tr(PHASE_LABEL[o.phase]) })}
          onPress={onOpenTrade ? () => onOpenTrade(o.id) : undefined}
          style={styles.orderRow}
        >
          <Text style={styles.orderAmount}>{`${formatHundredths(o.amountMinor)} ${o.currency}`}</Text>
          <Text style={styles.orderPhase}>{tr(PHASE_LABEL[o.phase])}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function TradeScreen({
  id,
  onBack,
  onReceipt,
  onFinish,
  onSupport,
  onOpenTrade,
  now = Date.now,
}: {
  id: string;
  onBack: () => void;
  onReceipt: () => void;
  onFinish: () => void;
  onSupport: () => void;
  /** Opens another trade of the same order. */
  onOpenTrade?: (id: string) => void;
  now?: () => number;
}): ReactElement | null {
  const insets = useSafeAreaInsets();
  const trade = useTrade(id);
  const [, setTick] = useState(0);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      tradeStore.tick(id, now());
      // Keep the other trades of the same order current too (expiry, demo bank steps).
      const self = tradeStore.get(id);
      if (self) for (const o of orderSiblings(self, tradeStore.all())) tradeStore.tick(o.id, now());
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [id, now]);

  if (!trade) return null;
  const t = trade;
  const left = t.deadline - now();
  const payLabel = `${t.payCurrency} ${formatHundredths(t.transferMinor)}`;
  const ended = t.phase === "expired" || t.phase === "cancelled";

  const confirmPaid = (): void =>
    Alert.alert(
      tr("Have you paid?"),
      tr("Only continue once you have sent exactly {{payLabel}} (including the Xspeeria fee) from a bank account in your name.", { payLabel }),
      [
        { text: tr("Not yet"), style: "cancel" },
        {
          text: tr("Yes, I have paid"),
          onPress: () => tradeStore.markPaid(t.id, now()),
        },
      ],
    );

  const title =
    t.phase === "completed"
      ? tr("Transaction Completed")
      : ended
        ? tr("Transaction Cancelled")
        : tr("Transaction In Progress");

  return (
    <View
      testID="trade-screen"
      style={[
        styles.screen,
        { paddingTop: insets.top + space.xs, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        {t.phase === "completed" ? (
          <View style={styles.headerSide} />
        ) : (
          <Pressable
            testID="trade-back"
            accessibilityRole="button"
            accessibilityLabel={tr("Back")}
            onPress={onBack}
            hitSlop={12}
            style={styles.headerSide}
          >
            <Icon
              name="back"
              color={color.text.primary}
              size={24}
              weight={2.25}
            />
          </Pressable>
        )}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <RoundButton
          icon="more"
          label={tr("More options")}
          testID="trade-more"
          onPress={() => setMenu(true)}
        />
      </View>

      <OrderStrip trade={t} onOpenTrade={onOpenTrade} />
      {t.phase === "completed" ? (
        <Completed trade={t} onReceipt={onReceipt} onFinish={onFinish} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>{tr("Please Note:")}</Text>
            <View style={styles.noteRule} />
            <Text style={styles.note}>{trRich("1. All payments <1>MUST</1> be made from a bank account registered in your name, matching the name on your Xspeeria profile.", {}, { 1: (s) => <Text style={styles.noteStrong}>{s}</Text> })}</Text>
            <Text style={styles.note}>{tr("2. Payments must be completed within the specified time frame to avoid automatic cancellation of the transaction.")}</Text>
          </View>

          <View style={styles.transfer}>
            <View style={styles.transferHead}>
              <Text style={styles.transferLabel}>{tr("Transfer")}{' '}</Text>
              <Text testID="trade-amount" style={styles.transferAmount}>
                {payLabel}
              </Text>
              <Text style={styles.transferLabel}>{' '}{tr("to")}{' '}</Text>
              <Pressable
                testID="trade-info"
                accessibilityRole="button"
                accessibilityLabel={tr("About this account")}
                hitSlop={8}
                onPress={() =>
                  Alert.alert(
                    tr("Partner bank escrow"),
                    tr("This is a local escrow account held by our partner bank. Xspeeria never holds your money; it is released only when both sides have paid."),
                  )
                }
              >
                <Icon name="info" color={color.text.secondary} size={14} />
              </Pressable>
            </View>
            <Text style={styles.bank}>{tr(DEMO_ESCROW.bank)}</Text>
            <View style={styles.accountRow}>
              <Text testID="trade-account" style={styles.account}>
                {DEMO_ESCROW.account}
              </Text>
              <Pressable
                testID="trade-copy"
                accessibilityRole="button"
                accessibilityLabel={tr("Copy account number")}
                hitSlop={8}
                onPress={() => {
                  Clipboard.setStringAsync(
                    DEMO_ESCROW.account.replace(/\s/g, ""),
                  ).then(
                    () => setCopied(true),
                    () => undefined,
                  );
                }}
              >
                <Icon name="copy" color={color.text.secondary} size={16} />
              </Pressable>
            </View>
            {t.phase === "awaiting_payment" ? (
              <Text testID="trade-expires" style={styles.expires}>{tr("Expires in {{left}} mins", { left: countdown(left) })}</Text>
            ) : null}
            {copied ? (
              <Text style={styles.expires}>{tr("Account number copied")}</Text>
            ) : null}
          </View>
          <DemoNote>{tr("Demo app: there is no real bank and no real person on the other side. Do not send real money.")}</DemoNote>

          {t.phase === "awaiting_payment" ? (
            <View style={styles.buttonsRow}>
              {t.extension === "none" ? (
                <Pressable
                  testID="trade-extend"
                  accessibilityRole="button"
                  onPress={() => tradeStore.requestExtension(t.id, now())}
                  style={styles.extend}
                >
                  <Text style={styles.extendText}>{tr("Request Extension")}</Text>
                </Pressable>
              ) : (
                <View testID="trade-extension-state" style={styles.extend}>
                  <Text style={styles.extendMuted}>
                    {t.extension === "requested"
                      ? tr("Waiting…")
                      : tr("{{left}} mins", { left: countdown(left) })}
                  </Text>
                </View>
              )}
              <View style={styles.flex}>
                <PrimaryButton
                  testID="trade-paid"
                  label={tr("I Have Paid")}
                  onPress={confirmPaid}
                  tone={t.side === "sell" ? "sell" : "primary"}
                />
              </View>
            </View>
          ) : t.phase === "confirming" ? (
            <View>
              <View testID="trade-confirming" style={styles.statusBox}>
                <Text style={styles.statusMuted}>{tr("Confirming payment ••••")}</Text>
              </View>
              <Text style={styles.statusCaption}>{tr("Payment confirmation usually takes a few minutes")}</Text>
            </View>
          ) : ended ? (
            <View
              testID="trade-ended"
              style={[styles.statusBox, styles.statusError]}
            >
              <Text style={styles.statusErrorText}>
                {t.phase === "expired"
                  ? tr("Time ran out, so this trade was cancelled.")
                  : tr("You cancelled this trade.")}{" "}{tr("Nothing was taken from you.")}</Text>
            </View>
          ) : (
            <View>
              <View testID="trade-received" style={styles.statusBox}>
                <Icon name="check" color={color.success.text} size={18} />
                <Text style={styles.statusOk}>{tr("Payment received")}</Text>
              </View>
              <Text style={styles.statusCaption}>
                {t.phase === "awaiting_counterparty"
                  ? tr("Waiting for the {{counterparty}}’s payment", { counterparty: tr(t.counterparty) })
                  : tr("Releasing funds to both sides")}
              </Text>
            </View>
          )}

          <View style={styles.rule} />
          <Text style={styles.sectionTitle}>{tr("TRANSACTION PROGRESS")}</Text>
          {progressFor(t).map((s, i) => (
            <Step key={`${s.label}-${i}`} label={s.label} at={s.at} />
          ))}
          {ended ? (
            <PrimaryButton
              testID="trade-back-market"
              label={tr("Back to Market")}
              onPress={onFinish}
            />
          ) : null}
        </ScrollView>
      )}

      <ActionSheet
        testID="trade-menu"
        visible={menu}
        onClose={() => setMenu(false)}
        actions={[
          {
            key: "support",
            label: tr("Contact Support"),
            onPress: () => {
              setMenu(false);
              onSupport();
            },
          },
          ...(t.phase === "awaiting_payment"
            ? [
                {
                  key: "cancel",
                  label: tr("Cancel trade"),
                  onPress: () => {
                    setMenu(false);
                    Alert.alert(
                      tr("Cancel this trade?"),
                      tr("Only cancel if you have not sent any money."),
                      [
                        { text: tr("Keep trade"), style: "cancel" },
                        {
                          text: tr("Cancel trade"),
                          style: "destructive",
                          onPress: () => tradeStore.cancel(t.id, now()),
                        },
                      ],
                    );
                  },
                },
              ]
            : []),
        ]}
      />
    </View>
  );
}

const styles = themed(() => ({
  order: {
    marginHorizontal: space.md,
    marginBottom: space.xs,
    padding: space.sm,
    borderRadius: 12,
    backgroundColor: color.brand.tint,
    gap: 6,
  },
  orderTitle: { ...typography.caption, ...brandWeight("700"), fontSize: 13, color: color.text.primary },
  orderRow: { flexDirection: "row", justifyContent: "space-between", minHeight: 32, alignItems: "center" },
  orderAmount: { ...typography.body, fontSize: 14, color: color.brand.primary, ...brandWeight("700") },
  orderPhase: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  headerSide: { width: 36 },
  title: {
    ...typography.headline,
    ...brandWeight("700"),
    fontSize: 18,
    color: color.text.primary,
  },
  body: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  noteBox: {
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: 16,
    padding: space.sm,
    gap: 6,
  },
  noteTitle: { ...typography.caption, color: color.error.text },
  noteRule: { height: 1, backgroundColor: color.border.subtle },
  note: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 18,
    color: color.error.text,
  },
  noteStrong: { ...brandWeight("700") },
  transfer: {
    backgroundColor: color.bg.sunken,
    borderRadius: 16,
    padding: space.sm,
    alignItems: "center",
    gap: 6,
  },
  transferHead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  transferLabel: { ...typography.caption, color: color.text.secondary },
  transferAmount: {
    ...typography.caption,
    ...brandWeight("700"),
    color: color.text.primary,
    fontVariant: ["tabular-nums"],
  },
  bank: {
    ...typography.body,
    ...brandWeight("500"),
    fontSize: 15,
    color: color.text.primary,
    marginTop: 6,
  },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  account: {
    fontSize: 22,
    letterSpacing: 1,
    color: color.text.primary,
    ...brandWeight("500"),
  },
  expires: { ...typography.caption, color: color.text.secondary },
  buttonsRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  flex: { flex: 1 },
  extend: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  extendText: {
    ...typography.body,
    ...brandWeight("700"),
    fontSize: 15,
    color: color.text.primary,
  },
  extendMuted: {
    ...typography.body,
    ...brandWeight("700"),
    fontSize: 15,
    color: color.text.secondary,
  },
  statusBox: {
    flexDirection: "row",
    gap: 10,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  statusMuted: {
    ...typography.body,
    ...brandWeight("700"),
    fontSize: 16,
    color: color.text.secondary,
  },
  statusOk: {
    ...typography.body,
    ...brandWeight("700"),
    fontSize: 16,
    color: color.success.text,
  },
  statusCaption: {
    ...typography.caption,
    color: color.text.secondary,
    textAlign: "center",
    marginTop: 6,
  },
  statusError: {
    height: undefined,
    padding: space.sm,
    borderColor: color.error.border,
    backgroundColor: color.error.surface,
  },
  statusErrorText: {
    ...typography.body,
    fontSize: 14,
    color: color.error.text,
    textAlign: "center",
  },
  rule: {
    height: 1,
    backgroundColor: color.border.subtle,
    marginVertical: space.xs,
  },
  sectionTitle: {
    ...typography.caption,
    ...brandWeight("500"),
    fontSize: 13,
    letterSpacing: 0.5,
    color: color.text.secondary,
  },
  step: { flexDirection: "row", gap: 12, paddingVertical: 6 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepDone: { backgroundColor: color.success.fill },
  stepTodo: { backgroundColor: color.text.disabled },
  stepText: { flex: 1, gap: 2 },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepLabel: { ...typography.body, fontSize: 15, color: color.text.primary },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: color.border.strong,
    opacity: 0.4,
  },
  stepLineDone: { backgroundColor: color.success.fill, opacity: 1 },
  stepTime: {
    ...typography.caption,
    fontSize: 11,
    color: color.text.secondary,
  },
  doneHead: { alignItems: "center", gap: space.sm, paddingTop: space.lg },
  doneText: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: color.text.primary,
    textAlign: "center",
  },
  receiptLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  receiptText: {
    ...typography.body,
    ...brandWeight("500"),
    color: color.success.text,
  },
  stars: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginVertical: space.sm,
  },
  feedbackBox: {
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: 8,
    padding: 12,
    minHeight: 120,
  },
  feedbackLabel: {
    ...typography.caption,
    color: color.text.secondary,
    marginBottom: 6,
  },
  feedbackInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    color: color.text.primary,
    textAlignVertical: "top",
    minHeight: 80,
  },
  thanks: {
    ...typography.body,
    color: color.success.text,
    textAlign: "center",
    marginVertical: space.md,
  },
  actions: { gap: 12, marginTop: space.md },
}));
