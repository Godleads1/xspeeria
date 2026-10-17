import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { HistoryScreen } from '../../src/features/history/HistoryScreen';

/** History tab (ADR-006). Mock data only; a row opens its receipt. */
export default function HistoryRoute(): ReactElement {
  const router = useRouter();
  return (
    <HistoryScreen
      onOpen={(item) => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
    />
  );
}
