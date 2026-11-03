/**
 * History, server builds (ADR-097): what completed deals added up to, per currency. Not a
 * balance: Xspeeria holds no money, and the card says so. Nothing shows before a first
 * completed deal.
 */

import type { ReactElement } from 'react';
import { Text, View } from 'react-native';

import { color, radius, space, typography, themed } from '../../theme';
import { tr } from '../../i18n';
import { totalText, type DealTotals } from './dealTotals';

export function DealTotalsCard({ totals }: { totals: DealTotals | null }): ReactElement | null {
  if (!totals || totals.completed === 0) return null;
  return (
    <View testID="history-totals" style={styles.card} accessible accessibilityLabel={tr("Totals of your completed deals")}>
      <Text style={styles.title}>
        {totals.completed === 1
          ? tr("1 completed deal")
          : tr("{{count}} completed deals", { count: totals.completed })}
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>{tr("Received")}</Text>
        <Text testID="history-totals-received" style={styles.value}>{totals.received.map(totalText).join('\n')}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{tr("Sent")}</Text>
        <Text testID="history-totals-sent" style={styles.value}>{totals.sent.map(totalText).join('\n')}</Text>
      </View>
      <Text style={styles.note}>{tr("Deal history, not money held by Xspeeria. Fees are not included.")}</Text>
    </View>
  );
}

const styles = themed(() => ({
  card: {
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.lg,
    padding: space.sm,
    gap: space.xs,
    marginBottom: space.sm,
  },
  title: { ...typography.body, fontSize: 15, color: color.text.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  label: { ...typography.body, fontSize: 14, color: color.text.secondary },
  value: { ...typography.body, fontSize: 14, color: color.text.primary, textAlign: 'right' },
  note: { ...typography.body, fontSize: 12, color: color.text.secondary },
}));
