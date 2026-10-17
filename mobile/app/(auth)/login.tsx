import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { LoginScreen } from '../../src/features/auth/LoginScreen';
import { useThemeMode } from '../../src/theme';

/** On success the root guard swaps to the signed-in app. */
export default function LoginRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <LoginScreen
      onDone={() => router.replace('/')}
      onSignUp={() => router.push('/signup/start')}
      onForgot={() => router.push('/forgot')}
    />
  );
}
