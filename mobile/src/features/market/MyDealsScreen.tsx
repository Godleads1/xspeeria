/**
 * My Deals (Market ⋮ menu, ADR-033): every Match where you took an offer or someone took
 * yours, newest first, from the server (`GET /v1/matches/mine`, ADR-031).
 *
 * A deal is a record of who agreed to exchange how much at what rate — information, not
 * money. Each deal says what comes next: choosing payout accounts, then the escrow steps
 * (ADR-037), where both sides pay into the partner bank's escrow. No Figma frame exists yet; it reuses the My Offers styles.
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

/** Where the deal stands: the 30-minute payout-account step (ADR-035/036), then escrow (ADR-037). */
export function dealStep(m: ServerMatch, now: number): { text: string; canChoose: boolean; canOpenEscrow?: boolean } {
  switch (m.preparation_state) {
    case 'funding_ready':
      return { text: 'Payout accounts chosen by both sides. Next: pay into escrow.', canChoose: false, canOpenEscrow: true };
    case 'expired':
      return { text: 'Cancelled: payout accounts were not chosen within 30 minutes. Nothing was paid.', canChoose: false };
    case 'awaiting_payout_accounts': {
      const ms = m.preparation_deadline ? Date.parse(m.preparation_deadline) - now : 0;
      const left = ms > 60_000 ? `${Math.floor(ms / 60_000)} min left` : 'less than a minute left';
      return m.you_chose_payout_accounts
        ? { text: `You chose your payout account. Waiting for the other side — ${left}.`, canChoose: true }
        : { text: `Choose your payout account — ${left}.`, canChoose: true };
    }
    default:
      return { text: 'Next: choose your payout account, then pay into escrow.', canChoose: false };
  }
}

export function MyDealsScreen({
  source,
  onBack,
  onChoose,
  onEscrow,
  refreshSignal = 0,
}: {
  source: MyDealsSource;
  onBack: () => void;
  /** Opens "choose payout accounts" for a deal (ADR-036). */
  onChoose?: (matchId: string) => void;
  /** Opens the escrow steps for a deal (ADR-037). */
  onEscrow?: (matchId: string) => void;
  refreshSignal?: number;
}): ReactElement {
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
  useEffect(load, [load, refreshSignal]);

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
              {(() => {
                const step = dealStep(m, Date.now());
                return (
                  <>
                    <Text testID={`deal-${m.match_id}-step`} style={styles.next}>{step.text}</Text>
                    {step.canChoose && onChoose ? (
                      <Pressable
                        testID={`deal-${m.match_id}-choose`}
                        accessibilityRole="button"
                        onPress={() => onChoose(m.match_id)}
                        hitSlop={8}
                        style={styles.choose}
                      >
                        <Text style={styles.chooseText}>
                          {m.you_chose_payout_accounts ? 'Change payout account' : 'Choose payout account'}
                        </Text>
                      </Pressable>
                    ) : null}
                    {step.canOpenEscrow && onEscrow ? (
                      <Pressable
                        testID={`deal-${m.match_id}-escrow`}
                        accessibilityRole="button"
                        onPress={() => onEscrow(m.match_id)}
                        hitSlop={8}
                        style={styles.choose}
                      >
                        <Text style={styles.chooseText}>Escrow steps</Text>
                      </Pressable>
                    ) : null}
                  </>
                );
              })()}
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
  next: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  choose: {
    alignSelf: "flex-start",
    marginTop: 4,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: color.brand.primary,
    justifyContent: "center",
  },
  chooseText: { ...typography.caption, ...brandWeight("700"), fontSize: 14, color: color.text.onFill },
}));
