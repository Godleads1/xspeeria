import type { ReactElement } from 'react';
import { PlaceholderScreen } from '../../src/features/shared/PlaceholderScreen';

export default function TrackRoute(): ReactElement {
  return (
    <PlaceholderScreen
      testID="track-screen"
      title="Track"
      message="Nothing in progress yet"
      actionLabel="Browse the marketplace"
    />
  );
}
