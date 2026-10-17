import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SecurityScreen } from '../../../src/features/profile/SecurityScreen';
import { useThemeMode } from '../../../src/theme';

export default function SecurityRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <SecurityScreen
      onBack={() => router.back()}
      onOpen={(d) => router.push(d === 'password' ? '/profile/change-password' : '/profile/two-factor')}
    />
  );
}
