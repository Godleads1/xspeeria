import { useEffect, useState, type ReactElement } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import { SelectMatchScreen } from "../../../src/features/market/SelectMatchScreen";
import { BUYABLE } from "../../../src/features/market/data";
import type { Listing } from "../../../src/features/market/data";
import type { TradeRequest } from "../../../src/features/market/MarketScreen";
import { parsePositiveInt, quoteMinorOrNull } from "../../../src/features/market/money";
import { rateProblem } from "../../../src/features/market/rateCeiling";
import { ConfirmTradeSheet } from "../../../src/features/trade/ConfirmTradeSheet";
import {
  addToPlan,
  inPlan,
  plannedMinor,
  removeFromPlan,
  type FillPlan,
} from "../../../src/features/trade/fillPlan";
import { orderDraft } from "../../../src/features/trade/orderDraft";
import { tradeStore, useTrades } from "../../../src/features/trade/tradeStore";
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
  useTrades(); // remaining amounts change as trades are created

  useEffect(() => {
    if (!request) router.back();
  }, [request, router]);

  if (!request) return null;
  const { side } = request;

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

  // Confirmed: next, the user chooses where the money is paid (Payout Destination, ADR-022).
  const accept = (parts: FillPlan): void => {
    setReviewing(false);
    orderDraft.set({ side, requestedMinor: request.amountMinor, parts });
    setPlan([]);
    router.push("/market/payout");
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
          onClose={() => setReviewing(false)}
          onAccept={accept}
        />
      ) : null}
    </>
  );
}
