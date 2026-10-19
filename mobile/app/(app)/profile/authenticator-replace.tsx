import { useMemo, type ReactElement } from 'react';
import { Alert } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { messageFor } from '../../../src/api/client';
import { SERVER_MODE } from '../../../src/api/config';
import { AuthenticatorSetupScreen, type EnrolmentEngine } from '../../../src/features/security/AuthenticatorSetupScreen';
import { serverTwoFactor } from '../../../src/features/security/serverTwoFactor';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";

/**
 * Replace the authenticator (ADR-034, server builds only). Opens only after the current code
 * was accepted on the 2 FA screen; the new secret is held in memory, never in the route.
 */
export default function AuthenticatorReplaceRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const engine = useMemo<EnrolmentEngine>(
    () => ({
      begin: () => serverTwoFactor.pendingReplace(),
      confirm: (code) => serverTwoFactor.confirmReplace(code),
      messageFor,
    }),
    [],
  );
  if (!SERVER_MODE || !serverTwoFactor.hasPendingReplace()) return <Redirect href="/profile/two-factor" />;
  return (
    <AuthenticatorSetupScreen
      account=""
      random={Crypto.getRandomBytes}
      engine={engine}
      onBack={() => {
        serverTwoFactor.cancelReplace();
        router.back();
      }}
      onDone={() => {
        router.back();
        Alert.alert(
          tr("Authenticator replaced"),
          tr("Your new app is now the one we ask for. Logging in on any phone will need a code again."),
        );
      }}
    />
  );
}
