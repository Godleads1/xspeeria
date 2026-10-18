import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { MarketScreen } from '../../../src/features/market/MarketScreen';
import { tradeStore } from '../../../src/features/trade/tradeStore';
import { useThemeMode } from '../../../src/theme';

/**
 * Market tab (ADR-005). Mock data only. "Create" opens Select Match for the request typed;
 * tapping a listed offer opens Select Match for that offer's remaining amount at its own
 * rate, so it goes through the same confirm sheet, 2FA check and rate ceiling.
 */
export default function MarketplaceRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <MarketScreen
      onTakeListing={(listing, side) => {
        const amount = tradeStore.remainingMinor(listing);
        if (amount <= 0) return;
        router.push({
          pathname: '/market/matches',
          params: { side, currency: listing.currency, amount: String(amount), rate: String(listing.rateHundredths) },
        });
      }}
      onCreate={(req) =>
        router.push({
          pathname: '/market/matches',
          params: {
            side: req.side,
            currency: req.currency,
            amount: String(req.amountMinor),
            rate: String(req.rateHundredths),
          },
        })
      }
    />
  );
}
