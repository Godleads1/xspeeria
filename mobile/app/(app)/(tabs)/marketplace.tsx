import { useCallback, useState, type ReactElement } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useUnreadCount } from '../../../src/features/notifications/unread';
import { SERVER_MODE } from '../../../src/api/config';
import { MarketScreen } from '../../../src/features/market/MarketScreen';
import { marketServer } from '../../../src/features/market/serverOffers';
import { tradeStore } from '../../../src/features/trade/tradeStore';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";

/**
 * Market tab (ADR-005). Mock data only. "Create" opens Select Match for the request typed;
 * tapping a listed offer opens Select Match for that offer's remaining amount at its own
 * rate, so it goes through the same confirm sheet, 2FA check and rate ceiling.
 *
 * Pointed at a real server (ADR-030): real offers, "Create Offer" publishes, and ⋮ › My
 * Offers lists and withdraws them. Other menu items keep their demo behaviour.
 */
export default function MarketplaceRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const unread = useUnreadCount();
  // Fetch server offers again whenever the tab comes back into view (e.g. after My Offers).
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => setRefresh((n) => n + 1), []));
  return (
    <MarketScreen
      server={SERVER_MODE ? marketServer : null}
      refreshSignal={refresh}
      onVerifyIdentity={
        SERVER_MODE
          ? (country) => router.push(country ? { pathname: '/profile/kyc', params: { country } } : '/profile/kyc')
          : undefined
      }
      onNotifications={() => router.push('/notifications')}
      unread={unread}
      onMenu={
        SERVER_MODE
          ? (key) => {
              if (key === 'offers') router.push('/market/my-offers');
              else if (key === 'requests') router.push('/market/my-requests');
              else if (key === 'deals') router.push('/market/deals');
              else Alert.alert(tr("Coming soon"), tr("This is one of the next screens to be built."));
            }
          : undefined
      }
      onTakeListing={(listing, side) => {
        if (SERVER_MODE) {
          router.push({ pathname: '/market/take', params: { offer: listing.id } });
          return;
        }
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
