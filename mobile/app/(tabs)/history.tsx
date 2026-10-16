import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { PlaceholderScreen } from '../../src/features/shared/PlaceholderScreen';

export default function HistoryRoute(): ReactElement {
  const router = useRouter();
  return (
    <PlaceholderScreen
      testID="history-screen"
      title="History"
      message="Nothing in progress yet"
      actionLabel="Browse the marketplace"
      onAction={() => router.push('/marketplace')}
    />
  );
}
