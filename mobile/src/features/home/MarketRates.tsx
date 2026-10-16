/**
 * Current market rates (Figma node 39:2882).
 *
 * Prices, not amounts: each row is a corridor and the NGN price of one unit of the other
 * currency. The Figma gold stars are omitted — gold is reserved for decorative rating
 * indicators (`docs/09-ui-ux/DESIGN_SYSTEM.md`), and a favourite marker is not a rating.
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MarketRate } from '../../fixtures';
import { color, numericTextStyle, radius, space, typography } from '../../theme';
import { groupDigits } from './rate';
import { SectionLabel } from './SectionLabel';

export function MarketRates({ rates }: { rates: readonly MarketRate[] }): ReactElement {
  return (
    <View testID="home-market-rates" style={styles.panel}>
      <SectionLabel>Current market rates</SectionLabel>
      {rates.map((rate) => (
        <View
          key={rate.id}
          testID={`rate-${rate.id}`}
          accessible
          accessibilityLabel={`${rate.base} to ${rate.quote}: 1 ${rate.quote} costs ${groupDigits(rate.rate)} ${rate.base}`}
          style={styles.row}
        >
          <Text style={styles.pair}>{`${rate.base} - ${rate.quote}`}</Text>
          <Text style={styles.value}>{groupDigits(rate.rate)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // `bg.sunken` is never the sole separator: it is paired with a hairline border here.
  panel: {
    backgroundColor: color.bg.sunken,
    borderColor: color.border.subtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  pair: { ...typography.rowLabel, color: color.text.primary },
  value: { ...typography.body, ...numericTextStyle, color: color.text.primary },
});
