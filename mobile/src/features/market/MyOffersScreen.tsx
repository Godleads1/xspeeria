/**
 * My Offers (Market ⋮ menu, ADR-030): the signed-in user's offers on the server, open ones
 * first, each with a Withdraw button. Withdrawing closes the rest of the offer to new
 * matches; anything already matched is kept (contract §3.4).
 *
 * An offer is a record of what you are willing to exchange — information, not money.
 * No Figma frame exists for this screen yet; it reuses the Market row styles.
 */

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { messageFor } from "../../api/client";
import type { ServerOffer } from "../../api/offersApi";
import { Icon } from "../../components/icons";
import { EmptyState, ErrorState, LoadingState, Screen, StatusChip, type StatusTone } from "../../components/primitives";
import { brandWeight, color, space, typography, themed } from "../../theme";
import { groupedRate } from "./serverOffers";

export interface MyOffersSource {
  list(): Promise<ServerOffer[]>;
  withdraw(offerId: string): Promise<ServerOffer>;
}

const STATUS: Record<ServerOffer["status"], { label: string; tone: StatusTone }> = {
  open: { label: "Open", tone: "success" },
  partially_matched: { label: "Partly matched", tone: "warning" },
  fully_matched: { label: "Fully matched", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
};

const ACTIVE = new Set<ServerOffer["status"]>(["open", "partially_matched"]);

function grouped(text: string): string {
  const [whole, frac = ""] = text.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? `.${frac}` : ""}`;
}

export function MyOffersScreen({
  source,
  onBack,
}: {
  source: MyOffersSource;
  onBack: () => void;
}): ReactElement {
  const [offers, setOffers] = useState<ServerOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setOffers(null);
    source
      .list()
      .then(setOffers)
      .catch((e: unknown) => setError(messageFor(e)));
  }, [source]);

  useEffect(load, [load]);

  const withdraw = async (id: string): Promise<void> => {
    setWorking(id);
    setNotice(null);
    try {
      const updated = await source.withdraw(id);
      setOffers((list) => (list ?? []).map((o) => (o.offer_id === id ? updated : o)));
      setNotice("Offer withdrawn.");
    } catch (e) {
      setNotice(messageFor(e));
    } finally {
      setWorking(null);
      setConfirming(null);
    }
  };

  return (
    <Screen testID="my-offers-screen">
      <View style={styles.header}>
        <Pressable
          testID="my-offers-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={12}
        >
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          My Offers
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {notice ? (
        <Text testID="my-offers-notice" accessibilityRole="alert" style={styles.notice}>
          {notice}
        </Text>
      ) : null}

      {error ? (
        <ErrorState title={error} onRetry={load} />
      ) : offers === null ? (
        <LoadingState label="Loading your offers" />
      ) : offers.length === 0 ? (
        <EmptyState title="You have no offers yet. Create one from Market › Sell." />
      ) : (
        <View testID="my-offers-list" style={styles.list}>
          {offers.map((o) => {
            const foreign = o.source_currency === "NGN" ? o.target_currency : o.source_currency;
            const status = STATUS[o.status];
            const active = ACTIVE.has(o.status);
            const asking = confirming === o.offer_id;
            return (
              <View key={o.offer_id} testID={`my-offer-${o.offer_id}`} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.strong}>
                    {`Sell ${grouped(o.source_amount)} ${o.source_currency} → ${o.target_currency}`}
                  </Text>
                  <StatusChip label={status.label} tone={status.tone} />
                </View>
                <Text style={styles.line}>{`Rate: NGN ${groupedRate(o.desired_rate)} /${foreign}`}</Text>
                <Text style={styles.line}>
                  {active
                    ? `Matched: ${grouped(o.matched_amount)} · Left: ${grouped(o.remaining_amount)} ${o.source_currency}`
                    : `Matched: ${grouped(o.matched_amount)} ${o.source_currency}`}
                </Text>
                {active ? (
                  <Pressable
                    testID={`my-offer-${o.offer_id}-withdraw`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: working !== null, busy: working === o.offer_id }}
                    disabled={working !== null}
                    onPress={() => (asking ? void withdraw(o.offer_id) : setConfirming(o.offer_id))}
                    style={({ pressed }) => [styles.withdraw, asking ? styles.withdrawConfirm : null, pressed ? styles.pressed : null]}
                  >
                    <Text style={[styles.withdrawLabel, asking ? styles.withdrawConfirmLabel : null]}>
                      {working === o.offer_id ? "Withdrawing…" : asking ? "Tap again to withdraw" : "Withdraw"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerSpacer: { width: 24 },
  title: { ...brandWeight("700"), fontSize: 20, color: color.text.primary },
  notice: { ...typography.caption, fontSize: 13, color: color.text.secondary, textAlign: "center" },
  list: { gap: space.sm },
  row: {
    gap: 4,
    padding: space.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  strong: { ...typography.body, ...brandWeight("700"), color: color.text.primary, flexShrink: 1 },
  line: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  withdraw: {
    alignSelf: "flex-start",
    marginTop: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.error.text,
    justifyContent: "center",
  },
  withdrawConfirm: { backgroundColor: color.error.text },
  withdrawLabel: { ...typography.caption, fontSize: 14, color: color.error.text },
  withdrawConfirmLabel: { color: color.text.onFill },
  pressed: { opacity: 0.85 },
}));
