import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { VerifyIdentityScreen } from '../../../src/features/auth/SignupScreens';
import { useSignup } from '../../../src/features/auth/signupStore';
import { useThemeMode } from '../../../src/theme';

export default function SignupVerifyRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (!draft.phone) return <Redirect href="/signup/start" />;
  return <VerifyIdentityScreen onBack={() => router.back()} onVerified={() => router.push('/signup/details')} onUseOtp={() => router.push('/signup/otp')} />;
}
