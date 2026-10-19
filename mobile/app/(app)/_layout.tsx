import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';

import { SERVER_MODE } from '../../src/api/config';
import { serverAuth } from '../../src/features/auth/serverAuth';
import { session } from '../../src/features/auth/session';
import { useIdleLock } from '../../src/features/auth/useIdleLock';
import { serverNotifications } from '../../src/features/notifications/serverNotifications';
import { useNotificationWatcher } from '../../src/features/notifications/unread';
import { serverRegions } from '../../src/features/kyc/serverKyc';
import { useRegionPrompt } from '../../src/features/kyc/regionPrompt';
import { color, useThemeMode } from '../../src/theme';

/**
 * Everything behind log-in (ADR-013). The root layout guards this group. Any touch counts as
 * activity for the 5-minute idle lock (ADR-024).
 */
export default function AppLayout(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  useIdleLock();
  const router = useRouter();
  // ADR-044: the bell's count, and a banner when something new arrives (server builds only).
  useNotificationWatcher(SERVER_MODE ? serverNotifications : null, (link) => router.push(link as Href));
  // ADR-042: offer a new country's check when the server sees the user there (once per sign-in).
  useRegionPrompt(SERVER_MODE ? serverRegions : null, (country) =>
    router.push({ pathname: '/region/new', params: { country } }),
  );
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
