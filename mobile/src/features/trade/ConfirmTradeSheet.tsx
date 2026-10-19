/**
 * Confirm trade (ADR-014; not in Figma). Shown when a match is tapped on Select Match:
 * amount, rate, the flat coordination fee and the total to transfer, plus the payout
 * account. The FAQ promises "the fee is shown before you confirm", and ADR-008 requires a
 * 2 FA re-check before accepting a trade (done by the caller after "Accept").
 *
 * Several listings can fill one request (ADR-019): the sheet lists each part, its rate and
 * the totals, with one coordination fee per trade. Amounts are the ones the user picked;
 * if a listing has been taken since, the sheet says so and cannot be accepted — it never
 * shrinks a part silently (Standing Standards §7.3).
 */

import type { ReactElement } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { Icon } from "../../components/icons";
import { PrimaryButton } from "../../components/primitives";
import { brandWeight, color, space, themed, typography } from "../../theme";
import type { Side } from "../market/MarketScreen";
import { formatHundredths } from "../market/money";
import { planTotals, type FillPlan } from "./fillPlan";
import { FUNDING_WINDOW_MS, tradeStore, useTrades } from "./tradeStore";
import { COORDINATION_FEE_LABEL } from "../history/data";
import { tr } from "../../i18n";

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): ReactElement {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={strong ? styles.valueStrong : styles.value}>{value}</Text>
    </View>
  );
}

export function ConfirmTradeSheet({
  side,
  requestedMinor,
  parts,
  onAccept,
  onClose,
}: {
  side: Side;
  requestedMinor: number;
  /** Listings the user picked and the amount taken from each (fillPlan.ts). */
  parts: FillPlan;
  /** Next: choose the payout accounts (Payout Destination, ADR-022). */
  onAccept: (parts: FillPlan) => void;
  onClose: () => void;
}): ReactElement {
  useTrades(); // re-check what is left when trades change
  // A listing may have been taken since it was picked: never shrink a part silently.
  const stale = parts.some((p) => p.amountMinor > tradeStore.remainingMinor(p.listing));
  const cur = parts[0]?.listing.currency ?? "";
  const totals = planTotals(side, parts);
  const several = parts.length > 1;
  const short = totals.foreignMinor < requestedMinor;
  const receiveCur = side === "buy" ? cur : "NGN";
  const receiveMinor = side === "buy" ? totals.foreignMinor : totals.ngnMinor;
  const minutes = Math.round(FUNDING_WINDOW_MS / 60000);
  const canAccept = !stale && parts.length > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.scrim}
        accessibilityLabel={tr("Close")}
        onPress={onClose}
      />
      <View testID="confirm-trade" style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text accessibilityRole="header" style={styles.title}>
            {several ? tr("Confirm {{length}} trades", { length: parts.length }) : tr("Confirm trade")}
          </Text>
          {short ? (
            <Text testID="confirm-partial" style={styles.notice}>
              {(() => {
                const v = { asked: formatHundredths(requestedMinor), filled: formatHundredths(totals.foreignMinor), cur, count: parts.length };
                const isBuy = side === "buy";
                if (several) {
                  return isBuy
                    ? tr("You asked for {{asked}} {{cur}}. These {{count}} offers fill {{filled}} {{cur}}. You can go back and add more offers.", v)
                    : tr("You asked for {{asked}} {{cur}}. These {{count}} requests fill {{filled}} {{cur}}. You can go back and add more requests.", v);
                }
                return isBuy
                  ? tr("You asked for {{asked}} {{cur}}. This offer fills {{filled}} {{cur}}. You can go back and add more offers.", v)
                  : tr("You asked for {{asked}} {{cur}}. This request fills {{filled}} {{cur}}. You can go back and add more requests.", v);
              })()}
            </Text>
          ) : null}
          {stale ? (
            <Text testID="confirm-stale" style={styles.notice}>{side === "buy"
                ? several ? tr("Someone else took part of one of these offers. Go back and choose again.") : tr("Someone else took part of this offer. Go back and choose again.")
                : several ? tr("Someone else took part of one of these requests. Go back and choose again.") : tr("Someone else took part of this request. Go back and choose again.")}</Text>
          ) : null}

          {several ? (
            <View testID="confirm-parts" style={styles.card}>
              {parts.map((p, i) => (
                <Row
                  key={p.listing.id}
                  label={`${i + 1}. ${formatHundredths(p.amountMinor)} ${cur}`}
                  value={`NGN ${formatHundredths(p.listing.rateHundredths)}/${cur}`}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <Row
              label={side === "buy" ? tr("You buy") : tr("You sell")}
              value={`${formatHundredths(totals.foreignMinor)} ${cur}`}
              strong
            />
            {several ? null : (
              <Row
                label={tr("Rate")}
                value={`NGN ${formatHundredths(parts[0]?.listing.rateHundredths ?? 0)}/${cur}`}
              />
            )}
            {side === "buy" ? (
              <>
                <Row label={tr("Amount")} value={`${formatHundredths(totals.ngnMinor)} NGN`} />
                <Row
                  label={tr("Coordination fee ({{COORDINATION_FEE_LABEL}})", { COORDINATION_FEE_LABEL })}
                  value={`${formatHundredths(totals.feeMinor)} NGN`}
                />
                <Row
                  label={tr("Total to transfer")}
                  value={`${formatHundredths(totals.transferMinor)} NGN`}
                  strong
                />
              </>
            ) : (
              <>
                <Row
                  label={tr("You receive")}
                  value={`${formatHundredths(totals.ngnMinor)} NGN`}
                />
                <Row
                  label={tr("Coordination fee ({{COORDINATION_FEE_LABEL}})", { COORDINATION_FEE_LABEL })}
                  value={`${formatHundredths(totals.feeMinor)} ${cur}`}
                />
                <Row
                  label={tr("You transfer")}
                  value={`${formatHundredths(totals.transferMinor)} ${cur}`}
                  strong
                />
              </>
            )}
          </View>

          <View testID="confirm-receive" style={styles.card}>
            {side === "buy" ? (
              <Row label={tr("You receive")} value={`${formatHundredths(receiveMinor)} ${receiveCur}`} strong />
            ) : null}
            <Text style={styles.feeNote}>{tr("Next, choose the accounts in your name that the partner bank pays.")}</Text>
          </View>

          <View style={styles.hint}>
            <Icon name="info" color={color.text.secondary} size={16} />
            <Text style={styles.hintText}>
              {several
                ? (side === "buy"
                  ? tr("Each offer is a separate trade with its own transfer and reference. After you accept, you have {{minutes}} minutes to make each transfer from a bank account in your own name.", { minutes })
                  : tr("Each request is a separate trade with its own transfer and reference. After you accept, you have {{minutes}} minutes to make each transfer from a bank account in your own name.", { minutes }))
                : tr("After you accept, you have {{minutes}} minutes to transfer from a bank account in your own name.", { minutes })}{" "}{tr("Xspeeria never holds your money: it goes into a partner bank’s escrow account.")}</Text>
          </View>
        </ScrollView>
        <View style={styles.actions}>
          <PrimaryButton
            testID="confirm-accept"
            label={tr("Continue")}
            onPress={canAccept ? () => onAccept(parts) : undefined}
            disabled={!canAccept}
            tone={side === "sell" ? "sell" : "primary"}
          />
          <Pressable
            testID="confirm-cancel"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>{tr("Cancel")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  scrim: { flex: 1, backgroundColor: color.bg.overlay },
  sheet: {
    maxHeight: "88%",
    backgroundColor: color.bg.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: space.md,
  },
  body: { padding: space.md, gap: space.sm },
  title: {
    ...typography.headline,
    ...brandWeight("700"),
    fontSize: 20,
    color: color.text.primary,
  },
  notice: {
    ...typography.caption,
    color: color.warning.text,
    backgroundColor: color.warning.surface,
    padding: 10,
    borderRadius: 8,
  },
  card: {
    backgroundColor: color.bg.sunken,
    borderRadius: 16,
    padding: space.sm,
    gap: 10,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { ...typography.body, fontSize: 14, color: color.text.secondary },
  value: {
    ...typography.body,
    fontSize: 14,
    color: color.text.primary,
    fontVariant: ["tabular-nums"],
  },
  valueStrong: {
    ...typography.body,
    ...brandWeight("700"),
    fontSize: 15,
    color: color.text.primary,
    fontVariant: ["tabular-nums"],
  },
  section: {
    ...typography.body,
    ...brandWeight("500"),
    fontSize: 14,
    color: color.text.secondary,
    marginTop: space.xs,
  },
  option: {
    gap: 4,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: 12,
    padding: 14,
  },
  optionOn: { borderColor: color.brand.primary },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.border.strong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: color.brand.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.brand.primary,
  },
  optionText: { ...typography.body, fontSize: 15, color: color.text.primary },
  optionMain: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 32 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: color.border.strong,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { borderColor: color.brand.fill, backgroundColor: color.brand.fill },
  shareField: { marginTop: space.xs },
  shareAll: { ...typography.caption, fontSize: 12, color: color.text.secondary, marginTop: 4 },
  splitError: { ...typography.caption, fontSize: 12, color: color.error.text },
  empty: {
    gap: 6,
    padding: space.sm,
    borderRadius: 12,
    backgroundColor: color.bg.sunken,
  },
  emptyText: { ...typography.body, fontSize: 14, color: color.text.primary },
  link: {
    ...typography.body,
    ...brandWeight("700"),
    color: color.brand.primary,
  },
  feeNote: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  hint: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  hintText: {
    flex: 1,
    ...typography.caption,
    fontSize: 12,
    color: color.text.secondary,
  },
  actions: { paddingHorizontal: space.md, gap: 4 },
  cancel: { alignSelf: "center", paddingVertical: 12 },
  cancelText: {
    ...typography.body,
    ...brandWeight("700"),
    color: color.error.text,
  },
}));
