import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { ChangePasswordScreen } from '../../../src/features/profile/ChangePasswordScreen';
import { useThemeMode } from '../../../src/theme';

export default function ChangePasswordRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <ChangePasswordScreen onBack={() => router.back()} />;
}
