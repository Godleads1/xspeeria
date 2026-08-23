/**
 * Account Readiness Region — the human-approved replacement for the former Balance Card.
 *
 * Exactly three dimensions: Identity/KYC, Security/qualifying MFA, Eligible to transact.
 * Beneficiary, payout and funding readiness are allocation-specific and must never
 * appear here. The region renders no currency amount of any kind.
 *
 * When all three are satisfied it collapses to a compact confirmation so it does not
 * permanently occupy the most valuable region of the screen.
 *
 * `radius.xl` (32) is reserved to this component by the design system.
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Caption,
  Card,
  Divider,
  Headline,
  StatusChip,
  type StatusTone,
} from '../../components/primitives';
import type { ReadinessDimension, ReadinessState } from '../../fixtures';
import { color, radius, space, typography } from '../../theme';

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

/**
 * The three dimensions that must each be present exactly once for the region to
 * collapse. Kept as a literal rather than derived from the payload: deriving it would
 * let a short payload define its own definition of "ready".
 */
const REQUIRED_DIMENSIONS = ['identity', 'security', 'eligibility'] as const;

/**
 * True only when all three approved dimensions are present, each exactly once, and
 * every one is complete.
 *
 * The collapsed state renders "You're ready to transact", which is a claim about
 * identity and security verification. A payload that omits a dimension has not proven
 * it -- so a partial array, a duplicate id, or a required dimension swapped for another
 * one all read as not ready. Eligibility is never inferred from an incomplete answer.
 */
export function isFullyReady(dimensions: readonly ReadinessDimension[]): boolean {
  if (dimensions.length !== REQUIRED_DIMENSIONS.length) {
    return false;
  }
  const ids = new Set(dimensions.map((d) => d.id));
  if (ids.size !== dimensions.length) {
    return false;
  }
  if (!REQUIRED_DIMENSIONS.every((id) => ids.has(id))) {
    return false;
  }
  return dimensions.every((d) => d.state === 'complete');
}

export function AccountReadiness({
  dimensions,
}: {
  dimensions: readonly ReadinessDimension[];
}): ReactElement {
  if (isFullyReady(dimensions)) {
    return (
      <Card testID="readiness-collapsed" style={styles.card}>
        <View style={styles.collapsedRow}>
          <Headline>You&apos;re ready to transact</Headline>
          <StatusChip label="Complete" tone="success" />
        </View>
      </Card>
    );
  }

  const done = dimensions.filter((d) => d.state === 'complete').length;

  return (
    <Card testID="readiness-expanded" style={styles.card}>
      <View style={styles.cardHeader}>
        <Headline>Account readiness</Headline>
        {/* A count of steps, never a currency figure. */}
        <Caption>{`${done} of ${dimensions.length} complete`}</Caption>
      </View>

      <View style={styles.list}>
        {dimensions.map((dimension, index) => (
          <View key={dimension.id} testID={`readiness-${dimension.id}`}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{dimension.label}</Text>
                <Caption>{dimension.detail}</Caption>
              </View>
              <StatusChip label={LABEL_FOR[dimension.state]} tone={TONE_FOR[dimension.state]} />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  /** `space.sm` (16) is the frozen card padding (`docs/09-ui-ux/xspeeria-design-bible.md`, page 6). */
  card: { borderRadius: radius.xl, padding: space.sm, gap: space.sm },
  cardHeader: { gap: 2 },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  list: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingVertical: 14,
  },
  /**
   * The row label is the primary text colour and the detail is secondary. Typography
   * and colour carry the hierarchy here; a tint would only add 1.05:1.
   */
  rowLabel: { ...typography.rowLabel, color: color.text.primary },
  rowText: { flexShrink: 1, gap: 2 },
});
