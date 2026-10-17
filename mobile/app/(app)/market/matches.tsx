import { useEffect, useState, type ReactElement } from "react";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";

import { SelectMatchScreen } from "../../../src/features/market/SelectMatchScreen";
import { BUYABLE } from "../../../src/features/market/data";
import type { Listing } from "../../../src/features/market/data";
import type {
  Side,
  TradeRequest,
} from "../../../src/features/market/MarketScreen";
import { formatHundredths, parsePositiveInt, quoteMinorOrNull } from "../../../src/features/market/money";
import { useBeneficiaries } from "../../../src/features/profile/beneficiaryStore";
import { useProfile } from "../../../src/features/profile/profileStore";
import { requestStepUp } from "../../../src/features/security/stepUp";
import { ConfirmTradeSheet } from "../../../src/features/trade/ConfirmTradeSheet";
import { tradeStore } from "../../../src/features/trade/tradeStore";
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
  const [picked, setPicked] = useState<{ listing: Listing; side: Side } | null>(
    null,
  );
  const beneficiaries = useBeneficiaries();
  const profile = useProfile();

  useEffect(() => {
    if (!request) router.back();
  }, [request, router]);

  if (!request) return null;

  // Payouts go only to the user's own verified accounts in the currency they receive
  // (Banking spec §3.3, ADR-014).
  const receive = picked
    ? picked.side === "buy"
      ? picked.listing.currency
      : "NGN"
    : "";
  const payoutOptions = beneficiaries.filter(
    (b) =>
      b.status === "verified" &&
      b.currency === receive &&
      b.name === profile.fullName,
  );

  return (
    <>
      <SelectMatchScreen
        request={request}
        onBack={() => router.back()}
        onCancel={() => router.back()}
        onTakeListing={(listing, side) => setPicked({ listing, side })}
      />
      {picked ? (
        <ConfirmTradeSheet
          side={picked.side}
          requestedMinor={request.amountMinor}
          listing={picked.listing}
          payoutOptions={payoutOptions}
          onClose={() => setPicked(null)}
          onAddAccount={() => {
            setPicked(null);
            router.push("/profile/add-beneficiary");
          }}
          onAccept={async (amountMinor, payout) => {
            const { listing, side } = picked;
            setPicked(null);
            const what = `${side === "buy" ? "Buy" : "Sell"} ${formatHundredths(amountMinor)} ${listing.currency} at NGN ${formatHundredths(listing.rateHundredths)}`;
            if (!(await requestStepUp(what))) return;
            const trade = tradeStore.create({
              side,
              listing,
              amountMinor,
              payout: {
                id: payout.id,
                name: payout.name,
                bank: payout.bank,
                last4: payout.accountLast4,
              },
              now: Date.now(),
              random: Crypto.getRandomBytes,
            });
            router.replace({
              pathname: "/trade/[id]",
              params: { id: trade.id },
            });
          }}
        />
      ) : null}
    </>
  );
}
