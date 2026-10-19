import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SERVER_MODE } from '../../src/api/config';
import { ForgotScreen } from '../../src/features/auth/ForgotScreen';
import { ServerForgotScreen } from '../../src/features/auth/ServerForgotScreen';
import { serverPin } from '../../src/features/auth/serverPin';
import { useThemeMode } from '../../src/theme';

/** Forgot PIN. Server builds: SMS code + second factor + new PIN (ADR-046). Demo: Figma only. */
export default function ForgotRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (SERVER_MODE) return <ServerForgotScreen source={serverPin} onBack={() => router.back()} />;
  return <ForgotScreen onBack={() => router.back()} />;
}
