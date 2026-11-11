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
 * Offer" publishes one; "Create request" publishes a buy request, saved as an offer paying naira (ADR-056). All amounts and
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
  buyableNow,
  currencyOf,
  MARKET_BAND,
  NGN,
  RECEIVABLE,
  listingsFor,
  wantableWith,
  type Currency,
  type Listing,
} from "./data";
import { formatAmount, formatRate, matchPotential, parseAmount, parseRate } from "./money";
import { ceilingKey, convertAtMilli, quoteOf } from "./pairs";
import { DERIVED_CEILING, OFFICIAL_RATE_AS_OF, officialRateFor, rateProblem, type Ceilings } from "./rateCeiling";
import { payCurrencyOf, type MarketServer, type PayChoice } from "./serverOffers";
import { ApiError, messageFor } from "../../api/client";
import { AdvertCarousel, type AdvertSlide } from "./AdvertCarousel";
import { isKycCountry, type KycCountry } from "../../api/kycApi";
import { tr, k } from "../../i18n";

export type Side = "buy" | "sell";

export interface TradeRequest {
  readonly side: Side;
  /** Foreign currency code (what the buyer receives / the seller gives). */
  readonly currency: string;
  readonly amountMinor: number;
  readonly rateMilli: number;
}

const SELL_CURRENCY = BUYABLE[0]; // Figma Sell frame: USD.

/** Figma Market ⋮ menu (product-owner reference, 2026-10-17). */
export type MenuKey = "requests" | "offers" | "deals" | "disputes" | "forecast";
const MENU: readonly { key: MenuKey; label: string; hint?: string }[] = [
  { key: "requests", label: k("My Requests"), hint: k("(Buy)") },
  { key: "offers", label: k("My Offers"), hint: k("(Sell)") },
  { key: "disputes", label: k("Disputes") },
  { key: "forecast", label: k("AI Rate Forecasting") },
];

const ADVERT = require("../../../assets/images/market-advert.png");

function kycCountryOf(e: unknown): KycCountry | null {
  const c = e instanceof ApiError ? e.details?.country : null;
  return isKycCountry(c) ? c : null;
}

export function MarketScreen({
  initialSide = "buy",
  onCreate,
  onTakeListing,
  onMenu,
  onVerifyIdentity,
  onNotifications,
  unread = 0,
  server = null,
  refreshSignal = 0,
  onQueueListing,
  onMultiRequest,
  adverts = [],
  advertSeconds,
}: {
  /** ADR-067/086: the adverts staff placed (server builds), newest first; they take turns in
   * the slot. None shows the placeholder. */
  adverts?: readonly AdvertSlide[];
  /** ADR-086: seconds each advert stays before the next slides in (the server's setting). */
  advertSeconds?: number;
  /** ADR-059 Decision 5: opens "New buy request" in several currencies (server builds). */
  onMultiRequest?: () => void;
  /** ADR-059 Decision 4: join or leave the queue of a waiting offer; resolves with a note. */
  onQueueListing?: (listing: Listing) => Promise<string | null>;
  /** Changes when the screen comes back into view, so server offers are fetched again. */
  refreshSignal?: number;
  initialSide?: Side;
  /** Real offers from the server (ADR-030). Null: demo data. */
  server?: MarketServer | null;
  /** ⋮ menu destination; until each screen exists the menu explains it is coming. */
  onMenu?: (key: MenuKey) => void;
  onCreate?: (request: TradeRequest) => void;
  onTakeListing?: (listing: Listing, side: Side) => void;
  /** Server builds: opens the identity check when the server says KYC is needed (ADR-040). */
  /** Opens the identity check; with a country when the server asked for that one (ADR-042). */
  onVerifyIdentity?: (country?: KycCountry) => void;
  /** Opens the notification centre (ADR-044). */
  onNotifications?: () => void;
  unread?: number;
}): ReactElement {
  const [side, setSide] = useState<Side>(initialSide);
  const [buyCurrency, setBuyCurrency] = useState<Currency | null>(null);
  const [receive, setReceive] = useState<Currency | null>(NGN);
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  /** Which picker is open: the currency you want / receive, or (ADR-111) the one you pay with. */
  const [sheet, setSheet] = useState<"pick" | "pay" | null>(null);
  const [cheapestFirst, setCheapestFirst] = useState(true);
  const [menu, setMenu] = useState(false);
  // Server mode (ADR-030).
  const [serverRows, setServerRows] = useState<Listing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kycNeeded, setKycNeeded] = useState(false);
  // ADR-042: which country's check the server asked for (from the refusal), if any.
  const [kycCountry, setKycCountry] = useState<KycCountry | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  /** One key per offer being published, kept across retries so a retry never doubles it. */
  const pendingKey = useRef<string | null>(null);

  // ADR-102: server builds show and check the ceilings the server enforces right now.
  const [live, setLive] = useState<Ceilings | null>(null);
  useEffect(() => {
    if (!server?.ceilings) return undefined;
    let on = true;
    server
      .ceilings()
      .then((c) => {
        if (on) setLive(c);
      })
      .catch(() => undefined); // keep the last figures; the server checks every rate anyway
    return () => {
      on = false;
    };
  }, [server, refreshSignal]);
  // ADR-111 (owner 2026-11-11): server builds pay with the currency of an approved identity
  // check, detected — the country the phone is in, else the first; "Change" when there are
  // more. Before any check is approved (and in demo builds), Buy pays naira and Sell sells
  // dollars for naira, as before; the server asks for the check when it is needed.
  const [payChoice, setPayChoice] = useState<PayChoice | null>(null);
  const [chosenPay, setChosenPay] = useState<string | null>(null);
  useEffect(() => {
    if (!server?.payChoice) return undefined;
    let on = true;
    server
      .payChoice()
      .then((c) => {
        if (on) setPayChoice(c);
      })
      .catch(() => undefined); // not known: the server still checks every offer and take
    return () => {
      on = false;
    };
  }, [server, refreshSignal]);
  const detectedPay = payCurrencyOf(payChoice, chosenPay);
  const pay = detectedPay ?? (side === "buy" ? NGN.code : SELL_CURRENCY.code);
  // `foreign` is the currency the amount is typed in; `counter` the other side of the deal.
  const foreign: Currency | null =
    side === "buy" ? (buyCurrency && buyCurrency.code !== pay ? buyCurrency : null) : currencyOf(pay);
  const counter: Currency | null =
    side === "buy" ? currencyOf(pay) : receive && receive.code !== pay ? receive : null;
  const pairKey = foreign && counter ? ceilingKey(foreign.code, counter.code) : null;
  const { base, quote } = foreign && counter ? quoteOf(foreign.code, counter.code) : { base: foreign?.code ?? "", quote: "NGN" };
  // The demo market band is naira per unit, for the classic orientation only.
  const band = foreign && counter?.code === "NGN" ? MARKET_BAND[foreign.code] : undefined;
  // A whole-unit currency (CFA franc, Ugandan shilling) takes no decimals; rates take up to 3.
  const amountMinor = foreign ? parseAmount(foreign.code, amount) : null;
  const rateMilli = parseRate(rate);
  const potential =
    band && rateMilli !== null && (!pairKey || rateProblem(pairKey, rateMilli, live) === null)
      ? matchPotential(side, rateMilli, band)
      : null;
  // The official rate is the maximum (rateCeiling.ts, Standing Standards §7.2); between two
  // other currencies, the limit worked out from the official naira rates (ADR-111).
  const official = pairKey ? officialRateFor(pairKey, live) : null;
  const problem =
    pairKey && rateMilli !== null ? rateProblem(pairKey, rateMilli, live) : null;
  const naira = quote === "NGN";
  const rateError =
    problem === "above-official" && official !== null
      ? naira
        ? tr("Your rate can’t be above the official rate of NGN {{official}} per {{code}}.", { official: formatRate(official), code: base })
        : tr("Your rate can’t be above {{quote}} {{official}} per {{base}}.", { quote, official: formatRate(official), base })
      : problem === "official-unavailable"
        ? naira
          ? tr("There’s no official rate for {{value}} yet, so you can’t trade it for now.", { value: base || tr("this currency") })
          : tr("There’s no rate limit for {{base}} and {{quote}} right now, so you can’t trade this pair for now.", { base, quote })
        : null;
  // An amount whose value on the other side cannot be computed safely is not valid (FIN-06).
  const otherMinor =
    foreign && counter && amountMinor !== null && rateMilli !== null
      ? convertAtMilli(amountMinor, foreign.code, counter.code, rateMilli)
      : null;
  const ready =
    foreign !== null &&
    counter !== null &&
    amountMinor !== null &&
    rateMilli !== null &&
    problem === null &&
    otherMinor !== null &&
    otherMinor > 0;

  const foreignCode = foreign?.code ?? null;
  const counterCode = counter?.code ?? null;
  useEffect(() => {
    if (!server || !foreignCode || !counterCode) return undefined;
    let live = true;
    setServerRows(null);
    setLoadError(null);
    // Naira calls keep their old shape; other pairs name the second currency (ADR-111).
    const extra = counterCode === "NGN" ? [] : [counterCode];
    (side === "buy"
      ? server.offersFor(foreignCode, Date.now(), ...extra)
      : server.requestsFor(foreignCode, Date.now(), ...extra))
      .then((rows) => {
        if (live) setServerRows(rows);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setLoadError(messageFor(e));
        setKycNeeded(e instanceof ApiError && e.code === "AUTH_403_KYC_REQUIRED");
        setKycCountry(kycCountryOf(e));
      });
    return () => {
      live = false;
    };
  }, [server, side, foreignCode, counterCode, reload, refreshSignal]);

  // Coming back to Market (e.g. after withdrawing in My Offers): an old "is live" note goes.
  useEffect(() => setNotice(null), [refreshSignal]);

  const listings = useMemo(() => {
    if (!foreign || !counter) return [];
    const list = server ? (serverRows ?? []) : listingsFor(side, foreign.code);
    return cheapestFirst ? list : [...list].reverse();
  }, [side, foreign, counter, cheapestFirst, server, serverRows]);

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

  const publish = async (code: string, other: string, amt: number, rt: number): Promise<void> => {
    if (!server) return;
    pendingKey.current ??= server.newKey();
    setBusy(true);
    setNotice(null);
    const buying = side === "buy";
    const extra = other === "NGN" ? [] : [other];
    try {
      if (buying) await server.publishBuy(code, amt, rt, pendingKey.current, ...extra);
      else await server.publishSell(code, amt, rt, pendingKey.current, ...extra);
      pendingKey.current = null;
      setAmount("");
      setRate("");
      const q = quoteOf(code, other);
      const classic = q.quote === "NGN" && q.base === code;
      const values = { amt: formatAmount(code, amt), code, rt: formatRate(rt), quote: q.quote, base: q.base };
      setNotice({
        ok: true,
        text: buying
          ? classic
            ? tr("Your request to buy {{amt}} {{code}} at NGN {{rt}} is live. See it under ⋮ › My Requests.", values)
            : // Paying something other than naira, it is an offer of that currency (ADR-111).
              tr("Your request to buy {{amt}} {{code}} at {{quote}} {{rt}} per {{base}} is live. See it under ⋮ › My Offers.", values)
          : classic
            ? tr("Your offer to sell {{amt}} {{code}} at NGN {{rt}} is live. See it under ⋮ › My Offers.", values)
            : code === "NGN"
              ? // Naira offered for another currency is a buy request of it (ADR-056).
                tr("Your offer to sell {{amt}} {{code}} at {{quote}} {{rt}} per {{base}} is live. See it under ⋮ › My Requests.", values)
              : tr("Your offer to sell {{amt}} {{code}} at {{quote}} {{rt}} per {{base}} is live. See it under ⋮ › My Offers.", values),
      });
      setReload((n) => n + 1);
    } catch (e) {
      setNotice({ ok: false, text: messageFor(e) });
      setKycNeeded(e instanceof ApiError && e.code === "AUTH_403_KYC_REQUIRED");
        setKycCountry(kycCountryOf(e));
    } finally {
      setBusy(false);
    }
  };

  const create = (): void => {
    if (!ready || !foreign || !counter || amountMinor === null || rateMilli === null)
      return;
    if (server) {
      void publish(foreign.code, counter.code, amountMinor, rateMilli);
      return;
    }
    onCreate?.({ side, currency: foreign.code, amountMinor, rateMilli });
  };

  const take = (listing: Listing): void => {
    if (server && listing.own) {
      setNotice({
        ok: false,
        text: side === "buy" ? tr("This is your offer. Manage it under ⋮ › My Offers.") : tr("This is your request. Manage it under ⋮ › My Requests."),
      });
      return;
    }
    // ADR-059 Decision 4: someone is paying for it — offer the queue instead of Take.
    if (server && listing.waiting && !listing.waiting.yourTurn) {
      void onQueueListing?.(listing).then((text) => {
        if (text) setNotice({ ok: true, text });
        setReload((n) => n + 1);
      });
      return;
    }
    // Server mode: the route opens Take offer (ADR-032), which reads the offer fresh.
    onTakeListing?.(listing, side);
  };
  const canCreate = ready && !busy && (server !== null || onCreate !== undefined);

  const trendText =
    band && foreign
      ? tr("Current Market Trend:  {{low}} - {{high}} NGN = 1 {{code}}", { low: formatRate(band.low), high: formatRate(band.high), code: foreign.code })
      : tr("Current Market Trend:  -----------");

  const amountField = (
    <OutlinedField
      label={
        side === "buy"
          ? foreign || !detectedPay
            ? tr("Amount in “{{value}}” *", { value: foreign?.code ?? "USD" })
            : // ADR-111: nothing chosen yet, and never the currency you pay with.
              `${tr("Amount")} *`
          : tr("Amount in “{{code}}” to sell *", { code: pay })
      }
    >
      <FieldInput
        testID="market-amount"
        accessibilityLabel={
          foreign || !detectedPay ? tr("Amount in {{value}}", { value: foreign?.code ?? "USD" }) : tr("Amount")
        }
        value={amount}
        onChangeText={editAmount}
      />
    </OutlinedField>
  );

  const currencyField = (
    <OutlinedField
      label={
        side === "buy"
          ? tr("Select Currency to buy *")
          : tr("Select Currency to Receive *")
      }
    >
      <Pressable
        testID="market-currency"
        accessibilityRole="button"
        accessibilityLabel={
          side === "buy"
            ? tr("Select currency to buy")
            : tr("Select currency to receive")
        }
        onPress={() => setSheet("pick")}
        style={styles.select}
      >
        {side === "buy" && foreign ? (
          <View style={styles.selectChoice}>
            <RoundFlag code={foreign.code} size={28} />
            <Text style={styles.selectValue}>{foreign.code}</Text>
          </View>
        ) : side === "sell" && counter ? (
          <View style={styles.selectChoice}>
            <RoundFlag code={counter.code} size={28} />
            <Text style={styles.selectValue}>{counter.code}</Text>
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
          <CurrencyChip currency={currencyOf(pay)} />
          <RoundButton
            icon="bell"
            label={unread > 0 ? tr("Notifications, {{unread}} unread", { unread }) : tr("Notifications")}
            testID="market-notifications"
            onPress={onNotifications}
            badge={unread}
          />
          <RoundButton
            icon="more"
            label={tr("More options")}
            testID="market-more"
            onPress={() => setMenu(true)}
          />
        </View>
      </View>

      {detectedPay && payChoice ? (
        <View testID="market-pay" style={styles.payLine}>
          <Text style={styles.payText}>{tr("You pay in {{code}}", { code: detectedPay })}</Text>
          {payChoice.currencies.length > 1 ? (
            <Pressable testID="market-pay-change" accessibilityRole="button" accessibilityLabel={tr("Change the currency you pay with")} onPress={() => setSheet("pay")} hitSlop={8}>
              <Text style={styles.detailsText}>{tr("Change")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
                  tr("Current market trend"),
                  tr("The range of rates in recent matched trades on Xspeeria. Rates inside it are more likely to find a match. Illustrative data."),
                )
              }
              hitSlop={8}
              style={styles.details}
            >
              <Icon name="info" color={color.error.text} size={14} />
              <Text style={styles.detailsText}>{tr("See Details")}</Text>
            </Pressable>
          ) : null}
        </View>

        <OutlinedField label={tr("Rate *")} invalid={rateError !== null}>
          <FieldInput
            testID="market-rate"
            accessibilityLabel={
              naira
                ? tr("Rate in NGN per {{value}}", { value: base || "unit" })
                : tr("Rate in {{quote}} per {{base}}", { quote, base })
            }
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
                    {tr("{{potential}}% Match Potential", { potential })}
                  </Text>
                </View>
              ) : null
            }
          />
        </OutlinedField>
        {foreign && official !== null && !naira ? (
          <Text testID="market-official" style={styles.official}>
            {tr("Maximum rate: {{quote}} {{official}} per {{base}}, worked out from the official naira rates. Your rate must be this or lower.", { quote, official: formatRate(official), base })}
          </Text>
        ) : foreign && official !== null ? (
          <Text testID="market-official" style={styles.official}>
            {base === "CAD"
              ? tr("Maximum rate: NGN {{official}} per {{code}}, worked out from the CBN dollar rate and the Bank of Canada rate. Your rate must be this or lower.", { official: formatRate(official), code: base })
              : DERIVED_CEILING.has(base)
                ? tr("Maximum rate: NGN {{official}} per {{code}}, worked out from a CBN rate and a published exchange rate. Your rate must be this or lower.", { official: formatRate(official), code: base })
                : live
                  ? tr("Official rate (CBN, latest): NGN {{official}} per {{code}}. Your rate must be this or lower.", { official: formatRate(official), code: base })
                  : tr("Official rate (CBN, {{OFFICIAL_RATE_AS_OF}}): NGN {{official}} per {{code}}. Your rate must be this or lower.", { OFFICIAL_RATE_AS_OF, official: formatRate(official), code: base })}
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
            {busy ? tr("Publishing…") : side === "buy" ? tr("Create request") : tr("Create Offer")}
          </Text>
        </Pressable>
        {side === "buy" && server && onMultiRequest ? (
          <Pressable testID="market-multi-request" accessibilityRole="button" onPress={onMultiRequest} hitSlop={8}>
            <Text style={styles.detailsText}>{tr("Happy with more than one currency? Post one request for up to 5")}</Text>
          </Pressable>
        ) : null}
        {notice ? (
          <Text
            testID="market-notice"
            accessibilityRole="alert"
            style={notice.ok ? styles.noticeOk : styles.rateError}
          >
            {notice.text}
          </Text>
        ) : null}
        {notice && !notice.ok && kycNeeded && onVerifyIdentity ? (
          <Pressable testID="market-notice-verify" accessibilityRole="button" onPress={() => onVerifyIdentity(kycCountry ?? undefined)} hitSlop={8}>
            <Text style={styles.detailsText}>{tr("Verify your identity")}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.listHeader}>
        <SectionLabel>
          {side === "buy"
            ? tr("Available offers")
            : tr("Available {{code}} request", { code: pay })}
        </SectionLabel>
        <Pressable
          testID="market-sort"
          accessibilityRole="button"
          accessibilityLabel={
            cheapestFirst
              ? tr("Sorted by best rate. Reverse order")
              : tr("Reversed. Sort by best rate")
          }
          onPress={() => setCheapestFirst((v) => !v)}
          hitSlop={10}
        >
          <Icon name="sort" color={color.text.primary} size={22} />
        </Pressable>
      </View>

      {server && foreign && counter && loadError ? (
        <View style={styles.loadError}>
          <Text testID="market-load-error" accessibilityRole="alert" style={styles.empty}>
            {loadError}
          </Text>
          {kycNeeded && onVerifyIdentity ? (
            <Pressable testID="market-verify-identity" accessibilityRole="button" onPress={() => onVerifyIdentity(kycCountry ?? undefined)} hitSlop={8}>
              <Text style={styles.detailsText}>{tr("Verify your identity")}</Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="market-retry"
            accessibilityRole="button"
            onPress={() => setReload((n) => n + 1)}
            hitSlop={8}
          >
            <Text style={styles.detailsText}>{tr("Try again")}</Text>
          </Pressable>
        </View>
      ) : server && foreign && counter && serverRows === null ? (
        <Text testID="market-loading" style={styles.empty}>{side === "buy" ? tr("Loading offers…") : tr("Loading requests…")}</Text>
      ) : listings.length === 0 ? (
        <Text testID="market-empty" style={styles.empty}>
          {foreign && counter
              ? (side === "buy" ? tr("No offers for {{code}} right now", { code: foreign.code }) : tr("No requests for {{code}} right now", { code: foreign.code }))
              : side === "buy"
                ? tr("Select a currency to buy to see available offers")
                : tr("Select the currency to receive to see requests")}
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
          {adverts.length > 0 ? (
            // ADR-067/086: the adverts staff placed from the web admin; everyone sees the same
            // ones, sliding by themselves.
            <AdvertCarousel slides={adverts} rotateSeconds={advertSeconds} />
          ) : (
            // Figma advert slot (node 787:4204). PLACEHOLDER artwork supplied by the product
            // owner; the stock photo needs a confirmed licence before release.
            <Image
              source={ADVERT}
              accessibilityLabel={tr("Place advert here")}
              resizeMode="cover"
              style={styles.advertImage}
            />
          )}
        </View>
      ) : null}

      <ActionSheet
        testID="market-menu"
        visible={menu}
        onClose={() => setMenu(false)}
        actions={(server
          ? // Server builds also list the deals you made or received (ADR-033).
            [...MENU.slice(0, 2), { key: "deals" as const, label: tr("My Deals") }, ...MENU.slice(2)]
          : MENU
        ).map((item) => ({
          ...item,
          label: tr(item.label),
          onPress: () => {
            setMenu(false);
            if (onMenu) onMenu(item.key);
            else
              Alert.alert(
                tr(item.label),
                tr("{{label}} is one of the next screens to be built.", { label: tr(item.label) }),
              );
          },
        }))}
      />

      <CurrencySheet
        visible={sheet === "pick"}
        title={
          side === "buy"
            ? tr("Currencies you can buy")
            : tr("Currencies you are licensed to receive")
        }
        currencies={
          detectedPay
            ? // ADR-111: every currency but the one you pay with (switched ones while offered).
              wantableWith(detectedPay, live, ceilingKey)
            : side === "buy"
              ? // ADR-105/107: the yuan and the African currencies only when the server's
                // ceilings include them. Another currency without one (stale feed, ADR-102, or
                // switched off, ADR-106) stays listed but takes no rate, so the person sees why.
                buyableNow(live)
              : RECEIVABLE
        }
        onClose={() => setSheet(null)}
        onSelect={(c) => {
          if (side === "buy") {
            setBuyCurrency(c);
            setReload((n) => n + 1);
          }
          else setReceive(c);
          pendingKey.current = null;
          setSheet(null);
        }}
      />
      <CurrencySheet
        visible={sheet === "pay"}
        title={tr("Pay with")}
        currencies={(payChoice?.currencies ?? []).map(currencyOf)}
        onClose={() => setSheet(null)}
        onSelect={(c) => {
          setChosenPay(c.code);
          pendingKey.current = null;
          setNotice(null);
          setSheet(null);
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
  payLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  payText: { ...typography.caption, fontSize: 12, color: color.text.secondary },
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
