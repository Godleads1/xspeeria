import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { DetailsScreen } from '../../../src/features/auth/SignupScreens';
import { useSignup } from '../../../src/features/auth/signupStore';
import { useThemeMode } from '../../../src/theme';

export default function SignupDetailsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (!draft.identityVerified) return <Redirect href="/signup/start" />;
  return <DetailsScreen onBack={() => router.back()} onNext={() => router.push('/signup/email')} />;
}
