/**
 * Notification centre (ADR-044 N-2; Product Design Specification §5.3).
 *
 * Grouped Today / This week / Earlier, newest first; unread rows are bold with a dot and read
 * "Unread: …" to screen readers (never colour alone). Tapping marks the row read and opens its
 * screen. Empty: "You’re all caught up". Error: inline retry. More rows load at the end.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../api/client';
import type { ServerNotification } from '../../api/notificationsApi';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState, Screen } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { notificationCopy, type Tone } from './notificationCopy';
import type { NotificationSource } from './serverNotifications';
import { setUnreadCount } from './unread';

const DAY = 24 * 60 * 60 * 1000;

export function groupOf(createdAt: string, now: Date): 'Today' | 'This week' | 'Earlier' {
  const t = new Date(createdAt);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t.getTime() >= start) return 'Today';
  if (t.getTime() >= start - 6 * DAY) return 'This week';
  return 'Earlier';
}

function timeLabel(createdAt: string, now: Date): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  if (groupOf(createdAt, now) === 'Today') {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function toneColor(t: Tone): string {
  if (t === 'success') return color.success.fill;
  if (t === 'warning') return color.warning.fill;
  if (t === 'error') return color.error.fill;
  return color.brand.secondary;
}

export function NotificationsScreen({
  source,
  onBack,
  onOpen,
  now = () => new Date(),
}: {
  source: NotificationSource;
  onBack: () => void;
  /** Opens a notification's screen (an app route built from validated ids). */
  onOpen: (link: string) => void;
  now?: () => Date;
}): ReactElement {
  const [items, setItems] = useState<ServerNotification[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(() => {
    setError(null);
    source.list().then(
      (page) => {
        setItems(page.items);
        setNext(page.next_before);
        setUnreadCount(page.unread_count);
      },
      (e: unknown) => setError(messageFor(e)),
    );
  }, [source]);
  useEffect(load, [load]);

  const loadMore = (): void => {
    if (!next || more) return;
    setMore(true);
    source
      .list(next)
      .then(
        (page) => {
          setItems((old) => [...(old ?? []), ...page.items]);
          setNext(page.next_before);
        },
        () => undefined, // the rows already shown stay; scrolling again retries
      )
      .finally(() => setMore(false));
  };

  const open = (n: ServerNotification): void => {
    const copy = notificationCopy(n);
    if (!n.read) {
      setItems((old) => (old ?? []).map((x) => (x.notification_id === n.notification_id ? { ...x, read: true } : x)));
      source.mark(n.notification_id, true).catch(() => {
        // Could not save: show it unread again.
        setItems((old) => (old ?? []).map((x) => (x.notification_id === n.notification_id ? { ...x, read: false } : x)));
      });
      setUnreadCount(Math.max(0, (items ?? []).filter((x) => !x.read).length - 1));
    }
    if (copy.link) onOpen(copy.link);
  };

  const header = (
    <View style={styles.header}>
      <Pressable testID="notifications-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
        <Icon name="back" color={color.text.primary} size={24} weight={2.25} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>
        Notifications
      </Text>
      <View style={styles.spacer} />
    </View>
  );

  if (items === null) {
    return (
      <Screen testID="notifications-screen">
        {header}
        {error ? <ErrorState title={error} onRetry={load} /> : <LoadingState label="Loading your notifications" />}
      </Screen>
    );
  }

  const today = now();
  const order = ['Today', 'This week', 'Earlier'] as const;
  const sections = order
    .map((g) => ({ title: g, data: items.filter((n) => groupOf(n.created_at, today) === g) }))
    .filter((s) => s.data.length > 0);

  return (
    <View testID="notifications-screen" style={styles.screen}>
      <View style={styles.pad}>{header}</View>
      {sections.length === 0 ? (
        <View testID="notifications-empty" style={styles.empty}>
          <Icon name="bell" color={color.text.secondary} size={40} />
          <Text style={styles.emptyText}>You’re all caught up</Text>
        </View>
      ) : (
        <SectionList
          testID="notifications-list"
          sections={sections}
          keyExtractor={(n) => n.notification_id}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => <Text style={styles.group}>{section.title}</Text>}
          renderItem={({ item }) => {
            const copy = notificationCopy(item);
            return (
              <Pressable
                testID={`notification-${item.notification_id}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.read ? '' : 'Unread: '}${copy.title}. ${copy.body}`}
                onPress={() => open(item)}
                style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
              >
                <View style={[styles.mark, { backgroundColor: toneColor(copy.tone) }]} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, item.read ? null : styles.unreadTitle]}>{copy.title}</Text>
                  <Text style={styles.rowBody}>{copy.body}</Text>
                  <Text style={styles.rowTime}>{timeLabel(item.created_at, today)}</Text>
                </View>
                {item.read ? null : <View testID="notification-unread-dot" style={styles.dot} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  pad: { paddingHorizontal: space.md, paddingTop: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.headline, color: color.text.primary },
  spacer: { width: 24 },
  list: { paddingHorizontal: space.md, paddingBottom: space.lg },
  group: { ...typography.caption, ...brandWeight('700'), color: color.text.secondary, marginTop: space.md, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  rowPressed: { backgroundColor: color.bg.sunken },
  mark: { width: 8, height: 8, borderRadius: 2, marginTop: 6 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, color: color.text.primary },
  unreadTitle: { ...brandWeight('700') },
  rowBody: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  rowTime: { ...typography.caption, color: color.text.secondary },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.brand.secondary, marginTop: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { ...typography.headline, color: color.text.primary },
}));
