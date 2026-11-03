import type { ReactElement } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { TradeScreen } from '../../../src/features/trade/TradeScreen';
import { useTrade } from '../../../src/features/trade/tradeStore';
import { useThemeMode } from '../../../src/theme';
import { DemoOnly } from '../../../src/features/auth/DemoOnly';

/** The id is untrusted (deep links); only a trade from this session opens. */
function TradeRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const trade = useTrade(typeof id === 'string' ? id : '');
  if (!trade) return <Redirect href="/" />;
  return (
    <TradeScreen
      id={trade.id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onReceipt={() => router.push({ pathname: '/history/[id]', params: { id: trade.id } })}
      onFinish={() => router.replace('/history')}
      onSupport={() => router.push('/profile/support')}
      onOpenTrade={(other) => router.push({ pathname: '/trade/[id]', params: { id: other } })}
    />
  );
}

/** ADR-096: demo only; a release build goes to Home. */
export default function TradeRouteGuarded(): ReactElement {
  return (
    <DemoOnly>
      <TradeRoute />
    </DemoOnly>
  );
}
