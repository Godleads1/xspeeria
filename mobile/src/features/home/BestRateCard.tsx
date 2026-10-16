/**
 * Best-rate card — the Home hero (DEC-008), styled after the Figma balance card
 * (node 39:2882): dark card, flowing line texture, small label top-left, large figure
 * bottom-left.
 *
 * Xspeeria holds no money, so the hero shows a PRICE, never an amount: the rate is always
 * written with both currencies (`1 USD = 1,603.78 NGN`) under an explicit "rate" label, so
 * it cannot be read as a balance. The chip and contactless marks are drawn as in Figma
 * (DEC-009, product owner, 2026-10-17); they are decoration and expose no card feature.
 *
 * The Figma texture is a raster image that could not be exported; it is redrawn here as
 * vector strokes on `color.bg.inverse`. The whole card is Home's one primary action.
 */

import type { ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import type { MarketRate } from '../../fixtures';
import { color, numericTextStyle, radius, space, typography } from '../../theme';
import { formatRate, pairLabel } from './rate';

/**
 * Silky ribbon texture, authored on a 342 × 150 box (the card). Many fine strokes in two
 * crossing bands with a soft sheen, standing in for the Figma texture image.
 */
const RIBBONS: readonly string[] = [
  ...Array.from({ length: 34 }, (_, i) => {
    const y = -10 + i * 3.4;
    return `M90 ${y} C 160 ${y - 40}, 230 ${y + 80}, 342 ${y + 28}`;
  }),
  ...Array.from({ length: 22 }, (_, i) => {
    const y = 70 + i * 3.6;
    return `M150 ${y + 60} C 210 ${y - 10}, 270 ${y - 50}, 342 ${y - 70}`;
  }),
];

function Texture(): ReactElement {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 342 150"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color.text.onFill} stopOpacity="0" />
          <Stop offset="0.55" stopColor={color.text.onFill} stopOpacity="0.16" />
          <Stop offset="0.8" stopColor={color.text.onFill} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color.text.onFill} stopOpacity="0.1" />
        </LinearGradient>
      </Defs>
      {RIBBONS.map((d) => (
        <Path key={d} d={d} stroke="url(#sheen)" strokeWidth={0.45} fill="none" />
      ))}
    </Svg>
  );
}

/** Decorative card chip, as on the Figma card (40 × 30). */
function Chip(): ReactElement {
  return (
    <Svg width={40} height={30} viewBox="0 0 40 30">
      <Defs>
        <LinearGradient id="chip" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color.decorative.chipLight} />
          <Stop offset="1" stopColor={color.decorative.chipDark} />
        </LinearGradient>
      </Defs>
      <Rect x={0.5} y={0.5} width={39} height={29} rx={5} fill="url(#chip)" />
      <Path
        d="M0.5 10h12M0.5 20h12M27.5 10h12M27.5 20h12M12.5 0.5v29M27.5 0.5v29M12.5 15h15"
        stroke={color.bg.inverse}
        strokeOpacity={0.35}
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

/** Decorative contactless mark (three arcs and a dot), top-right as in Figma. */
function Contactless(): ReactElement {
  const s = {
    stroke: color.text.onFill,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={26} height={30} viewBox="0 0 26 30">
      <Path d="M4 11.5a5 5 0 0 1 0 7" {...s} />
      <Path d="M10 7.5a11 11 0 0 1 0 15" {...s} />
      <Path d="M16 3.5a17 17 0 0 1 0 23" {...s} />
    </Svg>
  );
}

export function BestRateCard({
  rate,
  onTrade,
}: {
  rate: MarketRate;
  onTrade?: () => void;
}): ReactElement {
  const rendered = formatRate(rate);
  const label = `Best ${pairLabel(rate)} rate today`;

  const body = (
    <>
      <Texture />
      <View style={styles.topRow}>
        <View style={styles.labelColumn}>
          <Text style={styles.label}>{label}</Text>
          <Chip />
        </View>
        <Contactless />
      </View>
      <View style={styles.bottomRow}>
        <Text
          accessibilityLabel={`${label}: ${rendered}`}
          adjustsFontSizeToFit
          numberOfLines={1}
          style={styles.rate}
        >
          {rendered}
        </Text>
        {onTrade ? <Text style={styles.trade}>Trade ›</Text> : null}
      </View>
    </>
  );

  if (!onTrade) {
    return (
      <View testID="home-best-rate" style={styles.card}>
        {body}
      </View>
    );
  }

  return (
    <View testID="home-best-rate" style={styles.shadow}>
      <Pressable
        testID="home-primary-action"
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${rendered}. Trade now`}
        onPress={onTrade}
        style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
      >
        {body}
      </Pressable>
    </View>
  );
}

const CARD_HEIGHT = 150;

const styles = StyleSheet.create({
  // The hero is the one raised surface on Home, as in Figma; ordinary cards stay flat.
  shadow: {
    borderRadius: radius.md,
    ...Platform.select({
      ios: {
        shadowColor: color.bg.inverse,
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
      default: { elevation: 8 },
    }),
  },
  card: {
    height: CARD_HEIGHT,
    backgroundColor: color.bg.inverse,
    borderRadius: radius.md,
    padding: space.sm,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.92 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelColumn: { gap: 10 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  label: { ...typography.caption, fontWeight: '600', color: color.text.onFill },
  trade: { ...typography.chipLabel, color: color.text.onFill },
  rate: {
    flexShrink: 1,
    ...typography.sectionTitle,
    ...numericTextStyle,
    fontWeight: '700',
    color: color.text.onFill,
  },
});
