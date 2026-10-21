import type { ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { CaseScreen } from '../../../src/features/disputes/DisputeScreens';
import { serverDisputes } from '../../../src/features/disputes/serverDisputes';
import { useThemeMode } from '../../../src/theme';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One dispute or support case (ADR-057). The id param is untrusted; the server checks access. */
export default function CaseRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!SERVER_MODE || typeof id !== 'string' || !UUID.test(id)) return <Redirect href="/market/disputes" />;
  return <CaseScreen id={id} source={serverDisputes} onBack={() => router.back()} />;
}
