/**
 * Active activity.
 *
 * Discrete items only: open Offers, allocations requiring attention, in-flight
 * settlements. Each item carries its own amount. Amounts are never summed into one
 * figure — an aggregate currency hero reads as a balance regardless of its label, and
 * Xspeeria has no balance of any kind.
 *
 * The most time-critical item is surfaced first.
 */

import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Amount,
  Body,
  Caption,
  Card,
  EmptyState,
  Headline,
  StatusChip,
} from '../../components/primitives';
import type { ActivityItem } from '../../fixtures';
import { space } from '../../theme';

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
        <Card key={item.id} testID={`activity-${item.id}`}>
          <View style={styles.header}>
            <Headline>{item.title}</Headline>
            <StatusChip label={item.status} tone={item.statusTone} />
          </View>
          <Caption>{item.pair}</Caption>
          <Amount
            minor={item.amountMinor}
            currency={item.currency}
            scale={item.scale}
            label={item.title}
          />
          {item.nextAction ? <Body>{item.nextAction}</Body> : null}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
});
