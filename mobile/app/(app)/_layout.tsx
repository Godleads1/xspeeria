import type { ReactElement } from 'react';
import { Stack } from 'expo-router';

import { color, useThemeMode } from '../../src/theme';

/** Everything behind log-in (ADR-013). The root layout guards this group. */
export default function AppLayout(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas } }} />;
}
