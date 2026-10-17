import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { HistoryScreen } from '../../src/features/history/HistoryScreen';
import { useThemeMode } from '../../src/theme';

/** History tab (ADR-006). Mock data only; a row opens its receipt. */
export default function HistoryRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <HistoryScreen
      onOpen={(item) => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
    />
  );
}
