import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { TermsScreen } from '../../src/features/legal/TermsScreen';
import { useThemeMode } from '../../src/theme';

/** Terms for people who are not signed in yet (linked from sign-up). */
export default function PublicTermsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <TermsScreen onBack={() => router.back()} />;
}
