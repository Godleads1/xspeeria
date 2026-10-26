import { useEffect, useMemo, type ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { noticesApi } from '../../../src/api/noticesApi';
import { serverAuth } from '../../../src/features/auth/serverAuth';
import { HomeScreen } from '../../../src/features/home/HomeScreen';
import { bestRates, dealsToActivity } from '../../../src/features/history/serverHistory';
import { serverDeals, useServerData } from '../../../src/features/history/serverDeals';
import { serverKyc } from '../../../src/features/kyc/serverKyc';
import {
  type ReadinessDimension,
  ACTIVITY_ITEMS,
  BEST_RATE,
  MARKET_RATES,
  READINESS_INCOMPLETE,
} from '../../../src/fixtures';
import { DEMO_HOME_ACTIVITY, DEMO_HOME_BALANCE } from '../../../src/features/demo/figmaDemo';
import { useProfile } from '../../../src/features/profile/profileStore';
import { useUnreadCount } from '../../../src/features/notifications/unread';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";

const loadDeals = () => serverDeals.deals();
const loadOffers = async () => [
  ...(await serverDeals.offers('USD/NGN')),
  ...(await serverDeals.offers('GBP/NGN')),
];
const loadKyc = () => serverKyc.current();
const loadNotices = async () => {
  const t = serverAuth.accessToken();
  return t ? noticesApi.list(t, serverAuth.apiOptions()) : [];
};

/** Server builds: identity from the real check; 2FA is always on (ADR-026). */
export function serverReadiness(approved: boolean): ReadinessDimension[] {
  return [
    approved
      ? { id: 'identity', label: tr("Identity"), state: 'complete', detail: tr("Verified") }
      : { id: 'identity', label: 'Identity', state: 'action-required', detail: tr("Verify your identity to trade"), action: 'Verify' },
    { id: 'security', label: 'Security', state: 'complete', detail: tr("Two-factor on") },
    approved
      ? { id: 'eligibility', label: tr("Eligible to transact"), state: 'complete', detail: tr("You can create and accept offers") }
      : { id: 'eligibility', label: tr("Eligible to transact"), state: 'pending', detail: tr("Available once your identity is verified") },
  ];
}

/**
 * Home. Server builds (ADR-045): best prices from open offers, my newest deals, readiness from
 * the identity check. Demo builds: mock data (DEC-008).
 */
export default function HomeRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const profile = useProfile();
  const unread = useUnreadCount();
  const deals = useServerData(SERVER_MODE ? loadDeals : null);
  const offers = useServerData(SERVER_MODE ? loadOffers : null);
  const kyc = useServerData(SERVER_MODE ? loadKyc : null);
  // ADR-066: a failed notice request shows nothing; it never blocks Home.
  const notices = useServerData(SERVER_MODE ? loadNotices : null);
  const rates = useMemo(() => bestRates(offers.data ?? [], ['USD', 'GBP']), [offers.data]);
  const approved = kyc.data?.status === 'approved';
  // ADR-055: once the identity check is approved, show the name from the ID.
  useEffect(() => {
    if (SERVER_MODE && approved && !profile.fullName) void serverAuth.refreshProfile().catch(() => undefined);
  }, [approved, profile.fullName]);
  if (SERVER_MODE) {
    return (
      <HomeScreen
        user={{ name: profile.fullName || profile.handle, initials: profile.initials, avatarUri: profile.avatarUri }}
        bestRate={rates[0]}
        rates={rates}
        dimensions={serverReadiness(approved)}
        activity={dealsToActivity(deals.data ?? [])}
        onCreateOffer={() => router.push('/marketplace')}
        onViewAll={() => router.push('/history')}
        onNotifications={() => router.push('/notifications')}
        unread={unread}
        showReadiness
        notices={notices.data ?? []}
        onSearch={({ query, currency, filters }) =>
          router.push({
            pathname: '/market/search',
            params: { ...(query ? { q: query } : {}), ...(currency ? { currency } : {}), ...(filters ? { filters: '1' } : {}) },
          })
        }
      />
    );
  }
  return (
    <HomeScreen
      user={{ name: profile.fullName, initials: profile.initials, avatarUri: profile.avatarUri }}
      bestRate={BEST_RATE}
      rates={MARKET_RATES}
      dimensions={READINESS_INCOMPLETE}
      activity={ACTIVITY_ITEMS}
      onCreateOffer={() => router.push('/marketplace')}
      onViewAll={() => router.push('/history')}
      onNotifications={() => router.push('/notifications')}
      unread={unread}
      // Exact Figma for design review (ADR-023): demo figures exist only in development builds.
      demoHero={DEMO_HOME_BALANCE}
      demoActivity={DEMO_HOME_ACTIVITY}
      showReadiness={DEMO_HOME_BALANCE === null}
    />
  );
}
