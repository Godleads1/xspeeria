import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { MyOffersScreen } from '../../../src/features/market/MyOffersScreen';
import { myOffers } from '../../../src/features/market/serverOffers';
import { useThemeMode } from '../../../src/theme';

/** My Requests (ADR-056): the user's buy requests. Server builds only. */
export default function MyRequestsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (!SERVER_MODE) return <Redirect href="/marketplace" />;
  return <MyOffersScreen source={myOffers} show="requests" onBack={() => router.back()} />;
}
