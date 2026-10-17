import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { HomeScreen } from '../../src/features/home/HomeScreen';
import {
  ACTIVITY_ITEMS,
  BEST_RATE,
  MARKET_RATES,
  MOCK_USER,
  READINESS_INCOMPLETE,
} from '../../src/fixtures';
import { useThemeMode } from '../../src/theme';

/** Mock data only (DEC-008): no API, auth or money flow exists yet. */
export default function HomeRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <HomeScreen
      user={MOCK_USER}
      bestRate={BEST_RATE}
      rates={MARKET_RATES}
      dimensions={READINESS_INCOMPLETE}
      activity={ACTIVITY_ITEMS}
      onCreateOffer={() => router.push('/marketplace')}
      onViewAll={() => router.push('/history')}
    />
  );
}
