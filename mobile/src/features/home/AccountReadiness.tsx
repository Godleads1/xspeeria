/**
 * Account Readiness Region — the human-approved replacement for the former Balance Card.
 *
 * Exactly three dimensions: Identity/KYC, Security/qualifying MFA, Eligible to transact.
 * Beneficiary, payout and funding readiness are allocation-specific and must never
 * appear here. The region renders no currency amount of any kind.
 *
 * When all three are satisfied it collapses to a compact confirmation so it does not
 * permanently occupy the most valuable region of the screen.
 */

import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Body,
  Caption,
  Card,
  Headline,
  StatusChip,
  type StatusTone,
} from '../../components/primitives';
import type { ReadinessDimension, ReadinessState } from '../../fixtures';
import { color, radius, space } from '../../theme';

const TONE_FOR: Record<ReadinessState, StatusTone> = {
  complete: 'success',
  'action-required': 'warning',
  pending: 'neutral',
};

const LABEL_FOR: Record<ReadinessState, string> = {
  complete: 'Complete',
  'action-required': 'Action required',
  pending: 'Pending',
};

export function isFullyReady(dimensions: readonly ReadinessDimension[]): boolean {
  return dimensions.length > 0 && dimensions.every((d) => d.state === 'complete');
}

export function AccountReadiness({
  dimensions,
}: {
  dimensions: readonly ReadinessDimension[];
}): ReactElement {
  if (isFullyReady(dimensions)) {
    return (
      <Card testID="readiness-collapsed" style={styles.collapsed}>
        <View style={styles.collapsedRow}>
          <Headline>You&apos;re ready to transact</Headline>
          <StatusChip label="Complete" tone="success" />
        </View>
      </Card>
    );
  }

  return (
    <Card testID="readiness-expanded" style={styles.expanded}>
      <Headline>Account readiness</Headline>
      <View style={styles.list}>
        {dimensions.map((dimension) => (
          <View key={dimension.id} testID={`readiness-${dimension.id}`} style={styles.row}>
            <View style={styles.rowText}>
              <Body>{dimension.label}</Body>
              <Caption>{dimension.detail}</Caption>
            </View>
            <StatusChip label={LABEL_FOR[dimension.state]} tone={TONE_FOR[dimension.state]} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  expanded: { borderRadius: radius.xl },
  collapsed: { borderRadius: radius.xl },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopColor: color.border.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.xs,
  },
  rowText: { flexShrink: 1, gap: 2 },
});
