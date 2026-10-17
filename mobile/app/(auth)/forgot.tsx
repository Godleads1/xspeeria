import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { ForgotScreen } from '../../src/features/auth/ForgotScreen';
import { useThemeMode } from '../../src/theme';

export default function ForgotRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <ForgotScreen onBack={() => router.back()} />;
}
