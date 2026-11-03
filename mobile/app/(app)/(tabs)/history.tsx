import { useMemo, type ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { HistoryScreen } from '../../../src/features/history/HistoryScreen';
import { dealTotals } from '../../../src/features/history/dealTotals';
import { dealsToHistory } from '../../../src/features/history/serverHistory';
import { serverDeals, useServerData } from '../../../src/features/history/serverDeals';
import { useAllHistory } from '../../../src/features/trade/history';
import { tradeStore } from '../../../src/features/trade/tradeStore';
import { useThemeMode } from '../../../src/theme';

const loadDeals = (): ReturnType<typeof serverDeals.deals> => serverDeals.deals();

/**
 * History tab (ADR-006). Server builds: my real deals (ADR-045); a row opens that deal's
 * escrow steps, which is its receipt. Demo: mock data.
 */
export default function HistoryRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const demo = useAllHistory();
  const { data } = useServerData(SERVER_MODE ? loadDeals : null);
  const items = useMemo(() => (SERVER_MODE ? dealsToHistory(data ?? []) : demo), [data, demo]);
  // ADR-097: totals of completed deals, server builds only (never on Home: no aggregate figure there).
  const totals = useMemo(() => (SERVER_MODE && data ? dealTotals(data) : null), [data]);
  return (
    <HistoryScreen
      items={items}
      totals={totals}
      onOpen={(item) => {
        if (SERVER_MODE) {
          router.push({ pathname: '/market/escrow', params: { match: item.id } });
          return;
        }
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
