import { useCallback, useState, type ReactElement } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { MyDealsScreen } from '../../../src/features/market/MyDealsScreen';
import { myDeals } from '../../../src/features/market/serverOffers';
import { useThemeMode } from '../../../src/theme';

/** My Deals (ADR-033). Server builds only; the demo keeps its own History tab. */
export default function MyDealsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => setRefresh((n) => n + 1), []));
  if (!SERVER_MODE) return <Redirect href="/marketplace" />;
  return (
    <MyDealsScreen
      source={myDeals}
      refreshSignal={refresh}
      onBack={() => router.back()}
      onChoose={(match) => router.push({ pathname: '/market/payout-choice', params: { match } })}
    />
  );
}
