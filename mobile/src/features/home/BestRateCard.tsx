/**
 * Best-rate card — the Home hero (DEC-008), built to the Figma card's geometry
 * (node 51:1719): 342 × 135, 17.24 padding, an 11 pt bold label, a 38.8 pt row holding the
 * chip (left) and contactless mark (right), then the figure in Space Grotesk Bold 23 pt.
 * Everything is authored on that 342-wide frame and scaled to the card's real width, so
 * the proportions match Figma on any phone.
 *
 * Xspeeria holds no money, so the hero shows a PRICE, never an amount: the rate is always
 * written with both currencies (`1 USD = 1,603.78 NGN`) under an explicit "rate" label, so
 * it cannot be read as a balance. The chip and contactless marks are decoration only
 * (DEC-009) and expose no card feature. The whole card is Home's one primary action.
 *
 * The Figma texture and chip are raster/vector assets that could not be exported; they are
 * redrawn here as vectors.
 */

import { useState, type ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import type { MarketRate } from '../../fixtures';
import { brandWeight, color, heroFigureStyle, radius, themed } from '../../theme';
import { formatRate, pairLabel } from './rate';

/** The Figma frame every measurement below is taken from. */
const FIGMA = {
  width: 342,
  height: 135,
  padding: 17.24,
  gap: 10.06,
  label: 11,
  mark: 38.8,
  figure: 23,
  figureTracking: 0.92,
} as const;

/** Silky ribbon texture on the 342 × 135 frame: fine strokes in two crossing bands. */
const RIBBONS: readonly string[] = [
  ...Array.from({ length: 34 }, (_, i) => {
    const y = -10 + i * 3.1;
    return `M90 ${y} C 160 ${y - 36}, 230 ${y + 72}, 342 ${y + 25}`;
  }),
  ...Array.from({ length: 22 }, (_, i) => {
    const y = 62 + i * 3.3;
    return `M150 ${y + 54} C 210 ${y - 9}, 270 ${y - 45}, 342 ${y - 63}`;
  }),
];

function Texture(): ReactElement {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${FIGMA.width} ${FIGMA.height}`}
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

/**
 * Decorative card chip. Figma: a 38.8 box with the chip art inset 11.05% top and bottom
 * (38.8 × 30.2), gold with bronze contact lines.
 */
export function Chip({ size }: { size: number }): ReactElement {
  const line = {
    stroke: color.decorative.chipLine,
    strokeWidth: 0.9,
    fill: 'none',
    strokeLinecap: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <LinearGradient id="chip" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={color.decorative.chipLight} />
          <Stop offset="1" stopColor={color.decorative.chipDark} />
        </LinearGradient>
      </Defs>
      <Rect x={0.4} y={4.8} width={39.2} height={30.4} rx={5} fill="url(#chip)" />
      {/* Centre pad, then the contact rows either side, as on a real chip. */}
      <Rect x={14} y={11.5} width={12} height={17} rx={3} {...line} />
      <Path d="M0.4 14.5h13.6M0.4 25.5h13.6M26 14.5h13.6M26 25.5h13.6" {...line} />
      <Path d="M14 20h-6M26 20h6M20 4.8v6.7M20 28.5v6.7" {...line} />
    </Svg>
  );
}

/** Decorative contactless mark. Figma: a 38.8 box with the art inset 18.49% each side. */
export function Contactless({ size }: { size: number }): ReactElement {
  const s = {
    stroke: color.text.onFill,
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M10 15a7 7 0 0 1 0 10" {...s} />
      <Path d="M16.5 10a14 14 0 0 1 0 20" {...s} />
      <Path d="M23 5a21 21 0 0 1 0 30" {...s} />
      <Path d="M29.5 1.5a27 27 0 0 1 0 37" {...s} />
    </Svg>
  );
}

/**
 * The Figma card shell (node 51:1719): texture, label, chip and contactless marks, figure.
 * Used by the best-rate card and, in development builds only, by the Figma demo balance
 * card (`src/features/demo`, ADR-023), which passes a "Demo" badge.
 */
export function HeroCard({
  label,
  figure,
  accessibilityLabel,
  onPress,
  accessibilityHint,
  badge,
  testID,
}: {
  label: string;
  figure: string;
  accessibilityLabel: string;
  onPress?: () => void;
  accessibilityHint?: string;
  badge?: string;
  testID: string;
}): ReactElement {
  // Scale every Figma measurement by the card's real width.
  const [width, setWidth] = useState<number>(FIGMA.width);
  const k = width / FIGMA.width;
  const onLayout = (event: LayoutChangeEvent): void => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - width) > 0.5) setWidth(next);
  };

  const frame = {
    height: FIGMA.height * k,
    padding: FIGMA.padding * k,
    gap: FIGMA.gap * k,
  };
  const labelStyle = { fontSize: FIGMA.label * k, lineHeight: FIGMA.label * 1.4 * k };
  const figureStyle = {
    fontSize: FIGMA.figure * k,
    letterSpacing: FIGMA.figureTracking * k,
  };
  const mark = FIGMA.mark * k;

  const body = (
    <>
      <Texture />
      <View style={styles.labelRow}>
        <Text style={[styles.label, labelStyle]}>{label}</Text>
        {badge ? (
          <View testID={`${testID}-badge`} style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.marks}>
        <Chip size={mark} />
        <Contactless size={mark} />
      </View>
      <Text
        accessibilityLabel={accessibilityLabel}
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.figure, figureStyle]}
      >
        {figure}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} onLayout={onLayout} style={styles.shadow}>
        <View style={[styles.card, frame]}>{body}</View>
      </View>
    );
  }

  return (
    <View testID={testID} onLayout={onLayout} style={styles.shadow}>
      <Pressable
        testID="home-primary-action"
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}. Trade now`}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        style={({ pressed }) => [styles.card, frame, pressed ? styles.pressed : null]}
      >
        {body}
      </Pressable>
    </View>
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
  return (
    <HeroCard
      testID="home-best-rate"
      label={label}
      figure={rendered}
      accessibilityLabel={`${label}: ${rendered}`}
      accessibilityHint="Opens the marketplace"
      onPress={onTrade}
    />
  );
}

const styles = themed(() => ({
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
    backgroundColor: color.bg.inverse,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.92 },
  label: { ...brandWeight('700'), color: color.text.onFill },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.18)' },
  badgeText: { ...brandWeight('700'), fontSize: 9, letterSpacing: 0.4, color: color.text.onFill },
  marks: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  figure: { ...heroFigureStyle, color: color.text.onFill },
}));
