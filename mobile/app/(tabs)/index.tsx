import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { HomeScreen } from '../../src/features/home/HomeScreen';
import { ACTIVITY_ITEMS, READINESS_INCOMPLETE } from '../../src/fixtures';

export default function HomeRoute(): ReactElement {
  const router = useRouter();
  return (
    <HomeScreen
      dimensions={READINESS_INCOMPLETE}
      activity={ACTIVITY_ITEMS}
      onCreateOffer={() => router.push('/marketplace')}
    />
  );
}
