import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { DevicesScreen } from '../../../src/features/profile/DevicesScreen';
import { serverDevices } from '../../../src/features/profile/serverDevices';
import { useThemeMode } from '../../../src/theme';

/** Profile › Security › Signed-in devices (server builds only). */
export default function DevicesRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (!SERVER_MODE) return <Redirect href="/profile/security" />;
  return <DevicesScreen source={serverDevices} onBack={() => router.back()} />;
}
