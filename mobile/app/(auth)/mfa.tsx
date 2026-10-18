import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../src/api/config';
import { MfaScreen } from '../../src/features/auth/ServerScreens';
import { serverAuth } from '../../src/features/auth/serverAuth';
import { useThemeMode } from '../../src/theme';

/** Server mode (ADR-026/027): the authenticator or a recovery code after the PIN. */
export default function MfaRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (!SERVER_MODE || !serverAuth.hasChallenge()) return <Redirect href="/login" />;
  return (
    <MfaScreen
      verify={(code) => serverAuth.verifyMfa(code, Date.now())}
      onDone={() => router.replace('/')}
      onRestart={() => router.replace('/login')}
    />
  );
}
