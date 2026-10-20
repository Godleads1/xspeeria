import { useCallback, useState, type ReactElement } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { DisputesScreen } from '../../../src/features/disputes/DisputeScreens';
import { serverDisputes } from '../../../src/features/disputes/serverDisputes';
import { useThemeMode } from '../../../src/theme';

/** Disputes & support (ADR-057, ADR-050). Server builds only. */
export default function DisputesRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => setRefresh((n) => n + 1), []));
  if (!SERVER_MODE) return <Redirect href="/marketplace" />;
  return (
    <DisputesScreen
      source={serverDisputes}
      refreshSignal={refresh}
      onBack={() => router.back()}
      onOpen={(id) => router.push({ pathname: '/market/case', params: { id } })}
      onNew={() => router.push('/market/new-case')}
    />
  );
}
