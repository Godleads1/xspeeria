import type { ReactElement } from 'react';
import { HomeScreen } from '../../src/features/home/HomeScreen';
import { ACTIVITY_ITEMS, READINESS_INCOMPLETE } from '../../src/fixtures';

export default function HomeRoute(): ReactElement {
  return <HomeScreen dimensions={READINESS_INCOMPLETE} activity={ACTIVITY_ITEMS} />;
}
