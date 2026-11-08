/**
 * Take an offer (ADR-032, server builds only). The offer is read fresh from the server (the
 * id in the route is untrusted), the user enters how much to take and confirms it's them
 * (Fingerprint/Face ID or a face check, ADR-054), and the server records a Match (ADR-031).
 *
 * A Match is a record of the deal — information, not money. Paying into the partner bank's
 * escrow and choosing payout accounts come in later steps; Xspeeria never holds funds.
 *
 * Retries are safe: one Idempotency-Key per take (kept until the amount changes or it
 * succeeds), and an unused approval is reused until the server refuses it.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";

import { ApiError, messageFor } from "../../api/client";
import type { ServerMatch, ServerOffer } from "../../api/offersApi";
import { Icon } from "../../components/icons";
import { ErrorState, LoadingState, PrimaryButton, Screen } from "../../components/primitives";
import { brandWeight, color, space, typography, themed } from "../../theme";
import { FieldInput, OutlinedField } from "./controls";
import { divRoundHalfEven, formatHundredths, parseToHundredths } from "./money";
import type { FeeQuote } from "../../api/feesApi";
import { foreignMinorFor, groupedRate, type TakeSource } from "./serverOffers";
import { tr } from "../../i18n";

/** "500.00" → 50000 (exact) or null. */
function minorOf(text: string): number | null {
  return /^[0-9]+(\.[0-9]{1,2})?$/.test(text) ? parseToHundredths(text) : null;
}

/** NGN kobo for `amountMinor` at a rate with up to 6 decimals; half-even (ADR-002 §4.4). */
export function ngnMinorFor(amountMinor: number, rate: string): number | null {
  const m = /^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(rate);
  if (!m) return null;
  const micro = BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0"));
  const result = divRoundHalfEven(BigInt(amountMinor) * micro, 1_000_000n);
  const n = Number(result);
  return Number.isSafeInteger(n) ? n : null;
}

function grouped(text: string): string {
  const [whole, frac = ""] = text.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? `.${frac}` : ""}`;
}

export function TakeOfferScreen({
  offerId,
  source,
  onBack,
  onDone,
  onDeals,
}: {
  /** Opens My Deals (ADR-033). */
  onDeals?: () => void;
  offerId: string;
  source: TakeSource;
  onBack: () => void;
  onDone: () => void;
}): ReactElement {
  const [offer, setOffer] = useState<ServerOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<ServerMatch | null>(null);
  const key = useRef<string | null>(null);
  const approval = useRef<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setOffer(null);
    source
      .offer(offerId)
      .then(setOffer)
      .catch((e: unknown) => setLoadError(messageFor(e)));
  }, [offerId, source]);
  useEffect(load, [load]);

  // ADR-056: a buy request is an offer paying naira. The taker sells the foreign currency, so
  // the amount is typed in it; the naira equivalent is what the server is sent.
  const request = offer?.source_currency === "NGN";
  const code = offer ? (request ? offer.target_currency : offer.source_currency) : "";
  const leftMinor = offer ? minorOf(offer.remaining_amount) : null;
  const remaining = offer && leftMinor !== null ? (request ? foreignMinorFor(leftMinor, offer.desired_rate) : leftMinor) : null;
  const amountMinor = parseToHundredths(amount);
  const ngnFor = amountMinor !== null && offer ? ngnMinorFor(amountMinor, offer.desired_rate) : null;
  const tooMuch =
    amountMinor !== null &&
    remaining !== null &&
    (request ? ngnFor === null || leftMinor === null || ngnFor > leftMinor : amountMinor > remaining);
  const ngn = offer && amountMinor !== null && !tooMuch ? ngnFor : null;
  const remainingText = remaining !== null ? formatHundredths(remaining).replace(/,/g, "") : "";
  const ready = offer !== null && amountMinor !== null && !tooMuch && !busy;
  // ADR-059 Decision 5: a request in several currencies is taken whole, never in part.
  const whole = offer?.whole_only === true;
  useEffect(() => {
    if (whole && remainingText) setAmount(remainingText);
  }, [whole, remainingText]);

  // ADR-098: the taker pays the 1% fee (ADR-021) on what they send (the offer's target currency): naira for
  // an offer, the foreign currency for a buy request. The server quotes it; it is worked out
  // again on the server when the escrow opens, so this is for showing only.
  const sendCurrency = offer?.target_currency ?? "";
  const sendMinor = request ? (tooMuch ? null : amountMinor) : ngn;
  const [quote, setQuote] = useState<FeeQuote | null>(null);
  useEffect(() => {
    setQuote(null);
    if (!source.feeQuote || !sendCurrency || sendMinor === null || sendMinor <= 0) return;
    const ask = source.feeQuote;
    const text = formatHundredths(sendMinor).replace(/,/g, "");
    let live = true;
    const t = setTimeout(() => {
      ask(sendCurrency, text).then((q) => live && setQuote(q), () => undefined);
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [source, sendCurrency, sendMinor]);

  const editAmount = (v: string): void => {
    setAmount(v);
    setError(null);
    key.current = null; // a different take: a new key
  };

  const take = async (): Promise<void> => {
    if (!offer || amountMinor === null) return;
    setBusy(true);
    setError(null);
    try {
      key.current ??= source.newKey();
      const values = { amount: formatHundredths(amountMinor), currency: code, rate: groupedRate(offer.desired_rate) };
      approval.current ??= await source.approve(
        request ? tr("Sell {{amount}} {{currency}} at NGN {{rate}}", values) : tr("Take {{amount}} {{currency}} at NGN {{rate}}", values),
      );
      if (!approval.current) return; // cancelled
      // A request is taken in naira: everything left exactly, or amount × rate (half to even).
      const sent = request
        ? amountMinor === remaining
          ? offer.remaining_amount
          : ngn !== null
            ? formatHundredths(ngn).replace(/,/g, "")
            : null
        : formatHundredths(amountMinor).replace(/,/g, "");
      if (sent === null) return;
      // The rate on screen is the one the taker agrees to; the server refuses it if it changed.
      const m = await source.accept(offer.offer_id, sent, offer.desired_rate, key.current, approval.current);
      setMatch(m);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) approval.current = null; // spent or refused
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable testID="take-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
        <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        {match ? tr("Deal recorded") : request ? tr("Sell to this request") : tr("Take offer")}
      </Text>
      <View style={styles.spacer} />
    </View>
  );

  if (match) {
    const naira = match.currency === "NGN";
    const shown = naira ? `${grouped(match.counter_amount ?? "")} ${match.counter_currency}` : `${grouped(match.allocated_amount)} ${match.currency}`;
    const total = naira ? minorOf(match.allocated_amount) : ngnMinorFor(minorOf(match.allocated_amount) ?? 0, match.agreed_rate);
    return (
      <Screen testID="take-done-screen">
        {header}
        <View testID="take-match" style={styles.card}>
          <Text style={styles.big}>{shown}</Text>
          <Text style={styles.line}>{tr("Rate: NGN {{agreed_rate}} /{{currency}}", { agreed_rate: groupedRate(match.agreed_rate), currency: naira ? match.counter_currency : match.currency })}</Text>
          {total !== null ? (
            <Text style={styles.line}>{tr("Works out to NGN {{total}}", { total: formatHundredths(total) })}</Text>
          ) : null}
        </View>
        <Text style={styles.note}>{tr("The deal is recorded and the rate is fixed. Next you’ll choose your payout account and pay into the partner bank’s escrow account — those steps are coming soon. Xspeeria never holds your money.")}</Text>
        <PrimaryButton testID="take-done" label={tr("Done")} onPress={onDone} />
        {onDeals ? (
          <Pressable testID="take-see-deals" accessibilityRole="button" onPress={onDeals} hitSlop={8} style={styles.seeDeals}>
            <Text style={styles.link}>{tr("See my deals")}</Text>
          </Pressable>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen testID="take-screen">
      {header}
      {loadError ? (
        <ErrorState title={loadError} onRetry={load} />
      ) : !offer ? (
        <LoadingState label={tr("Loading the offer")} />
      ) : (
        <View style={styles.form}>
          <View testID="take-offer" style={styles.card}>
            <Text style={styles.line}>
              {tr("Available: ")}
              <Text style={styles.strong}>{`${grouped(remainingText)} ${code}`}</Text>
            </Text>
            <Text style={styles.line}>
              {tr("Rate: ")}
              <Text style={styles.strong}>{`NGN ${groupedRate(offer.desired_rate)}`}</Text>
              {` /${code}`}
            </Text>
          </View>

          <OutlinedField label={request ? tr("Amount in “{{source_currency}}” to sell *", { source_currency: code }) : tr("Amount in “{{source_currency}}” to take *", { source_currency: code })} invalid={tooMuch}>
            <FieldInput
              testID="take-amount"
              accessibilityLabel={tr("Amount in {{source_currency}} to take", { source_currency: code })}
              value={amount}
              onChangeText={whole ? () => undefined : editAmount}
            />
          </OutlinedField>
          {whole ? (
            <Text testID="take-whole" style={styles.line}>{tr("Whole amount only: this request is taken in full.")}</Text>
          ) : null}
          {whole ? null : (
          <Pressable
            testID="take-all"
            accessibilityRole="button"
            onPress={() => editAmount(remainingText)}
            hitSlop={8}
            style={styles.takeAll}
          >
            <Text style={styles.link}>{tr("Take all {{remaining_amount}} {{source_currency}}", { remaining_amount: grouped(remainingText), source_currency: code })}</Text>
          </Pressable>
          )}
          {tooMuch ? (
            <Text testID="take-too-much" accessibilityRole="alert" style={styles.error}>
              {tr("Only {{remaining_amount}} {{source_currency}} is available.", { remaining_amount: grouped(remainingText), source_currency: code })}
            </Text>
          ) : ngn !== null ? (
            <Text testID="take-ngn" style={styles.line}>{tr("Works out to NGN {{ngn}}", { ngn: formatHundredths(ngn) })}</Text>
          ) : null}
          {quote ? (
            <Text testID="take-fee" style={styles.line}>
              {tr("Xspeeria fee: {{fee}} {{currency}}. You pay {{total}} {{currency}} into escrow.", {
                fee: grouped(quote.fee),
                total: grouped(quote.total),
                currency: quote.currency,
              })}
            </Text>
          ) : null}


          {error ? (
            <Text testID="take-error" accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton testID="take-submit" label={busy ? tr("Taking…") : request ? tr("Sell") : tr("Take offer")} onPress={() => void take()} disabled={!ready} />
          <Text style={styles.note}>{tr("Taking an offer records the deal at this rate. No money moves yet: you’ll pay into the partner bank’s escrow account in a later step.")}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  spacer: { width: 24 },
  title: { ...brandWeight("700"), fontSize: 20, color: color.text.primary },
  form: { gap: space.sm },
  card: {
    gap: 6,
    padding: space.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  big: { ...brandWeight("700"), fontSize: 24, color: color.text.primary },
  line: { ...typography.body, fontSize: 15, color: color.text.secondary },
  strong: { ...brandWeight("700"), color: color.text.primary },
  takeAll: { alignSelf: "flex-end", marginTop: -6 },
  seeDeals: { alignSelf: "center", paddingVertical: space.xs },
  link: { ...typography.caption, fontSize: 13, color: color.brand.primary },
  error: { ...typography.caption, fontSize: 13, color: color.error.text },
  note: { ...typography.caption, fontSize: 12, color: color.text.secondary },
}));
