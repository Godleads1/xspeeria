import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { SERVER_MODE } from '../../../src/api/config';
import { SecondCheckInfoScreen } from '../../../src/features/security/SecondCheckInfoScreen';
import { TwoFactorScreen } from '../../../src/features/security/TwoFactorScreen';
import { requestStepUp } from '../../../src/features/security/stepUp';
import { useThemeMode } from '../../../src/theme';

/** Server builds: how we check it's you (ADR-054). Demo builds: the on-device authenticator. */
export default function TwoFactorRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (SERVER_MODE) return <SecondCheckInfoScreen onBack={() => router.back()} />;
  return (
    <TwoFactorScreen
      onBack={() => router.back()}
      onSetUpAuthenticator={() => router.push('/profile/authenticator-setup')}
      stepUp={requestStepUp}
      random={Crypto.getRandomBytes}
    />
  );
}
