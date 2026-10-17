import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { WelcomeScreen } from '../../src/features/auth/WelcomeScreen';
import { useThemeMode } from '../../src/theme';

export default function WelcomeRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <WelcomeScreen onSignUp={() => router.push('/signup/start')} onLogIn={() => router.push('/login')} />;
}
