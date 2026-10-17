import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { ReferralScreen } from '../../../src/features/referral/ReferralScreen';
import { useThemeMode } from '../../../src/theme';

export default function ReferralRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <ReferralScreen onBack={() => router.back()} />;
}
