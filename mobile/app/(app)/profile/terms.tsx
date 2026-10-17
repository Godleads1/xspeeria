import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { TermsScreen } from '../../../src/features/legal/TermsScreen';
import { useThemeMode } from '../../../src/theme';

export default function TermsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <TermsScreen onBack={() => router.back()} />;
}
