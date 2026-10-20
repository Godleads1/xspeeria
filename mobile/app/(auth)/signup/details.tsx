import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { DetailsScreen } from '../../../src/features/auth/SignupScreens';
import { useSignup } from '../../../src/features/auth/signupStore';
import { SERVER_MODE } from '../../../src/api/config';
import { useThemeMode } from '../../../src/theme';

export default function SignupDetailsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const draft = useSignup();
  // Server mode (ADR-027): phone → email → PIN → SMS code; the server checks the phone.
  if (SERVER_MODE ? !draft.phone : !draft.identityVerified) return <Redirect href="/signup/start" />;
  return <DetailsScreen server={SERVER_MODE} onBack={() => router.back()} onNext={() => router.push(SERVER_MODE ? '/signup/pin' : '/signup/email')} />;
}
