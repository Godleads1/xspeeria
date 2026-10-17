import { useEffect, useState, type ReactElement } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";

import { SelectMatchScreen } from "../../../src/features/market/SelectMatchScreen";
import { BUYABLE } from "../../../src/features/market/data";
import type { Listing } from "../../../src/features/market/data";
import type { TradeRequest } from "../../../src/features/market/MarketScreen";
import { formatHundredths, parsePositiveInt, quoteMinorOrNull } from "../../../src/features/market/money";
import { rateProblem } from "../../../src/features/market/rateCeiling";
import { useBeneficiaries } from "../../../src/features/profile/beneficiaryStore";
import { useProfile } from "../../../src/features/profile/profileStore";
import { requestStepUp } from "../../../src/features/security/stepUp";
import { ConfirmTradeSheet } from "../../../src/features/trade/ConfirmTradeSheet";
import {
  addToPlan,
  inPlan,
  plannedMinor,
  removeFromPlan,
  type FillPlan,
} from "../../../src/features/trade/fillPlan";
import { allocatePayouts, type PayoutShare } from "../../../src/features/trade/payoutSplit";
import { receiveFor, tradeStore, useTrades } from "../../../src/features/trade/tradeStore";
import { useThemeMode } from "../../../src/theme";

/**
 * Route params are untrusted input (deep links can set them), so they are re-validated
 * here; anything malformed returns the user to Market instead of rendering bad numbers.
 */
function parseParams(
  params: Record<string, string | string[] | undefined>,
): TradeRequest | null {
  const one = (k: string): string | undefined => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const side = one("side");
  const currency = one("currency");
  const amount = parsePositiveInt(one("amount"));
  const rate = parsePositiveInt(one("rate"));
  if (side !== "buy" && side !== "sell") return null;
  const valid =
    BUYABLE.some((c) => c.code === currency) &&
    amount !== null &&
    rate !== null &&
    // The official rate is the maximum (rateCeiling.ts); a link cannot get round it.
    rateProblem(currency as string, rate) === null &&
    // The quote must be computable, or Select Match could not render (FIN-06).
    quoteMinorOrNull(amount, rate) !== null;
  return valid && amount !== null && rate !== null
    ? {
        side,
        currency: currency as string,
        amountMinor: amount,
        rateHundredths: rate,
      }
    : null;
}

export default function SelectMatchRoute(): ReactElement | null {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const request = parseParams(useLocalSearchParams());
  // Listings picked so far and the amount from each (ADR-019).
  const [plan, setPlan] = useState<FillPlan>([]);
  const [reviewing, setReviewing] = useState(false);
  const beneficiaries = useBeneficiaries();
  const profile = useProfile();
  useTrades(); // remaining amounts change as trades are created

  useEffect(() => {
    if (!request) router.back();
  }, [request, router]);

  if (!request) return null;
  const { side } = request;

  // Payouts go only to the user's own verified accounts in the currency they receive
  // (Banking spec §3.3, ADR-014).
  const receive = side === "buy" ? request.currency : "NGN";
  const payoutOptions = beneficiaries.filter(
    (b) =>
      b.status === "verified" &&
      b.currency === receive &&
      b.name === profile.fullName,
  );

  const toggle = (listing: Listing): void => {
    if (inPlan(plan, listing.id)) {
      setPlan(removeFromPlan(plan, listing.id));
      return;
    }
    const next = addToPlan(plan, listing, request.amountMinor, (l) => tradeStore.remainingMinor(l));
    setPlan(next);
    // Covered in full: go straight to confirm (one tap when one listing is enough).
    if (next !== plan && plannedMinor(next) >= request.amountMinor) setReviewing(true);
  };

  const accept = async (parts: FillPlan, shares: readonly PayoutShare[]): Promise<void> => {
    setReviewing(false);
    const what =
      parts.length === 1
        ? `${side === "buy" ? "Buy" : "Sell"} ${formatHundredths(parts[0].amountMinor)} ${parts[0].listing.currency} at NGN ${formatHundredths(parts[0].listing.rateHundredths)}`
        : `${side === "buy" ? "Buy" : "Sell"} ${formatHundredths(plannedMinor(parts))} ${parts[0].listing.currency} in ${parts.length} trades`;
    // One 2 FA check covers the whole order the user just reviewed (ADR-008, ADR-019).
    if (!(await requestStepUp(what))) return;
    const orderId = parts.length > 1 ? `o-${Array.from(Crypto.getRandomBytes(6), (b) => b.toString(16).padStart(2, "0")).join("")}` : undefined;
    // The user's split across their accounts, spread over the trades of the order (ADR-021).
    const perTrade = allocatePayouts(
      parts.map((p) => receiveFor(side, p.amountMinor, p.listing.rateHundredths)),
      shares,
    );
    const created: string[] = [];
    let failed = 0;
    for (const [i, part] of parts.entries()) {
      try {
        const trade = tradeStore.create({
          side,
          listing: part.listing,
          amountMinor: part.amountMinor,
          payouts: perTrade[i],
          now: Date.now(),
          random: Crypto.getRandomBytes,
          orderId,
        });
        created.push(trade.id);
      } catch {
        // Each listing is accepted on its own; one being taken meanwhile does not undo the others.
        failed += 1;
      }
    }
    setPlan([]);
    if (failed > 0) {
      Alert.alert(
        "Some trades were not created",
        `${failed} of ${parts.length} ${side === "buy" ? "offers were" : "requests were"} taken by someone else. ${created.length > 0 ? "The others went ahead." : "Choose again."}`,
      );
    }
    if (created.length > 0) {
      router.replace({ pathname: "/trade/[id]", params: { id: created[0] } });
    }
  };

  return (
    <>
      <SelectMatchScreen
        request={request}
        plan={plan}
        remainingOf={(l) => tradeStore.remainingMinor(l)}
        onBack={() => router.back()}
        onCancel={() => router.back()}
        onToggleListing={toggle}
        onReview={() => setReviewing(true)}
      />
      {reviewing && plan.length > 0 ? (
        <ConfirmTradeSheet
          side={side}
          requestedMinor={request.amountMinor}
          parts={plan}
          payoutOptions={payoutOptions}
          onClose={() => setReviewing(false)}
          onAddAccount={() => {
            setReviewing(false);
            router.push("/profile/add-beneficiary");
          }}
          onAccept={(parts, payout) => void accept(parts, payout)}
        />
      ) : null}
    </>
  );
}
