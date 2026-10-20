import type { ReactElement } from 'react';
import { useRouter, type Href } from 'expo-router';

import { SERVER_MODE } from '../../src/api/config';
import { NotificationsScreen } from '../../src/features/notifications/NotificationsScreen';
import { demoNotifications, serverNotifications } from '../../src/features/notifications/serverNotifications';
import { useThemeMode } from '../../src/theme';

/** Notification centre (ADR-044). Demo builds have no server: the empty state. */
export default function NotificationsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <NotificationsScreen
      source={SERVER_MODE ? serverNotifications : demoNotifications}
      onBack={() => router.back()}
      onOpen={(link) => router.push(link as Href)}
    />
  );
}
