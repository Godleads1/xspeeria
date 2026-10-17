import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { CodeScreen, IDENTITY_BODY } from '../../../src/features/auth/SignupScreens';
import { signup, useSignup } from '../../../src/features/auth/signupStore';
import { useThemeMode } from '../../../src/theme';

export default function SignupOtpRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (!draft.phone) return <Redirect href="/signup/start" />;
  return (
    <CodeScreen
      testID="signup-otp"
      kind="phone"
      target={draft.phone}
      step={2}
      title="Verify Your Identity"
      body={IDENTITY_BODY}
      verifyLabel="Verify OTP"
      altLabel="Verify Using Selfie"
      onAlt={() => router.back()}
      onBack={() => router.back()}
      onVerified={() => {
        signup.update({ identityVerified: true });
        router.replace('/signup/details');
      }}
      random={Crypto.getRandomBytes}
    />
  );
}
