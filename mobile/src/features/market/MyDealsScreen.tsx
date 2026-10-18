/**
 * My Deals (Market ⋮ menu, ADR-033): every Match where you took an offer or someone took
 * yours, newest first, from the server (`GET /v1/matches/mine`, ADR-031).
 *
 * A deal is a record of who agreed to exchange how much at what rate — information, not
 * money. Payout accounts and paying into the partner bank's escrow are later steps, so each
 * deal says what comes next. No Figma frame exists yet; it reuses the My Offers styles.
 */

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { messageFor } from "../../api/client";
import type { ServerMatch } from "../../api/offersApi";
import { Icon } from "../../components/icons";
import { EmptyState, ErrorState, LoadingState, Screen, StatusChip } from "../../components/primitives";
import { brandWeight, color, space, typography, themed } from "../../theme";
import { formatHundredths, parseToHundredths } from "./money";
import { groupedRate } from "./serverOffers";
import { ngnMinorFor } from "./TakeOfferScreen";

export interface MyDealsSource {
  list(): Promise<ServerMatch[]>;
}

function grouped(text: string): string {
  const [whole, frac = ""] = text.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? `.${frac}` : ""}`;
}

/** "18 Oct 2026, 17:05" in the phone's time zone; the server time is the record. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

/** The plain-language line for one deal, from your side. */
export function dealHeadline(m: ServerMatch): string {
  const amount = `${grouped(m.allocated_amount)} ${m.currency}`;
  const minor = /^[0-9]+(\.[0-9]{1,2})?$/.test(m.allocated_amount) ? parseToHundredths(m.allocated_amount) : null;
  // The NGN total is exact only when the deal is in the foreign currency (NGN per 1 unit).
  const ngn = m.currency !== "NGN" && minor !== null ? ngnMinorFor(minor, m.agreed_rate) : null;
  const other = ngn !== null ? ` for NGN ${formatHundredths(ngn)}` : "";
  return m.your_role === "taker" ? `You get ${amount}${other}` : `You give ${amount}${other}`;
}

export function MyDealsScreen({ source, onBack }: { source: MyDealsSource; onBack: () => void }): ReactElement {
  const [deals, setDeals] = useState<ServerMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setDeals(null);
    source
      .list()
      .then(setDeals)
      .catch((e: unknown) => setError(messageFor(e)));
  }, [source]);
  useEffect(load, [load]);

  return (
    <Screen testID="my-deals-screen">
      <View style={styles.header}>
        <Pressable testID="my-deals-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          My Deals
        </Text>
        <View style={styles.spacer} />
      </View>

      {error ? (
        <ErrorState title={error} onRetry={load} />
      ) : deals === null ? (
        <LoadingState label="Loading your deals" />
      ) : deals.length === 0 ? (
        <EmptyState title="No deals yet. Take an offer from Market › Buy, or wait for someone to take yours." />
      ) : (
        <View testID="my-deals-list" style={styles.list}>
          {deals.map((m) => (
            <View key={m.match_id} testID={`deal-${m.match_id}`} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.strong}>{dealHeadline(m)}</Text>
                <StatusChip label="Recorded" tone="success" />
              </View>
              <Text style={styles.line}>{`Rate: NGN ${groupedRate(m.agreed_rate)} /${m.currency === "NGN" ? m.counter_currency : m.currency}`}</Text>
              <Text style={styles.line}>
                {`${m.your_role === "taker" ? "You took an offer" : "Someone took your offer"} · ${when(m.accepted_at)}`}
              </Text>
              <Text style={styles.next}>Next: payout account and escrow payment — coming soon.</Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  spacer: { width: 24 },
  title: { ...brandWeight("700"), fontSize: 20, color: color.text.primary },
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
  next: { ...typography.caption, fontSize: 12, color: color.text.disabled },
}));
