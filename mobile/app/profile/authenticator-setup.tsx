import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { PROFILE_USER } from '../../src/features/profile/data';
import { AuthenticatorSetupScreen } from '../../src/features/security/AuthenticatorSetupScreen';

export default function AuthenticatorSetupRoute(): ReactElement {
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
