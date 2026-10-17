import { useEffect, type ReactElement } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { HISTORY } from '../../src/features/history/data';
import { ReceiptScreen } from '../../src/features/history/ReceiptScreen';
import { useThemeMode } from '../../src/theme';

/** The id is untrusted (deep links can set it); an unknown id returns to History. */
export default function ReceiptRoute(): ReactElement | null {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const item = typeof id === 'string' ? HISTORY.find((h) => h.id === id) : undefined;

  useEffect(() => {
    if (!item) router.back();
  }, [item, router]);

  if (!item) return null;
  return <ReceiptScreen item={item} onClose={() => router.back()} />;
}
