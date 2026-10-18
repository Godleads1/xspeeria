/**
 * Take an offer (ADR-032, server builds only). The offer is read fresh from the server (the
 * id in the route is untrusted), the user enters how much to take and a fresh authenticator
 * code, and the server records a Match (ADR-031).
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
import { groupedRate, type TakeSource } from "./serverOffers";

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
  const [code, setCode] = useState("");
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

  const remaining = offer ? minorOf(offer.remaining_amount) : null;
  const amountMinor = parseToHundredths(amount);
  const tooMuch = amountMinor !== null && remaining !== null && amountMinor > remaining;
  const ngn = offer && amountMinor !== null && !tooMuch ? ngnMinorFor(amountMinor, offer.desired_rate) : null;
  const ready = offer !== null && amountMinor !== null && !tooMuch && /^[0-9]{6}$/.test(code) && !busy;

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
      approval.current ??= await source.approve(code);
      const m = await source.accept(
        offer.offer_id,
        formatHundredths(amountMinor).replace(/,/g, ""),
        key.current,
        approval.current,
      );
      setMatch(m);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) approval.current = null; // spent or refused
      if (e instanceof ApiError && e.status !== 0) setCode(""); // a code works once
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable testID="take-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
        <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        {match ? "Deal recorded" : "Take offer"}
      </Text>
      <View style={styles.spacer} />
    </View>
  );

  if (match) {
    const total = ngnMinorFor(minorOf(match.allocated_amount) ?? 0, match.agreed_rate);
    return (
      <Screen testID="take-done-screen">
        {header}
        <View testID="take-match" style={styles.card}>
          <Text style={styles.big}>{`${grouped(match.allocated_amount)} ${match.currency}`}</Text>
          <Text style={styles.line}>{`Rate: NGN ${groupedRate(match.agreed_rate)} /${match.currency}`}</Text>
          {total !== null ? (
            <Text style={styles.line}>{`Works out to NGN ${formatHundredths(total)}`}</Text>
          ) : null}
        </View>
        <Text style={styles.note}>
          The deal is recorded and the rate is fixed. Next you’ll choose your payout account and pay into
          the partner bank’s escrow account — those steps are coming soon. Xspeeria never holds your money.
        </Text>
        <PrimaryButton testID="take-done" label="Done" onPress={onDone} />
        {onDeals ? (
          <Pressable testID="take-see-deals" accessibilityRole="button" onPress={onDeals} hitSlop={8} style={styles.seeDeals}>
            <Text style={styles.link}>See my deals</Text>
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
        <LoadingState label="Loading the offer" />
      ) : (
        <View style={styles.form}>
          <View testID="take-offer" style={styles.card}>
            <Text style={styles.line}>
              {"Available: "}
              <Text style={styles.strong}>{`${grouped(offer.remaining_amount)} ${offer.source_currency}`}</Text>
            </Text>
            <Text style={styles.line}>
              {"Rate: "}
              <Text style={styles.strong}>{`NGN ${groupedRate(offer.desired_rate)}`}</Text>
              {` /${offer.source_currency}`}
            </Text>
          </View>

          <OutlinedField label={`Amount in “${offer.source_currency}” to take *`} invalid={tooMuch}>
            <FieldInput
              testID="take-amount"
              accessibilityLabel={`Amount in ${offer.source_currency} to take`}
              value={amount}
              onChangeText={editAmount}
            />
          </OutlinedField>
          <Pressable
            testID="take-all"
            accessibilityRole="button"
            onPress={() => editAmount(offer.remaining_amount)}
            hitSlop={8}
            style={styles.takeAll}
          >
            <Text style={styles.link}>{`Take all ${grouped(offer.remaining_amount)} ${offer.source_currency}`}</Text>
          </Pressable>
          {tooMuch ? (
            <Text testID="take-too-much" accessibilityRole="alert" style={styles.error}>
              {`Only ${grouped(offer.remaining_amount)} ${offer.source_currency} is available.`}
            </Text>
          ) : ngn !== null ? (
            <Text testID="take-ngn" style={styles.line}>{`Works out to NGN ${formatHundredths(ngn)}`}</Text>
          ) : null}

          <OutlinedField label="Authenticator code *">
            <FieldInput
              testID="take-code"
              accessibilityLabel="6-digit code from your authenticator app"
              value={code}
              onChangeText={(t) => {
                setCode(t.replace(/[^0-9]/g, "").slice(0, 6));
                setError(null);
              }}
              placeholder="123456"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
            />
          </OutlinedField>

          {error ? (
            <Text testID="take-error" accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton testID="take-submit" label={busy ? "Taking…" : "Take offer"} onPress={() => void take()} disabled={!ready} />
          <Text style={styles.note}>
            Taking an offer records the deal at this rate. No money moves yet: you’ll pay into the partner
            bank’s escrow account in a later step.
          </Text>
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
