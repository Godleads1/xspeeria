/**
 * Best-rate card — the Home hero (DEC-008).
 *
 * Takes the place of the Figma balance card (node 39:2882). Xspeeria holds no
 * money, so the hero shows a PRICE, never an amount: the rate is always written with both
 * currencies (`1 USD = 1,603.78 NGN`) under an explicit "rate" label, so it cannot be read
 * as a balance. No chip or contactless glyphs: those imply a payment card.
 *
 * Deviation, recorded in ADR-004: Figma paints this card black with a texture image that
 * could not be exported; it uses the brand primary fill instead (white on it 15.30:1).
 *
 * The card carries Home's one primary action, routing to the Marketplace.
 */

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MarketRate } from '../../fixtures';
import { color, numericTextStyle, radius, space, typography } from '../../theme';
import { formatRate, pairLabel } from './rate';

export function BestRateCard({
  rate,
  onTrade,
}: {
  rate: MarketRate;
  onTrade?: () => void;
}): ReactElement {
  const rendered = formatRate(rate);
  return (
    <View testID="home-best-rate" style={styles.card}>
      <Text style={styles.label}>{`Best ${pairLabel(rate)} rate today`}</Text>
      <Text
        accessibilityLabel={`Best rate today: ${rendered}`}
        adjustsFontSizeToFit
        numberOfLines={1}
        style={styles.rate}
      >
        {rendered}
      </Text>
      <Text style={styles.note}>Matched peer to peer · your money stays in bank escrow</Text>

      {onTrade ? (
        <Pressable
          testID="home-primary-action"
          accessibilityRole="button"
          onPress={onTrade}
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
        >
          <Text style={styles.buttonLabel}>Trade now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  label: { ...typography.caption, color: color.text.onFill },
  rate: {
    ...typography.sectionTitle,
    ...numericTextStyle,
    color: color.text.onFill,
    fontWeight: '700',
  },
  note: { ...typography.caption, color: color.text.onFill },
  button: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: color.bg.sunken },
  buttonLabel: { ...typography.rowLabel, color: color.brand.primary },
});
