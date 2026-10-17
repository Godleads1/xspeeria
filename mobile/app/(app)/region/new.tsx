import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { NewLocationScreen } from '../../../src/features/auth/RegionScreens';
import { session } from '../../../src/features/auth/session';
import { useThemeMode } from '../../../src/theme';

export default function NewLocationRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <NewLocationScreen
      onConfirm={() => router.push('/region/verify')}
      onSkip={() => {
        session.clearNewRegion();
        router.replace('/');
      }}
    />
  );
}
