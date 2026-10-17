import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';

import { CodeScreen } from '../../../src/features/auth/SignupScreens';
import { signup, useSignup } from '../../../src/features/auth/signupStore';
import { useThemeMode } from '../../../src/theme';

/** Not in Figma: the email is confirmed with a code, like every email change (ADR-011). */
export default function SignupEmailRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (!draft.identityVerified || !draft.email) return <Redirect href="/signup/start" />;
  return (
    <CodeScreen
      testID="signup-email-code"
      kind="email"
      target={draft.email}
      step={3}
      title="Confirm your email"
      body="We sent a 6-digit code to your email address to make sure it is yours."
      verifyLabel="Confirm email"
      onBack={() => router.back()}
      onVerified={() => {
        signup.update({ emailVerified: true });
        router.replace('/signup/pin');
      }}
      random={Crypto.getRandomBytes}
    />
  );
}
