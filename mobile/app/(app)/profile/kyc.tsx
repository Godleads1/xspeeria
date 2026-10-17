import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { KycLimitsScreen } from '../../../src/features/profile/KycLimitsScreen';
import { useThemeMode } from '../../../src/theme';

export default function KycRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <KycLimitsScreen onBack={() => router.back()} />;
}
