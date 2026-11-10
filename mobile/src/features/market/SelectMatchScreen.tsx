/**
 * Select Match (Figma frame 106:1150), ADR-005.
 *
 * After "Create request" (or "Create Offer"): a summary of what was asked for, the amount
 * to pay worked out in exact integer arithmetic, the listings that match, and a red
 * "Cancel request" that returns to Market. MOCK DATA ONLY.
 *
 * One request can be filled from several listings (ADR-019): tapping a listing adds it to
 * the selection with the amount it can give ("Taking 250.00 USD"); tapping again removes
 * it. When the selection covers the amount asked for, the confirm sheet opens; "Review"
 * opens it earlier for a smaller total, which the sheet states plainly.
 */

import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../../components/icons";
import { PrimaryButton } from "../../components/primitives";
import { inPlan, plannedMinor, type FillPlan } from "../trade/fillPlan";
import { brandWeight, color, space, typography, themed } from "../../theme";
import { SectionLabel } from "../home/SectionLabel";
import { ListingRow, RoundButton } from "./controls";
import { listingsFor, type Listing } from "./data";
import { formatAmount, formatCompact, formatHundredths, formatRateCompact, quoteMinor } from "./money";
import type { Side, TradeRequest } from "./MarketScreen";
import { tr } from "../../i18n";

export function SelectMatchScreen({
  request,
  onBack,
  onCancel,
  onToggleListing,
  onReview,
  plan = [],
  remainingOf = (l) => l.availableMinor,
}: {
  request: TradeRequest;
  onBack: () => void;
  onCancel: () => void;
  /** Add the listing to the selection, or remove it if already selected. */
  onToggleListing: (listing: Listing, side: Side) => void;
  /** Open the confirm sheet for the current selection. */
  onReview: () => void;
  plan?: FillPlan;
  /** What is still left on a listing after other live trades. */
  remainingOf?: (listing: Listing) => number;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const payMinor = quoteMinor(request.amountMinor, request.rateMilli);
  const matches = listingsFor(request.side, request.currency);
  const isBuy = request.side === "buy";
  const selected = plannedMinor(plan);

  return (
    <View
      testID="select-match-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
    >
      <View style={styles.header}>
        <Pressable
          testID="select-match-back"
          accessibilityRole="button"
          accessibilityLabel={tr("Back")}
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
        >
          <Icon
            name="back"
            color={color.text.primary}
            size={24}
            weight={2.25}
          />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{tr("Select Match")}</Text>
        <RoundButton icon="more" label={tr("More options")} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View testID="select-match-summary" style={styles.summary}>
          <Text style={styles.summaryLine}>
            {tr("Amount: ")}
            <Text style={styles.summaryStrong}>
              {`${formatCompact(request.amountMinor)} ${request.currency}`}
            </Text>
          </Text>
          <View style={styles.rule} />
          <Text style={styles.summaryLine}>
            {tr("Rate: ")}
            <Text style={styles.summaryMuted}>{tr("NGN")}{' '}</Text>
            <Text style={styles.summaryStrong}>
              {formatRateCompact(request.rateMilli)}
            </Text>
            <Text style={styles.summaryMuted}>{` /${request.currency}`}</Text>
          </Text>
          <View style={styles.rule} />
          <Text testID="select-match-pay" style={styles.summaryLine}>
            {isBuy ? tr("Amount to pay: ") : tr("Amount to receive: ")}
            <Text
              style={styles.summaryStrong}
            >{`${formatHundredths(payMinor)} NGN`}</Text>
          </Text>
          <Text style={styles.summaryNote}>{tr("Paid into bank escrow, never to Xspeeria.")}</Text>
        </View>

        <SectionLabel>
          {matches.length > 0
            ? (isBuy ? tr("We found some match for your request") : tr("We found some match for your offer"))
            : tr("No match yet")}
        </SectionLabel>

        {matches.length === 0 ? (
          <Text style={styles.empty}>
            {(isBuy ? tr("Your request stays open. We will notify you when someone matches it.") : tr("Your offer stays open. We will notify you when someone matches it."))}
          </Text>
        ) : (
          <View>
            {matches.map((l, i) => (
              <ListingRow
                key={l.id}
                listing={l}
                side={request.side}
                number={isBuy ? undefined : i + 1}
                availableMinor={remainingOf(l)}
                takingMinor={inPlan(plan, l.id)?.amountMinor}
                onAction={(x) => onToggleListing(x, request.side)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}
      >
        {plan.length > 0 ? (
          <View style={styles.selection}>
            <Text testID="select-match-selected" style={styles.selectionText}>
              {(() => {
                const v = { selected: formatAmount(request.currency, selected), amountMinor: formatAmount(request.currency, request.amountMinor), currency: request.currency, count: plan.length };
                if (plan.length === 1) return isBuy ? tr("Selected {{selected}} of {{amountMinor}} {{currency}} from 1 offer", v) : tr("Selected {{selected}} of {{amountMinor}} {{currency}} from 1 request", v);
                return isBuy ? tr("Selected {{selected}} of {{amountMinor}} {{currency}} from {{count}} offers", v) : tr("Selected {{selected}} of {{amountMinor}} {{currency}} from {{count}} requests", v);
              })()}
            </Text>
            <PrimaryButton
              testID="select-match-review"
              label={plan.length === 1 ? tr("Review trade") : tr("Review {{length}} trades", { length: plan.length })}
              onPress={onReview}
              tone={isBuy ? "primary" : "sell"}
            />
          </View>
        ) : null}
        <Pressable
          testID="select-match-cancel"
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [
            styles.cancel,
            pressed ? styles.cancelPressed : null,
          ]}
        >
          <Text style={styles.cancelLabel}>
            {isBuy ? tr("Cancel request") : tr("Cancel offer")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  back: { width: 36, height: 36, justifyContent: "center" },
  title: {
    ...typography.headline,
    ...brandWeight("700"),
    color: color.text.primary,
  },
  content: {
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  summary: {
    backgroundColor: color.bg.sunken,
    borderRadius: 16,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    alignItems: "center",
    gap: 10,
  },
  summaryLine: {
    ...typography.caption,
    fontSize: 13,
    color: color.text.primary,
  },
  summaryStrong: { ...brandWeight("700"), color: color.text.primary },
  summaryMuted: { color: color.text.secondary },
  summaryNote: {
    ...typography.caption,
    fontSize: 11,
    color: color.text.secondary,
  },
  rule: {
    alignSelf: "stretch",
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.subtle,
  },
  empty: {
    ...typography.body,
    color: color.text.secondary,
    textAlign: "center",
    paddingVertical: space.md,
  },
  footer: { paddingHorizontal: space.md, paddingTop: space.xs, gap: space.xs },
  selection: { gap: space.xs },
  selectionText: {
    ...typography.caption,
    fontSize: 13,
    color: color.text.secondary,
    textAlign: "center",
  },
  cancel: {
    minHeight: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.error.fill,
  },
  cancelPressed: { opacity: 0.9 },
  // White on error.fill (#EF4444) is 3.76:1: label is large text (19 pt bold).
  cancelLabel: {
    ...brandWeight("700"),
    fontSize: 19,
    color: color.text.onFill,
  },
}));
