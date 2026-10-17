import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { HistoryScreen } from '../../../src/features/history/HistoryScreen';
import { useAllHistory } from '../../../src/features/trade/history';
import { tradeStore } from '../../../src/features/trade/tradeStore';
import { useThemeMode } from '../../../src/theme';

/** History tab (ADR-006). Mock data only; a row opens its receipt. */
export default function HistoryRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const items = useAllHistory();
  return (
    <HistoryScreen
      items={items}
      onOpen={(item) => {
        // A trade still in progress opens its live screen; finished ones open the receipt.
        const live = tradeStore.get(item.id);
        if (live && live.phase !== 'completed' && live.phase !== 'expired' && live.phase !== 'cancelled') {
          router.push({ pathname: '/trade/[id]', params: { id: item.id } });
        } else {
          router.push({ pathname: '/history/[id]', params: { id: item.id } });
        }
      }}
    />
  );
}
