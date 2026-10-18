import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { SERVER_MODE } from '../../src/api/config';
import { serverAuth } from '../../src/features/auth/serverAuth';
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
    <View
      style={{ flex: 1 }}
      onTouchStart={() => {
        const now = Date.now();
        session.touch(now);
        // ADR-027: activity keeps the server session alive (refresh at most every 4 minutes).
        if (SERVER_MODE) void serverAuth.keepAlive(now);
      }}
    >
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg.canvas } }} />
    </View>
  );
}
