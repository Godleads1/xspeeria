import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { TwoFactorScreen } from '../../src/features/security/TwoFactorScreen';
import { requestStepUp } from '../../src/features/security/stepUp';

export default function TwoFactorRoute(): ReactElement {
  const router = useRouter();
  return (
    <TwoFactorScreen
      onBack={() => router.back()}
      onSetUpAuthenticator={() => router.push('/profile/authenticator-setup')}
      stepUp={requestStepUp}
      random={Crypto.getRandomBytes}
    />
  );
}
