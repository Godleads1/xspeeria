/**
 * My Offers (Market ⋮ menu, ADR-030): the signed-in user's offers on the server, open ones
 * first, each with a Withdraw button. Withdrawing closes the rest of the offer to new
 * matches; anything already matched is kept (contract §3.4).
 *
 * An offer is a record of what you are willing to exchange — information, not money.
 * No Figma frame exists for this screen yet; it reuses the Market row styles.
 */

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ApiError, messageFor } from "../../api/client";
import type { ServerOffer } from "../../api/offersApi";
import { Icon } from "../../components/icons";
import { EmptyState, ErrorState, LoadingState, Screen, StatusChip, type StatusTone } from "../../components/primitives";
import { brandWeight, color, space, typography, themed } from "../../theme";
import { amountDecimals, formatAmount, parseAmount, parseRate } from "./money";
import { exactHundredths, foreignMinorFor, groupedRate } from "./serverOffers";
import { quoteOf } from "./pairs";
import { tr, k } from "../../i18n";

export interface MyOffersSource {
  list(): Promise<ServerOffer[]>;
  withdraw(offerId: string): Promise<ServerOffer>;
  /** ADR-059 Decision 3: new amount (foreign currency, hundredths) and rate (hundredths). */
  edit?(offer: ServerOffer, amountMinor: number, rateMilli: number): Promise<ServerOffer>;
}

/** Editable only while nobody has taken any of it (ADR-059 Decision 3). */
export function canEdit(o: ServerOffer): boolean {
  return o.status === "open" && /^0+(\.0+)?$/.test(o.matched_amount);
}

const STATUS: Record<ServerOffer["status"], { label: string; tone: StatusTone }> = {
  open: { label: k("Open"), tone: "success" },
  partially_matched: { label: k("Partly matched"), tone: "warning" },
  fully_matched: { label: k("Fully matched"), tone: "neutral" },
  withdrawn: { label: k("Withdrawn"), tone: "neutral" },
  cancelled: { label: k("Cancelled"), tone: "neutral" },
  expired: { label: k("Expired"), tone: "neutral" },
};

const ACTIVE = new Set<ServerOffer["status"]>(["open", "partially_matched"]);

function grouped(text: string): string {
  const [whole, frac = ""] = text.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? `.${frac}` : ""}`;
}

export function MyOffersScreen({
  source,
  onBack,
  show = "offers",
}: {
  source: MyOffersSource;
  onBack: () => void;
  /** ADR-056: "offers" sell foreign currency; "requests" are buy requests (offers paying naira). */
  show?: "offers" | "requests";
}): ReactElement {
  const [offers, setOffers] = useState<ServerOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The offer being edited, with the amount (foreign currency) and rate as typed. */
  const [editing, setEditing] = useState<{ id: string; amount: string; rate: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    setOffers(null);
    source
      .list()
      .then((all) => setOffers(all.filter((o) => (o.source_currency === "NGN") === (show === "requests"))))
      .catch((e: unknown) => setError(messageFor(e)));
  }, [source, show]);

  useEffect(load, [load]);

  const withdraw = async (id: string): Promise<void> => {
    setWorking(id);
    setNotice(null);
    try {
      const updated = await source.withdraw(id);
      setOffers((list) => (list ?? []).map((o) => (o.offer_id === id ? updated : o)));
      setNotice(updated.source_currency === "NGN" ? tr("Request withdrawn.") : tr("Offer withdrawn."));
    } catch (e) {
      setNotice(messageFor(e));
    } finally {
      setWorking(null);
      setConfirming(null);
    }
  };

  const save = async (o: ServerOffer): Promise<void> => {
    if (!editing || !source.edit) return;
    const foreign = o.source_currency === "NGN" ? o.target_currency : o.source_currency;
    const amountMinor = parseAmount(foreign, editing.amount);
    const rateMilli = parseRate(editing.rate);
    if (amountMinor === null || rateMilli === null) {
      setNotice(amountDecimals(foreign) === 0 ? tr("Enter the amount as a whole number and the rate as a number, e.g. 1000 and 0.306.") : tr("Enter the amount and the rate as numbers, e.g. 1000.00."));
      return;
    }
    setWorking(o.offer_id);
    setNotice(null);
    try {
      const updated = await source.edit(o, amountMinor, rateMilli);
      setOffers((list) => (list ?? []).map((x) => (x.offer_id === o.offer_id ? updated : x)));
      setEditing(null);
      setNotice(updated.source_currency === "NGN" ? tr("Request updated.") : tr("Offer updated."));
    } catch (e) {
      setNotice(messageFor(e));
      // Someone may have started a deal meanwhile: show the server's current state.
      if (e instanceof ApiError && e.status === 409) load();
    } finally {
      setWorking(null);
    }
  };

  return (
    <Screen testID={show === "requests" ? "my-requests-screen" : "my-offers-screen"}>
      <View style={styles.header}>
        <Pressable
          testID="my-offers-back"
          accessibilityRole="button"
          accessibilityLabel={tr("Back")}
          onPress={onBack}
          hitSlop={12}
        >
          <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{show === "requests" ? tr("My Requests") : tr("My Offers")}</Text>
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
        <LoadingState label={show === "requests" ? tr("Loading your requests") : tr("Loading your offers")} />
      ) : offers.length === 0 ? (
        <EmptyState
          title={show === "requests" ? tr("You have no buy requests yet. Create one from Market › Buy.") : tr("You have no offers yet. Create one from Market › Sell.")}
        />
      ) : (
        <View testID="my-offers-list" style={styles.list}>
          {offers.map((o) => {
            // ADR-056: a buy request is an offer paying naira; it is shown in the foreign currency.
            const request = o.source_currency === "NGN";
            const foreign = request ? o.target_currency : o.source_currency;
            const inForeign = (text: string): string => {
              const naira = exactHundredths(text);
              const minor = naira === null ? null : foreignMinorFor(naira, o.desired_rate, foreign);
              return minor === null ? "" : formatAmount(foreign, minor);
            };
            // ADR-111: the rate reads quote per base (NGN per unit for naira pairs, as before).
            const q = quoteOf(o.source_currency, o.target_currency);
            const status = STATUS[o.status];
            const active = ACTIVE.has(o.status);
            const asking = confirming === o.offer_id;
            const rateLabel =
              q.quote === "NGN"
                ? tr("Rate (NGN per {{currency}})", { currency: q.base })
                : tr("Rate ({{quote}} per {{base}})", { quote: q.quote, base: q.base });
            return (
              <View key={o.offer_id} testID={`my-offer-${o.offer_id}`} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.strong}>
                    {request
                      ? tr("Buy {{amount}} {{currency}} (you pay NGN {{naira}})", { amount: inForeign(o.source_amount), currency: foreign, naira: grouped(o.source_amount) })
                      : tr("Sell {{source_amount}} {{source_currency}} → {{target_currency}}", { source_amount: grouped(o.source_amount), source_currency: o.source_currency, target_currency: o.target_currency })}
                  </Text>
                  <StatusChip label={tr(status.label)} tone={status.tone} />
                </View>
                <Text style={styles.line}>
                  {q.quote === "NGN"
                    ? tr("Rate: NGN {{desired_rate}} /{{foreign}}", { desired_rate: groupedRate(o.desired_rate), foreign: q.base })
                    : tr("Rate: {{quote}} {{rate}} /{{base}}", { quote: q.quote, rate: groupedRate(o.desired_rate), base: q.base })}
                </Text>
                <Text style={styles.line}>
                  {active
                    ? tr("Matched: {{matched_amount}} · Left: {{remaining_amount}} {{source_currency}}", {
                        matched_amount: request ? inForeign(o.matched_amount) : grouped(o.matched_amount),
                        remaining_amount: request ? inForeign(o.remaining_amount) : grouped(o.remaining_amount),
                        source_currency: foreign,
                      })
                    : tr("Matched: {{matched_amount}} {{source_currency}}", {
                        matched_amount: request ? inForeign(o.matched_amount) : grouped(o.matched_amount),
                        source_currency: foreign,
                      })}
                </Text>
                {editing?.id === o.offer_id ? (
                  <View testID={`my-offer-${o.offer_id}-form`} style={styles.form}>
                    {o.group_id ? (
                      <Text style={styles.formLabel}>{tr("This request is in several currencies, so only its rate can change.")}</Text>
                    ) : (
                    <>
                    <Text style={styles.formLabel}>{tr("Amount ({{currency}})", { currency: foreign })}</Text>
                    <TextInput
                      testID={`my-offer-${o.offer_id}-amount`}
                      accessibilityLabel={tr("Amount ({{currency}})", { currency: foreign })}
                      value={editing.amount}
                      onChangeText={(t) => setEditing({ ...editing, amount: t.replace(/[^0-9.,]/g, "").slice(0, 16) })}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      style={styles.input}
                    />
                    </>
                    )}
                    <Text style={styles.formLabel}>{rateLabel}</Text>
                    <TextInput
                      testID={`my-offer-${o.offer_id}-rate`}
                      accessibilityLabel={rateLabel}
                      value={editing.rate}
                      onChangeText={(t) => setEditing({ ...editing, rate: t.replace(/[^0-9.,]/g, "").slice(0, 16) })}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      style={styles.input}
                    />
                    <View style={styles.actions}>
                      <Pressable
                        testID={`my-offer-${o.offer_id}-save`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: working !== null, busy: working === o.offer_id }}
                        disabled={working !== null}
                        onPress={() => void save(o)}
                        style={({ pressed }) => [styles.save, pressed ? styles.pressed : null]}
                      >
                        <Text style={styles.saveLabel}>{working === o.offer_id ? tr("Saving…") : tr("Save changes")}</Text>
                      </Pressable>
                      <Pressable testID={`my-offer-${o.offer_id}-cancel`} accessibilityRole="button" onPress={() => setEditing(null)} style={styles.cancel}>
                        <Text style={styles.cancelLabel}>{tr("Cancel")}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {active && editing?.id !== o.offer_id ? (
                  <View style={styles.actions}>
                    {source.edit && canEdit(o) ? (
                      <Pressable
                        testID={`my-offer-${o.offer_id}-edit`}
                        accessibilityRole="button"
                        disabled={working !== null}
                        onPress={() => {
                          setConfirming(null);
                          setNotice(null);
                          setEditing({ id: o.offer_id, amount: request ? inForeign(o.source_amount) : grouped(o.source_amount), rate: groupedRate(o.desired_rate) });
                        }}
                        style={({ pressed }) => [styles.edit, pressed ? styles.pressed : null]}
                      >
                        <Text style={styles.editLabel}>{tr("Edit")}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      testID={`my-offer-${o.offer_id}-withdraw`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: working !== null, busy: working === o.offer_id }}
                      disabled={working !== null}
                      onPress={() => (asking ? void withdraw(o.offer_id) : setConfirming(o.offer_id))}
                      style={({ pressed }) => [styles.withdraw, asking ? styles.withdrawConfirm : null, pressed ? styles.pressed : null]}
                    >
                      <Text style={[styles.withdrawLabel, asking ? styles.withdrawConfirmLabel : null]}>
                        {working === o.offer_id ? tr("Withdrawing…") : asking ? tr("Tap again to withdraw") : tr("Withdraw")}
                      </Text>
                    </Pressable>
                  </View>
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
  actions: { flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" },
  edit: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: color.brand.primary, justifyContent: "center" },
  editLabel: { ...typography.caption, fontSize: 14, color: color.brand.primary },
  form: { gap: 6, marginTop: 6 },
  formLabel: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  input: { ...typography.body, minHeight: 44, borderWidth: 1, borderColor: color.border.subtle, borderRadius: 10, paddingHorizontal: 12, color: color.text.primary },
  save: { minHeight: 40, paddingHorizontal: 16, borderRadius: 10, backgroundColor: color.brand.primary, justifyContent: "center" },
  saveLabel: { ...typography.caption, ...brandWeight("700"), fontSize: 14, color: color.text.onFill },
  cancel: { minHeight: 40, paddingHorizontal: 14, justifyContent: "center" },
  cancelLabel: { ...typography.caption, fontSize: 14, color: color.text.secondary },
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
