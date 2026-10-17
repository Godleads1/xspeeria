import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { session } from '../../../src/features/auth/session';
import { EnableBiometricsScreen } from '../../../src/features/auth/SignupScreens';
import { useSignup } from '../../../src/features/auth/signupStore';
import { useThemeMode } from '../../../src/theme';

export default function SignupBiometricsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (!draft.pin || !draft.emailVerified) return <Redirect href="/signup/start" />;
  return <EnableBiometricsScreen onNext={() => router.replace('/signup/done')} enable={() => session.setBiometric(true)} />;
}
