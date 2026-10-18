import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { CreatePinScreen } from '../../../src/features/auth/SignupScreens';
import { useSignup } from '../../../src/features/auth/signupStore';
import { SERVER_MODE } from '../../../src/api/config';
import { useThemeMode } from '../../../src/theme';

export default function SignupPinRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  if (SERVER_MODE ? !draft.email : !draft.emailVerified) return <Redirect href="/signup/start" />;
  return <CreatePinScreen onNext={() => router.push('/signup/confirm-pin')} />;
}
