import { useEffect, type ReactElement } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAllHistory } from '../../../src/features/trade/history';
import { ReceiptScreen } from '../../../src/features/history/ReceiptScreen';
import { useThemeMode } from '../../../src/theme';
import { DemoOnly } from '../../../src/features/auth/DemoOnly';

/** The id is untrusted (deep links can set it); an unknown id returns to History. */
function ReceiptRoute(): ReactElement | null {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const all = useAllHistory();
  const item = typeof id === 'string' ? all.find((h) => h.id === id) : undefined;

  useEffect(() => {
    if (!item) router.back();
  }, [item, router]);

  if (!item) return null;
  return <ReceiptScreen item={item} onClose={() => router.back()} />;
}

/** ADR-096: demo only; a release build goes to Home. */
export default function ReceiptRouteGuarded(): ReactElement {
  return (
    <DemoOnly>
      <ReceiptRoute />
    </DemoOnly>
  );
}
