/**
 * Market (Figma frames 79:399, 1019:11897 and 94:557 for Buy; 436:7771 for Sell), ADR-005.
 *
 * Buy: pick the currency to buy, the amount and the NGN rate you will pay → "Create
 * request"; below, sell offers you can take. Sell: the amount of foreign currency to
 * sell, the currency to receive and your rate → "Create Offer"; below, buy requests you
 * can fill. Xspeeria never holds the money: a match leads to bank escrow, not a balance.
 *
 * Demo builds use mock data. With `server` (a development build pointed at a real server,
 * ADR-030) Buy lists real offers, tapping one opens Take offer (ADR-032), and Sell's "Create
 * Offer" publishes one; buy requests are not built on the server yet, and the screen says so. All amounts and
 * rates are parsed to integers (`money.ts`); the server re-validates everything.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { RoundFlag } from "../../components/flags";
import { Icon } from "../../components/icons";
import { Screen } from "../../components/primitives";
import { brandWeight, color, space, typography, themed } from "../../theme";
import { SectionLabel } from "../home/SectionLabel";
import {
  ActionSheet,
  BuySellToggle,
  CurrencyChip,
  CurrencySheet,
  FieldInput,
  ListingRow,
  OutlinedField,
  RoundButton,
} from "./controls";
import {
  BUYABLE,
  MARKET_BAND,
  NGN,
  RECEIVABLE,
  listingsFor,
  type Currency,
  type Listing,
} from "./data";
import { formatHundredths, matchPotential, parseToHundredths, quoteMinorOrNull } from "./money";
import { OFFICIAL_RATE_AS_OF, officialRateFor, rateProblem } from "./rateCeiling";
import type { MarketServer } from "./serverOffers";
import { messageFor } from "../../api/client";

export type Side = "buy" | "sell";

export interface TradeRequest {
  readonly side: Side;
  /** Foreign currency code (what the buyer receives / the seller gives). */
  readonly currency: string;
  readonly amountMinor: number;
  readonly rateHundredths: number;
}

const SELL_CURRENCY = BUYABLE[0]; // Figma Sell frame: USD.

/** Figma Market ⋮ menu (product-owner reference, 2026-10-17). */
export type MenuKey = "requests" | "offers" | "deals" | "disputes" | "forecast";
const MENU: readonly { key: MenuKey; label: string; hint?: string }[] = [
  { key: "requests", label: "My Requests", hint: "(Buy)" },
  { key: "offers", label: "My Offers", hint: "(Sell)" },
  { key: "disputes", label: "Disputes" },
  { key: "forecast", label: "AI Rate Forecasting" },
];

const ADVERT = require("../../../assets/images/market-advert.png");

export function MarketScreen({
  initialSide = "buy",
  onCreate,
  onTakeListing,
  onMenu,
  server = null,
  refreshSignal = 0,
}: {
  /** Changes when the screen comes back into view, so server offers are fetched again. */
  refreshSignal?: number;
  initialSide?: Side;
  /** Real offers from the server (ADR-030). Null: demo data. */
  server?: MarketServer | null;
  /** ⋮ menu destination; until each screen exists the menu explains it is coming. */
  onMenu?: (key: MenuKey) => void;
  onCreate?: (request: TradeRequest) => void;
  onTakeListing?: (listing: Listing, side: Side) => void;
}): ReactElement {
  const [side, setSide] = useState<Side>(initialSide);
  const [buyCurrency, setBuyCurrency] = useState<Currency | null>(null);
  const [receive, setReceive] = useState<Currency>(NGN);
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [sheet, setSheet] = useState(false);
  const [cheapestFirst, setCheapestFirst] = useState(true);
  const [menu, setMenu] = useState(false);
  // Server mode (ADR-030).
  const [serverRows, setServerRows] = useState<Listing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  /** One key per offer being published, kept across retries so a retry never doubles it. */
  const pendingKey = useRef<string | null>(null);

  const foreign = side === "buy" ? buyCurrency : SELL_CURRENCY;
  const band = foreign ? MARKET_BAND[foreign.code] : undefined;
  const amountMinor = parseToHundredths(amount);
  const rateHundredths = parseToHundredths(rate);
  const potential =
    band && rateHundredths !== null && (!foreign || rateProblem(foreign.code, rateHundredths) === null)
      ? matchPotential(side, rateHundredths, band)
      : null;
  // The official rate is the maximum (rateCeiling.ts, Standing Standards §7.2).
  const official = foreign ? officialRateFor(foreign.code) : null;
  const problem =
    foreign && rateHundredths !== null ? rateProblem(foreign.code, rateHundredths) : null;
  const rateError =
    problem === "above-official" && foreign && official !== null
      ? `Your rate can’t be above the official rate of NGN ${formatHundredths(official)} per ${foreign.code}.`
      : problem === "official-unavailable"
        ? `There’s no official rate for ${foreign?.code ?? "this currency"} yet, so you can’t trade it for now.`
        : null;
  // An amount whose NGN value cannot be computed safely is not a valid request (FIN-06).
  const ready =
    foreign !== null &&
    amountMinor !== null &&
    rateHundredths !== null &&
    problem === null &&
    quoteMinorOrNull(amountMinor, rateHundredths) !== null;

  const foreignCode = foreign?.code ?? null;
  useEffect(() => {
    if (!server || side !== "buy" || !foreignCode) return undefined;
    let live = true;
    setServerRows(null);
    setLoadError(null);
    server
      .offersFor(foreignCode, Date.now())
      .then((rows) => {
        if (live) setServerRows(rows);
      })
      .catch((e: unknown) => {
        if (live) setLoadError(messageFor(e));
      });
    return () => {
      live = false;
    };
  }, [server, side, foreignCode, reload, refreshSignal]);

  const listings = useMemo(() => {
    if (!foreign) return [];
    const list = server
      ? side === "buy"
        ? (serverRows ?? [])
        : []
      : listingsFor(side, foreign.code);
    return cheapestFirst ? list : [...list].reverse();
  }, [side, foreign, cheapestFirst, server, serverRows]);

  const switchSide = (next: Side): void => {
    setSide(next);
    setAmount("");
    setRate("");
    setNotice(null);
    pendingKey.current = null;
  };

  const editAmount = (v: string): void => {
    setAmount(v);
    pendingKey.current = null;
  };
  const editRate = (v: string): void => {
    setRate(v);
    pendingKey.current = null;
  };

  const publish = async (code: string, amt: number, rt: number): Promise<void> => {
    if (!server) return;
    pendingKey.current ??= server.newKey();
    setBusy(true);
    setNotice(null);
    try {
      await server.publishSell(code, amt, rt, pendingKey.current);
      pendingKey.current = null;
      setAmount("");
      setRate("");
      setNotice({
        ok: true,
        text: `Your offer to sell ${formatHundredths(amt)} ${code} at NGN ${formatHundredths(rt)} is live. See it under ⋮ › My Offers.`,
      });
    } catch (e) {
      setNotice({ ok: false, text: messageFor(e) });
    } finally {
      setBusy(false);
    }
  };

  const create = (): void => {
    if (!ready || !foreign || amountMinor === null || rateHundredths === null)
      return;
    if (server) {
      if (side === "buy") {
        setNotice({
          ok: false,
          text: "Buy requests are coming soon. For now you can see the offers below.",
        });
        return;
      }
      void publish(foreign.code, amountMinor, rateHundredths);
      return;
    }
    onCreate?.({ side, currency: foreign.code, amountMinor, rateHundredths });
  };

  const take = (listing: Listing): void => {
    if (server && listing.own) {
      setNotice({ ok: false, text: "This is your offer. Manage it under ⋮ › My Offers." });
      return;
    }
    // Server mode: the route opens Take offer (ADR-032), which reads the offer fresh.
    onTakeListing?.(listing, side);
  };
  const canCreate = ready && !busy && (server !== null || onCreate !== undefined);

  const trendText =
    band && foreign
      ? `Current Market Trend:  ${formatHundredths(band.low)} - ${formatHundredths(band.high)} NGN = 1 ${foreign.code}`
      : "Current Market Trend:  -----------";

  const amountField = (
    <OutlinedField
      label={
        side === "buy"
          ? `Amount in “${foreign?.code ?? "USD"}” *`
          : `Amount in “${SELL_CURRENCY.code}” to sell *`
      }
    >
      <FieldInput
        testID="market-amount"
        accessibilityLabel={`Amount in ${foreign?.code ?? "USD"}`}
        value={amount}
        onChangeText={editAmount}
      />
    </OutlinedField>
  );

  const currencyField = (
    <OutlinedField
      label={
        side === "buy"
          ? "Select Currency to buy *"
          : "Select Currency to Receive *"
      }
    >
      <Pressable
        testID="market-currency"
        accessibilityRole="button"
        accessibilityLabel={
          side === "buy"
            ? "Select currency to buy"
            : "Select currency to receive"
        }
        onPress={() => setSheet(true)}
        style={styles.select}
      >
        {side === "buy" && buyCurrency ? (
          <View style={styles.selectChoice}>
            <RoundFlag code={buyCurrency.code} size={28} />
            <Text style={styles.selectValue}>{buyCurrency.code}</Text>
          </View>
        ) : side === "sell" ? (
          <View style={styles.selectChoice}>
            <RoundFlag code={receive.code} size={28} />
            <Text style={styles.selectValue}>{receive.code}</Text>
          </View>
        ) : (
          <Text style={styles.selectPlaceholder}> </Text>
        )}
        <Icon name="caret" color={color.text.secondary} size={22} />
      </Pressable>
    </OutlinedField>
  );

  return (
    <Screen testID="marketplace-screen">
      <View style={styles.header}>
        <BuySellToggle side={side} onChange={switchSide} />
        <View style={styles.headerActions}>
          <CurrencyChip currency={side === "buy" ? NGN : SELL_CURRENCY} />
          <RoundButton
            icon="bell"
            label="Notifications"
            testID="market-notifications"
          />
          <RoundButton
            icon="more"
            label="More options"
            testID="market-more"
            onPress={() => setMenu(true)}
          />
        </View>
      </View>

      <View style={styles.form}>
        {side === "buy" ? currencyField : amountField}
        {side === "buy" ? amountField : currencyField}

        <View style={styles.trend}>
          <Text testID="market-trend" style={styles.trendText}>
            {trendText}
          </Text>
          {band ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  "Current market trend",
                  "The range of rates in recent matched trades on Xspeeria. Rates inside it are more likely to find a match. Illustrative data.",
                )
              }
              hitSlop={8}
              style={styles.details}
            >
              <Icon name="info" color={color.error.text} size={14} />
              <Text style={styles.detailsText}>See Details</Text>
            </Pressable>
          ) : null}
        </View>

        <OutlinedField label="Rate *" invalid={rateError !== null}>
          <FieldInput
            testID="market-rate"
            accessibilityLabel={`Rate in NGN per ${foreign?.code ?? "unit"}`}
            value={rate}
            onChangeText={editRate}
            trailing={
              potential !== null ? (
                <View
                  testID="market-potential"
                  style={[
                    styles.potential,
                    potential >= 50
                      ? styles.potentialGood
                      : styles.potentialLow,
                  ]}
                >
                  <Text
                    style={[
                      styles.potentialText,
                      {
                        color:
                          potential >= 50
                            ? color.success.text
                            : color.error.text,
                      },
                    ]}
                  >
                    {`${potential}% Match Potential`}
                  </Text>
                </View>
              ) : null
            }
          />
        </OutlinedField>
        {foreign && official !== null ? (
          <Text testID="market-official" style={styles.official}>
            {`Official rate (CBN, ${OFFICIAL_RATE_AS_OF}): NGN ${formatHundredths(official)} per ${foreign.code}. Your rate must be this or lower.`}
          </Text>
        ) : null}
        {rateError ? (
          <Text testID="market-rate-error" accessibilityRole="alert" style={styles.rateError}>
            {rateError}
          </Text>
        ) : null}

        <Pressable
          testID="market-create"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate, busy }}
          disabled={!canCreate}
          onPress={create}
          style={({ pressed }) => [
            styles.create,
            {
              backgroundColor:
                side === "buy" ? color.brand.primary : color.trade.sell,
            },
            !canCreate ? styles.createDisabled : null,
            pressed ? styles.createPressed : null,
          ]}
        >
          <Text style={styles.createLabel}>
            {busy ? "Publishing…" : side === "buy" ? "Create request" : "Create Offer"}
          </Text>
        </Pressable>
        {notice ? (
          <Text
            testID="market-notice"
            accessibilityRole="alert"
            style={notice.ok ? styles.noticeOk : styles.rateError}
          >
            {notice.text}
          </Text>
        ) : null}
      </View>

      <View style={styles.listHeader}>
        <SectionLabel>
          {side === "buy"
            ? "Available offers"
            : `Available ${SELL_CURRENCY.code} request`}
        </SectionLabel>
        <Pressable
          testID="market-sort"
          accessibilityRole="button"
          accessibilityLabel={
            cheapestFirst
              ? "Sorted by best rate. Reverse order"
              : "Reversed. Sort by best rate"
          }
          onPress={() => setCheapestFirst((v) => !v)}
          hitSlop={10}
        >
          <Icon name="sort" color={color.text.primary} size={22} />
        </Pressable>
      </View>

      {server && side === "buy" && foreign && loadError ? (
        <View style={styles.loadError}>
          <Text testID="market-load-error" accessibilityRole="alert" style={styles.empty}>
            {loadError}
          </Text>
          <Pressable
            testID="market-retry"
            accessibilityRole="button"
            onPress={() => setReload((n) => n + 1)}
            hitSlop={8}
          >
            <Text style={styles.detailsText}>Try again</Text>
          </Pressable>
        </View>
      ) : server && side === "buy" && foreign && serverRows === null ? (
        <Text testID="market-loading" style={styles.empty}>
          Loading offers…
        </Text>
      ) : listings.length === 0 ? (
        <Text testID="market-empty" style={styles.empty}>
          {server && side === "sell"
            ? "Buy requests are coming soon."
            : foreign
              ? `No ${side === "buy" ? "offers" : "requests"} for ${foreign.code} right now`
              : "Select a currency to buy to see available offers"}
        </Text>
      ) : (
        <View testID="market-listings">
          {listings.map((l) => (
            <ListingRow key={l.id} listing={l} side={side} onAction={take} />
          ))}
        </View>
      )}

      {side === "buy" ? (
        <View testID="market-advert" style={styles.advert}>
          {/* Figma advert slot (node 787:4204). PLACEHOLDER artwork supplied by the product
              owner; the stock photo needs a confirmed licence before release. */}
          <Image
            source={ADVERT}
            accessibilityLabel="Place advert here"
            resizeMode="cover"
            style={styles.advertImage}
          />
        </View>
      ) : null}

      <ActionSheet
        testID="market-menu"
        visible={menu}
        onClose={() => setMenu(false)}
        actions={(server
          ? // Server builds also list the deals you made or received (ADR-033).
            [...MENU.slice(0, 2), { key: "deals" as const, label: "My Deals" }, ...MENU.slice(2)]
          : MENU
        ).map((item) => ({
          ...item,
          onPress: () => {
            setMenu(false);
            if (onMenu) onMenu(item.key);
            else
              Alert.alert(
                item.label,
                `${item.label} is one of the next screens to be built.`,
              );
          },
        }))}
      />

      <CurrencySheet
        visible={sheet}
        title={
          side === "buy"
            ? "Currencies you can buy"
            : "Currencies you are licensed to receive"
        }
        currencies={side === "buy" ? BUYABLE : RECEIVABLE}
        onClose={() => setSheet(false)}
        onSelect={(c) => {
          if (side === "buy") {
            setBuyCurrency(c);
            setReload((n) => n + 1);
          }
          else setReceive(c);
          setSheet(false);
        }}
      />
    </Screen>
  );
}

const styles = themed(() => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  form: { gap: space.sm },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
  },
  selectChoice: { flexDirection: "row", alignItems: "center", gap: 12 },
  selectValue: { ...typography.body, fontSize: 17, color: color.text.primary },
  selectPlaceholder: { ...typography.body },
  trend: { alignItems: "flex-end", gap: 4, marginTop: -6 },
  trendText: {
    ...typography.caption,
    fontSize: 11,
    color: color.text.secondary,
  },
  details: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailsText: { ...typography.caption, fontSize: 11, color: color.error.text },
  official: { ...typography.caption, fontSize: 12, color: color.text.secondary, marginTop: -6 },
  rateError: { ...typography.caption, fontSize: 12, color: color.error.text, marginTop: -6 },
  noticeOk: { ...typography.caption, fontSize: 12, color: color.success.text, marginTop: -6 },
  loadError: { alignItems: "center", gap: 4 },
  potential: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  potentialGood: { backgroundColor: color.success.surface },
  potentialLow: { backgroundColor: color.error.surface },
  potentialText: { ...typography.caption, fontSize: 10, lineHeight: 12 },
  create: {
    minHeight: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: color.bg.inverse,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  // Figma's disabled "Create request" is the same button faded; the label stays readable.
  createDisabled: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  createPressed: { opacity: 0.9 },
  // 19 pt bold: large text, so white also passes on the Sell green (4.37:1).
  createLabel: {
    ...brandWeight("700"),
    fontSize: 19,
    color: color.text.onFill,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border.subtle,
  },
  empty: {
    ...typography.caption,
    fontSize: 13,
    color: color.text.disabled,
    textAlign: "center",
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
  },
  // Figma: 342 wide, radius 10, 1 pt #9CA3AF border. Height follows the product owner's
  // 342 × 113 artwork (2026-10-18) so its text is never cropped.
  advert: {
    aspectRatio: 342 / 113,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.text.disabled,
    backgroundColor: color.trade.advert,
    overflow: "hidden",
  },
  advertImage: { width: "100%", height: "100%" },
}));
