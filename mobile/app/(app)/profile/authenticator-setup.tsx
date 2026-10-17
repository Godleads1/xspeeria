import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { PROFILE_USER } from '../../../src/features/profile/data';
import { AuthenticatorSetupScreen } from '../../../src/features/security/AuthenticatorSetupScreen';
import { useThemeMode } from '../../../src/theme';

export default function AuthenticatorSetupRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <AuthenticatorSetupScreen
      account={PROFILE_USER.email}
      random={Crypto.getRandomBytes}
      onBack={() => router.back()}
      onDone={() => router.back()}
    />
  );
}
