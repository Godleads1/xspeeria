/**
 * Cards (Figma "Debit Cards"), ADR-012 — PREVIEW ONLY.
 *
 * Swipeable USD / EUR / NGN virtual-card designs, page dots, the Details / Freeze Card /
 * More actions, a "Create yours" button and the Transaction History heading. Cards are not
 * available: "Create yours" says so, the actions are disabled, and no balance, card number
 * or card transaction is shown — Xspeeria holds no money (PRODUCT.md, no-balance rule).
 */

import { useState, type ReactElement } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { Icon, type IconName } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { Chip, Contactless } from '../home/BestRateCard';

/** Card artwork colours (illustration, like flags.tsx — not UI tokens). */
interface CardDesign {
  readonly currency: 'USD' | 'EUR' | 'NGN';
  readonly symbol: string;
  readonly from: string;
  readonly to: string;
  readonly glow: string;
}

export const CARD_DESIGNS: readonly CardDesign[] = [
  { currency: 'USD', symbol: '$', from: '#0B2A4F', to: '#03101F', glow: '#38BDF8' },
  { currency: 'EUR', symbol: '€', from: '#0E4A2E', to: '#04160D', glow: '#34D399' },
  { currency: 'NGN', symbol: '₦', from: '#4A1D7A', to: '#160828', glow: '#C084FC' },
];

export const CARDS_UNAVAILABLE = 'Xspeeria cards are not available yet. We will let you know when you can create one.';

function CardArt({ design, width }: { design: CardDesign; width: number }): ReactElement {
  const height = Math.round(width * 0.62);
  const id = `card-${design.currency}`;
  // Constellation dots around the symbol, echoing the Figma "network" glyph.
  const dots = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const r = 34 + ((i * 7) % 11);
    return { x: 250 + Math.cos(a) * r, y: 92 + Math.sin(a) * r * 1.15, k: i };
  });
  return (
    <View style={{ width, height, borderRadius: 18, overflow: 'hidden' }}>
      <Svg width={width} height={height} viewBox="0 0 340 210" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={design.from} />
            <Stop offset="1" stopColor={design.to} />
          </LinearGradient>
          <RadialGradient id={`${id}-glow`} cx="0.73" cy="0.45" r="0.45">
            <Stop offset="0" stopColor={design.glow} stopOpacity="0.45" />
            <Stop offset="1" stopColor={design.glow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={340} height={210} fill={`url(#${id}-bg)`} />
        <Rect width={340} height={210} fill={`url(#${id}-glow)`} />
        {dots.map((d) => (
          <Circle key={d.k} cx={d.x} cy={d.y} r={1.3} fill={design.glow} opacity={0.8} />
        ))}
        <SvgText x={250} y={140} fontSize={130} fontWeight="bold" textAnchor="middle" fill="none" stroke={design.glow} strokeWidth={2.2} opacity={0.95}>
          {design.symbol}
        </SvgText>
        <SvgText x={250} y={140} fontSize={130} fontWeight="bold" textAnchor="middle" fill={design.glow} opacity={0.18}>
          {design.symbol}
        </SvgText>
        <Path d="M215 170h70" stroke={design.glow} strokeWidth={2} opacity={0.6} strokeLinecap="round" />
      </Svg>
      <View style={[cardStyles.layer, { padding: 18 }]} pointerEvents="none">
        <Text style={cardStyles.virtual}>Virtual Card</Text>
        <View style={cardStyles.marks}>
          <Chip size={40} />
        </View>
        <View style={cardStyles.contactless}>
          <Contactless size={34} />
        </View>
        <View style={cardStyles.bottom}>
          <Text style={cardStyles.number}>•••• •••• •••• ••••</Text>
          <Text style={cardStyles.preview}>Preview · {design.currency}</Text>
        </View>
      </View>
    </View>
  );
}

function Action({ icon, label, testID }: { icon: IconName; label: string; testID: string }): ReactElement {
  return (
    <View style={styles.action} accessible accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={`${label}, not available yet`} testID={testID}>
      <View style={styles.actionCircle}>
        <Icon name={icon} color={color.text.disabled} size={20} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

export function CardsScreen({ onCreate }: { onCreate?: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const cardW = screenW - space.md * 2;
  const [index, setIndex] = useState(0);
  const design = CARD_DESIGNS[index];

  const create = (): void => {
    if (onCreate) onCreate();
    else Alert.alert('Cards are not available', CARDS_UNAVAILABLE);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardW + space.sm));
    setIndex(Math.max(0, Math.min(CARD_DESIGNS.length - 1, i)));
  };

  return (
    <View testID="cards-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>Debit Cards</Text>
          <Pressable testID="cards-more" accessibilityRole="button" accessibilityLabel="More" onPress={create} style={styles.round}>
            <Icon name="more" color={color.text.primary} size={18} />
          </Pressable>
        </View>

        <Text testID="cards-label" style={styles.cardLabel}>{design.currency} Card</Text>

        <ScrollView
          testID="cards-carousel"
          horizontal
          pagingEnabled={false}
          snapToInterval={cardW + space.sm}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          contentContainerStyle={{ paddingHorizontal: space.md, gap: space.sm }}
        >
          {CARD_DESIGNS.map((d) => (
            <View key={d.currency} testID={`card-${d.currency}`} accessible accessibilityLabel={`${d.currency} virtual card design, preview. Cards are not available yet.`}>
              <CardArt design={d} width={cardW} />
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {CARD_DESIGNS.map((d, i) => (
            <View key={d.currency} style={[styles.dot, i === index ? styles.dotOn : null]} />
          ))}
        </View>

        <View style={styles.actions}>
          <Action testID="cards-details" icon="info" label="Details" />
          <Action testID="cards-freeze" icon="lock" label="Freeze Card" />
          <Action testID="cards-actions-more" icon="more" label="More" />
        </View>

        <View style={styles.create}>
          <PrimaryButton testID="cards-create" label="Create yours" onPress={create} />
        </View>

        <Text style={styles.section}>Transaction History</Text>
        <View testID="cards-history-empty" style={styles.empty}>
          <Text style={styles.emptyText}>Card transactions will appear here once Xspeeria cards are available.</Text>
          <Text style={styles.emptyNote}>Xspeeria never holds your money, so there is no balance to show.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const cardStyles = themed(() => ({
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  virtual: { ...brandWeight('700'), fontSize: 13, color: '#FFFFFF' },
  marks: { marginTop: 22 },
  contactless: { position: 'absolute', right: 16, top: '42%' },
  bottom: { position: 'absolute', left: 18, bottom: 16, gap: 4 },
  number: { ...brandWeight('500'), fontSize: 13, letterSpacing: 1.5, color: '#FFFFFF', opacity: 0.85 },
  preview: { ...brandWeight('700'), fontSize: 20, color: '#FFFFFF' },
}));

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, minHeight: 44 },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { ...typography.body, ...brandWeight('500'), fontSize: 16, color: color.text.primary, paddingHorizontal: space.md, marginTop: space.sm, marginBottom: space.xs },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.border.subtle },
  dotOn: { width: 16, backgroundColor: color.brand.primary },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginTop: space.sm },
  action: { alignItems: 'center', gap: 6 },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...typography.caption, fontSize: 11, color: color.text.disabled },
  create: { paddingHorizontal: space.md, marginTop: space.md },
  section: { ...typography.headline, ...brandWeight('500'), fontSize: 17, color: color.text.primary, paddingHorizontal: space.md, marginTop: space.md },
  empty: { marginHorizontal: space.md, marginTop: space.sm, padding: space.sm, borderRadius: 12, backgroundColor: color.bg.sunken, gap: 6 },
  emptyText: { ...typography.body, fontSize: 14, color: color.text.primary },
  emptyNote: { ...typography.caption, color: color.text.secondary },
}));
