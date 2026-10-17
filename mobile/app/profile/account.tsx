import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { AccountDetailsScreen } from '../../src/features/profile/AccountDetailsScreen';
import { useThemeMode } from '../../src/theme';

export default function AccountDetailsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <AccountDetailsScreen onBack={() => router.back()} />;
}
