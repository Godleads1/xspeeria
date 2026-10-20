/**
 * Phone push (ADR-052, N-3). Server builds on a real phone only.
 *
 * After sign-in the app asks once for permission, gets this phone's Expo push token and gives
 * it to the server for the current session (pushes stop when that session ends). While the app
 * is open the in-app banner (ADR-044) shows news instead of a system pop-up. Tapping a push
 * opens the screen for that notification; its contents are untrusted, so the link is rebuilt
 * from the event name and validated ids (`notificationCopy`), never taken from the push.
 *
 * `expo-notifications` is loaded only when needed and never in Expo Go: Expo Go on Android has
 * no push support and lacks some of its native parts, so importing it there would crash the app.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';

import { notificationsApi } from '../../api/notificationsApi';
import { serverAuth } from '../auth/serverAuth';
import { notificationCopy } from './notificationCopy';

type Notifications = typeof NotificationsModule;
let loaded: Notifications | null | undefined;

/** The notifications module, or null where push cannot work (Expo Go, web, missing native parts). */
export function notificationsModule(): Notifications | null {
  if (loaded !== undefined) return loaded;
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    loaded = null;
    return loaded;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-notifications') as Notifications;
  } catch {
    loaded = null;
  }
  return loaded;
}

/** Tests only. */
export function resetNotificationsModule(): void {
  loaded = undefined;
}

export type PushOutcome = 'registered' | 'denied' | 'unsupported' | 'failed';

export interface PushDeps {
  platform: string;
  isDevice: boolean;
  permission: () => Promise<boolean>;
  ask: () => Promise<boolean>;
  channel: () => Promise<void>;
  token: () => Promise<string>;
  register: (token: string, platform: 'ios' | 'android') => Promise<void>;
}

const TOKEN = /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

export async function registerForPush(d: PushDeps): Promise<PushOutcome> {
  if (!d.isDevice || (d.platform !== 'ios' && d.platform !== 'android')) return 'unsupported';
  try {
    if (d.platform === 'android') await d.channel();
    const allowed = (await d.permission()) || (await d.ask());
    if (!allowed) return 'denied';
    const token = await d.token();
    if (!TOKEN.test(token)) return 'failed';
    await d.register(token, d.platform);
    return 'registered';
  } catch {
    return 'failed';
  }
}

/** Where a tapped push should go, rebuilt from its event name and ids. Null for anything odd. */
export function pushLink(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { event, data: inner } = data as { event?: unknown; data?: unknown };
  if (typeof event !== 'string' || event.length > 64) return null;
  const ids: Record<string, string> = {};
  if (inner && typeof inner === 'object') {
    for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length <= 64) ids[k] = v;
    }
  }
  return notificationCopy({ event, data: ids }).link;
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

function need(): Notifications {
  const n = notificationsModule();
  if (!n) throw new Error('push unavailable here');
  return n;
}

export const realPushDeps: PushDeps = {
  platform: Platform.OS,
  isDevice: Device.isDevice,
  permission: async () => (await need().getPermissionsAsync()).granted,
  ask: async () => (await need().requestPermissionsAsync()).granted,
  channel: async () => {
    const n = need();
    await n.setNotificationChannelAsync('default', {
      name: 'Xspeeria',
      importance: n.AndroidImportance.HIGH,
    });
  },
  token: async () => (await need().getExpoPushTokenAsync({ projectId: projectId() })).data,
  register: async (token, platform) => {
    const access = serverAuth.accessToken();
    if (!access) throw new Error('signed out');
    await notificationsApi.registerPush(access, { token, platform }, serverAuth.apiOptions());
  },
};

/** Signed-in layout (server builds): register this phone and open tapped pushes. */
export function usePushNotifications(enabled: boolean, open: (link: string) => void): void {
  useEffect(() => {
    const Notifications = enabled ? notificationsModule() : null;
    if (!Notifications) return undefined;
    // The in-app banner covers news while the app is open.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    void registerForPush(realPushDeps);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = pushLink(r.notification.request.content.data);
      if (link) open(link);
    });
    return () => sub.remove();
  }, [enabled, open]);
}
