import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { MultiRequestScreen } from '../../../src/features/market/MultiRequestScreen';
import { multiRequestServer } from '../../../src/features/market/serverOffers';
import { useThemeMode } from '../../../src/theme';

/** New buy request in several currencies (ADR-059 Decision 5). Server builds only. */
export default function NewRequestRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (!SERVER_MODE) return <Redirect href="/marketplace" />;
  return <MultiRequestScreen source={multiRequestServer} onBack={() => router.back()} onDone={() => router.replace('/market/my-requests')} />;
}
