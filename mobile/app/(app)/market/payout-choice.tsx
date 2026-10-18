import { useCallback, useState, type ReactElement } from 'react';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { ChoosePayoutScreen } from '../../../src/features/payouts/ChoosePayoutScreen';
import { serverPayouts } from '../../../src/features/payouts/serverPayouts';
import { useThemeMode } from '../../../src/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Choose payout accounts for a deal (ADR-036). The match id param is untrusted and re-read. */
export default function PayoutChoiceRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { match } = useLocalSearchParams<{ match?: string }>();
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => setRefresh((n) => n + 1), []));
  if (!SERVER_MODE || typeof match !== 'string' || !UUID.test(match)) return <Redirect href="/market/deals" />;
  return (
    <ChoosePayoutScreen
      matchId={match}
      source={serverPayouts}
      refreshSignal={refresh}
      onBack={() => router.back()}
      onAddAccount={(currency) => router.push({ pathname: '/profile/add-payout-account', params: { currency } })}
    />
  );
}
