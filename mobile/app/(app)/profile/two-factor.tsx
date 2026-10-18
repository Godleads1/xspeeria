import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { SERVER_MODE } from '../../../src/api/config';
import { TwoFactorScreen } from '../../../src/features/security/TwoFactorScreen';
import { serverTwoFactor } from '../../../src/features/security/serverTwoFactor';
import { requestStepUp } from '../../../src/features/security/stepUp';
import { useThemeMode } from '../../../src/theme';

export default function TwoFactorRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <TwoFactorScreen
      onBack={() => router.back()}
      onSetUpAuthenticator={() => router.push('/profile/authenticator-setup')}
      stepUp={requestStepUp}
      random={Crypto.getRandomBytes}
      server={SERVER_MODE ? serverTwoFactor : null}
      onReplaceAuthenticator={() => router.push('/profile/authenticator-replace')}
    />
  );
}
