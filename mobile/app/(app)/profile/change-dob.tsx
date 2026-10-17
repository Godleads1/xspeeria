import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { ChangeDobScreen } from '../../../src/features/profile/ChangeDobScreen';
import { useThemeMode } from '../../../src/theme';

export default function ChangeDobRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <ChangeDobScreen onBack={() => router.back()} onDone={() => router.back()} />;
}
