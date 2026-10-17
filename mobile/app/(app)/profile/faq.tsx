import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { FaqScreen } from '../../../src/features/faq/FaqScreen';
import { useThemeMode } from '../../../src/theme';

export default function FaqRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <FaqScreen onBack={() => router.back()} />;
}
