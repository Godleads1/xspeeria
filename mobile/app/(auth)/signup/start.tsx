import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { GetStartedScreen } from '../../../src/features/auth/SignupScreens';
import { SERVER_MODE } from '../../../src/api/config';
import { useThemeMode } from '../../../src/theme';

export default function SignupStartRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <GetStartedScreen onNext={() => router.push(SERVER_MODE ? '/signup/details' : '/signup/verify')} onLogIn={() => router.replace('/login')} onTerms={() => router.push('/terms')} />;
}
