/**
 * Confirm trade (ADR-014; not in Figma). Shown when a match is tapped on Select Match:
 * amount, rate, the flat coordination fee and the total to transfer, plus the payout
 * account. The FAQ promises "the fee is shown before you confirm", and ADR-008 requires a
 * 2 FA re-check before accepting a trade (done by the caller after "Accept"). If the match
 * can fill less than was asked, the smaller amount is shown plainly — never resized silently.
 */

import { useState, type ReactElement } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { Icon } from "../../components/icons";
import { PrimaryButton } from "../../components/primitives";
import { brandWeight, color, space, themed, typography } from "../../theme";
import type { Listing } from "../market/data";
import type { Side } from "../market/MarketScreen";
import { formatHundredths } from "../market/money";
import type { Beneficiary } from "../profile/data";
import { FUNDING_WINDOW_MS, ngnFor, transferFor } from "./tradeStore";
import { COORDINATION_FEE_KOBO, sellerFeeMinor } from "../history/data";

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
  listing,
  payoutOptions,
  onAccept,
  onClose,
  onAddAccount,
}: {
  side: Side;
  requestedMinor: number;
  listing: Listing;
  /** The user's own verified accounts in the currency they will receive. */
  payoutOptions: readonly Beneficiary[];
  onAccept: (amountMinor: number, payout: Beneficiary) => void;
  onClose: () => void;
  onAddAccount: () => void;
}): ReactElement {
  const amountMinor = Math.min(requestedMinor, listing.availableMinor);
  const partial = amountMinor < requestedMinor;
  const cur = listing.currency;
  const ngn = ngnFor(amountMinor, listing.rateHundredths);
  const transfer = transferFor(side, cur, amountMinor, listing.rateHundredths);
  const receiveCur = side === "buy" ? cur : "NGN";
  const [payoutId, setPayoutId] = useState<string | null>(
    payoutOptions[0]?.id ?? null,
  );
  const payout = payoutOptions.find((b) => b.id === payoutId) ?? null;
  const minutes = Math.round(FUNDING_WINDOW_MS / 60000);
  const sellerFee = side === "sell" ? sellerFeeMinor(cur) : null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.scrim}
        accessibilityLabel="Close"
        onPress={onClose}
      />
      <View testID="confirm-trade" style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text accessibilityRole="header" style={styles.title}>
            Confirm trade
          </Text>
          {partial ? (
            <Text testID="confirm-partial" style={styles.notice}>
              You asked for {formatHundredths(requestedMinor)} {cur}. This{" "}
              {side === "buy" ? "offer" : "request"} has{" "}
              {formatHundredths(listing.availableMinor)} {cur}, so this trade is
              for {formatHundredths(amountMinor)} {cur}.
            </Text>
          ) : null}
          <View style={styles.card}>
            <Row
              label={side === "buy" ? "You buy" : "You sell"}
              value={`${formatHundredths(amountMinor)} ${cur}`}
              strong
            />
            <Row
              label="Rate"
              value={`NGN ${formatHundredths(listing.rateHundredths)}/${cur}`}
            />
            {side === "buy" ? (
              <>
                <Row label="Amount" value={`${formatHundredths(ngn)} NGN`} />
                <Row
                  label="Coordination fee"
                  value={`${formatHundredths(COORDINATION_FEE_KOBO)} NGN`}
                />
                <Row
                  label="Total to transfer"
                  value={`${formatHundredths(transfer.minor)} NGN`}
                  strong
                />
              </>
            ) : (
              <>
                <Row
                  label="You receive"
                  value={`${formatHundredths(ngn)} NGN`}
                />
                <Row
                  label="Coordination fee"
                  value={
                    sellerFee === null
                      ? `To be confirmed (${cur})`
                      : `${formatHundredths(sellerFee)} ${cur}`
                  }
                />
                <Row
                  label="You transfer"
                  value={`${formatHundredths(transfer.minor + (sellerFee ?? 0))} ${cur}`}
                  strong
                />
                {sellerFee === null ? (
                  <Text testID="confirm-fee-tbd" style={styles.feeNote}>
                    The seller’s fee is paid in {cur}. Its amount is not set yet
                    in this demo.
                  </Text>
                ) : null}
              </>
            )}
          </View>

          <Text style={styles.section}>Receive into</Text>
          {payoutOptions.length === 0 ? (
            <View testID="confirm-no-account" style={styles.empty}>
              <Text style={styles.emptyText}>
                Add a {receiveCur} account in your name to receive the money.
              </Text>
              <Pressable
                testID="confirm-add-account"
                accessibilityRole="button"
                onPress={onAddAccount}
              >
                <Text style={styles.link}>Add account</Text>
              </Pressable>
            </View>
          ) : (
            payoutOptions.map((b) => {
              const on = b.id === payoutId;
              return (
                <Pressable
                  key={b.id}
                  testID={`confirm-payout-${b.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setPayoutId(b.id)}
                  style={[styles.option, on ? styles.optionOn : null]}
                >
                  <View style={[styles.radio, on ? styles.radioOn : null]}>
                    {on ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={styles.optionText}>
                    {b.bank} •••• {b.accountLast4}
                  </Text>
                </Pressable>
              );
            })
          )}

          <View style={styles.hint}>
            <Icon name="info" color={color.text.secondary} size={16} />
            <Text style={styles.hintText}>
              After you accept, you have {minutes} minutes to transfer from a
              bank account in your own name. Xspeeria never holds your money: it
              goes into a partner bank’s escrow account.
            </Text>
          </View>
        </ScrollView>
        <View style={styles.actions}>
          <PrimaryButton
            testID="confirm-accept"
            label={side === "buy" ? "Accept offer" : "Accept request"}
            onPress={payout ? () => onAccept(amountMinor, payout) : undefined}
            disabled={!payout}
            tone={side === "sell" ? "sell" : "primary"}
          />
          <Pressable
            testID="confirm-cancel"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
