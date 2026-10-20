/**
 * Unread count for the bell, and a banner when something new arrives while the app is open
 * (ADR-044 N-2). The server is the only source of truth; this keeps the last answer in memory.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { showBanner } from '../../components/Banner';
import { session } from '../auth/session';
import { notificationCopy } from './notificationCopy';
import type { NotificationSource } from './serverNotifications';

export const POLL_MS = 30_000;

let unread = 0;
let newestSeen: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function set(n: number): void {
  if (n === unread) return;
  unread = n;
  for (const l of listeners) l();
}

/** The number on the bell. */
export function useUnreadCount(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => unread,
    () => unread,
  );
}

/** The notifications screen changed what is read: show its count at once. */
export function setUnreadCount(n: number): void {
  set(Math.max(0, n));
}

/** For tests and sign-out. */
export function resetUnread(): void {
  unread = 0;
  newestSeen = null;
  loaded = false;
  for (const l of listeners) l();
}

/**
 * Asks the server once. On the first answer nothing is announced (the user has not seen the
 * app yet, the bell is enough); afterwards a newer unread message shows a banner.
 */
export async function refreshUnread(source: NotificationSource, open: (link: string) => void): Promise<void> {
  const page = await source.list();
  set(page.unread_count);
  const newest = page.items[0];
  if (loaded && newest && newest.notification_id !== newestSeen && !newest.read) {
    const copy = notificationCopy(newest);
    showBanner({
      tone: copy.tone,
      title: copy.title,
      message: copy.body,
      onPress: copy.link ? () => open(copy.link as string) : undefined,
    });
  }
  if (newest) newestSeen = newest.notification_id;
  loaded = true;
}

/** Keeps the count fresh while signed in: now, every 30 s, and when the app comes back. */
export function useNotificationWatcher(
  source: NotificationSource | null,
  open: (link: string) => void,
  pollMs: number = POLL_MS,
): void {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!source) return undefined;
    const tick = (): void => {
      refreshUnread(source, (l) => openRef.current(l)).catch(() => {
        /* Offline or signed out: keep the last count; the next tick tries again. */
      });
    };
    tick();
    const t = setInterval(tick, pollMs);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [source, pollMs]);
}

// Log-out or another account: nothing from the last user stays on the bell.
session.onUserChange(() => resetUnread());
