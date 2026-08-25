/**
 * Active activity.
 *
 * Discrete items only: open Offers, allocations requiring attention, in-flight
 * settlements. Each item carries its own amount. Amounts are never summed into one
 * figure — an aggregate currency hero reads as a balance regardless of its label, and
 * Xspeeria has no balance of any kind.
 *
 * The most time-critical item is surfaced first.
 *
 * Layout: title and amount on the first line, corridor and stage on the second, the next
 * action below a hairline. The amount stays right-aligned in a fixed column so tabular
 * figures line up down the list, which is the whole point of the numeric type role.
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Amount,
  Caption,
  Card,
  Divider,
  EmptyState,
  Headline,
  StatusChip,
} from '../../components/primitives';
import type { ActivityItem } from '../../fixtures';
import { color, space, typography } from '../../theme';

export function orderActivity(items: readonly ActivityItem[]): readonly ActivityItem[] {
  return [...items].sort((a, b) => Number(b.timeCritical ?? false) - Number(a.timeCritical ?? false));
}

export function ActivityList({
  items,
  onCreateOffer,
}: {
  items: readonly ActivityItem[];
  onCreateOffer?: () => void;
}): ReactElement {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No active offers"
        actionLabel="Create your first offer"
        onAction={onCreateOffer}
      />
    );
  }

  return (
    <View testID="activity-list" style={styles.list}>
      {orderActivity(items).map((item) => (
        <Card key={item.id} testID={`activity-${item.id}`} style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.titleColumn}>
              <Headline>{item.title}</Headline>
            </View>
            <View style={styles.amountColumn}>
              <Amount
                minor={item.amountMinor}
                currency={item.currency}
                scale={item.scale}
                label={item.title}
              />
            </View>
          </View>

          <View style={styles.metaRow}>
            <Caption>{item.pair}</Caption>
            <StatusChip label={item.status} tone={item.statusTone} />
          </View>

          {item.nextAction ? (
            <>
              <Divider />
              <Text style={styles.nextAction}>{item.nextAction}</Text>
            </>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  card: { padding: space.sm, gap: space.sm },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  titleColumn: { flexShrink: 1 },
  amountColumn: { alignItems: 'flex-end' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  /**
   * The next action reads as the affordance it is. `brand.secondaryText` is the
   * normal-size-text member of the brand family (5.17:1); `brand.secondary` would fail
   * AA at this size.
   */
  nextAction: { ...typography.rowLabel, color: color.brand.secondaryText },
});
