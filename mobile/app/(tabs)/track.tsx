import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { PlaceholderScreen } from '../../src/features/shared/PlaceholderScreen';

export default function TrackRoute(): ReactElement {
  const router = useRouter();
  return (
    <PlaceholderScreen
      testID="track-screen"
      title="Track"
      message="Nothing in progress yet"
      actionLabel="Browse the marketplace"
      onAction={() => router.push('/marketplace')}
    />
  );
}
