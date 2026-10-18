import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { session } from '../../src/features/auth/session';
import { useIdleLock } from '../../src/features/auth/useIdleLock';
import { color, useThemeMode } from '../../src/theme';

/**
 * Everything behind log-in (ADR-013). The root layout guards this group. Any touch counts as
 * activity for the 5-minute idle lock (ADR-024).
 */
export default function AppLayout(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  useIdleLock();
  return (
    <View style={{ flex: 1 }} onTouchStart={() => session.touch(Date.now())}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas } }} />
    </View>
  );
}
