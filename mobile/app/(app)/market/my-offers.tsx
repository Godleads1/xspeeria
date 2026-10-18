import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { MyOffersScreen } from '../../../src/features/market/MyOffersScreen';
import { myOffers } from '../../../src/features/market/serverOffers';
import { useThemeMode } from '../../../src/theme';

/** My Offers (ADR-030). Server builds only; the demo has no stored offers. */
export default function MyOffersRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (!SERVER_MODE) return <Redirect href="/marketplace" />;
  return <MyOffersScreen source={myOffers} onBack={() => router.back()} />;
}
