import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { HomeScreen } from '../../../src/features/home/HomeScreen';
import {
  ACTIVITY_ITEMS,
  BEST_RATE,
  MARKET_RATES,
  READINESS_INCOMPLETE,
} from '../../../src/fixtures';
import { DEMO_HOME_ACTIVITY, DEMO_HOME_BALANCE } from '../../../src/features/demo/figmaDemo';
import { useProfile } from '../../../src/features/profile/profileStore';
import { useThemeMode } from '../../../src/theme';

/** Mock data only (DEC-008): no API, auth or money flow exists yet. */
export default function HomeRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const profile = useProfile();
  return (
    <HomeScreen
      user={{ name: profile.fullName, initials: profile.initials, avatarUri: profile.avatarUri }}
      bestRate={BEST_RATE}
      rates={MARKET_RATES}
      dimensions={READINESS_INCOMPLETE}
      activity={ACTIVITY_ITEMS}
      onCreateOffer={() => router.push('/marketplace')}
      onViewAll={() => router.push('/history')}
      // Exact Figma for design review (ADR-023): demo figures exist only in development builds.
      demoHero={DEMO_HOME_BALANCE}
      demoActivity={DEMO_HOME_ACTIVITY}
      showReadiness={DEMO_HOME_BALANCE === null}
    />
  );
}
