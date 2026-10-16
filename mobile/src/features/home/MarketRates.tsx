/**
 * Current market rates (Figma node 39:2882).
 *
 * Prices, not amounts: each row is a corridor and the NGN price of one unit of the other
 * currency. Laid out as in Figma: corridor, rate, favourite star. The panel tucks under
 * the hero card (`attached`). Stars are decorative favourite markers (DEC-009); the row's
 * meaning never depends on them.
 */

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { MarketRate } from '../../fixtures';
import { color, numericTextStyle, radius, space, typography } from '../../theme';
import { groupDigits } from './rate';
import { SectionLabel } from './SectionLabel';

/** Overlap with the hero card above, so the card sits on the panel as in Figma. */
export const ATTACH_OVERLAP = 20;

function Star(): ReactElement {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Path
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
        fill={color.decorative.star}
      />
    </Svg>
  );
}

export function MarketRates({
  rates,
  attached = false,
}: {
  rates: readonly MarketRate[];
  attached?: boolean;
}): ReactElement {
  return (
    <View testID="home-market-rates" style={[styles.panel, attached ? styles.attached : null]}>
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
          <Star />
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
  attached: {
    marginTop: -ATTACH_OVERLAP,
    paddingTop: ATTACH_OVERLAP + space.sm,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  pair: { ...typography.body, color: color.text.primary, flex: 1 },
  value: { ...typography.body, ...numericTextStyle, color: color.text.primary, flex: 1 },
});
