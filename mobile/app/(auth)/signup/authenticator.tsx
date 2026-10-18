import { useMemo, type ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { messageFor } from '../../../src/api/client';
import { SERVER_MODE } from '../../../src/api/config';
import { serverAuth } from '../../../src/features/auth/serverAuth';
import { AuthenticatorSetupScreen, type EnrolmentEngine } from '../../../src/features/security/AuthenticatorSetupScreen';
import { useThemeMode } from '../../../src/theme';

/**
 * Server mode only (ADR-026/027): 2FA is set up at sign-up, always — and at log-in for an
 * account whose sign-up stopped before this step. The secret comes from the server.
 */
export default function SignupAuthenticatorRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const engine = useMemo<EnrolmentEngine>(
    () => ({ begin: () => serverAuth.enrolStart(), confirm: (code) => serverAuth.enrolConfirm(code), messageFor }),
    [],
  );
  if (!SERVER_MODE || !serverAuth.hasChallenge()) return <Redirect href="/signup/start" />;
  return (
    <AuthenticatorSetupScreen
      account=""
      random={Crypto.getRandomBytes}
      engine={engine}
      onBack={() => router.replace('/login')}
      onDone={() => router.replace('/signup/done')}
    />
  );
}
