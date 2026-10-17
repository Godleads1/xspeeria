import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { ConfirmPinScreen } from '../../../src/features/auth/SignupScreens';
import { useSignup } from '../../../src/features/auth/signupStore';
import { useThemeMode } from '../../../src/theme';

export default function SignupConfirmPinRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (!draft.emailVerified) return <Redirect href="/signup/start" />;
  if (!draft.pin) return <Redirect href="/signup/pin" />;
  return <ConfirmPinScreen onNext={() => router.replace('/signup/biometrics')} onRestart={() => router.replace('/signup/pin')} />;
}
