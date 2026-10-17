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

import { Icon, type IconName } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { Chip, Contactless } from '../home/BestRateCard';
import { CardArt, type CardPalette } from './CardArt';

/** Card artwork colours (illustration, like flags.tsx — not UI tokens). */
interface CardDesign {
  readonly currency: 'USD' | 'EUR' | 'NGN';
  readonly symbol: string;
  readonly palette: CardPalette;
}

export const CARD_DESIGNS: readonly CardDesign[] = [
  { currency: 'USD', symbol: '$', palette: { base: '#0B3A66', edge: '#04111F', glow: '#38A9F8', hot: '#D6F1FF' } },
  { currency: 'EUR', symbol: '€', palette: { base: '#0E5A3A', edge: '#03140C', glow: '#2EE59D', hot: '#D9FFF0' } },
  { currency: 'NGN', symbol: '₦', palette: { base: '#5B2A8C', edge: '#13061F', glow: '#C58BFF', hot: '#F3E6FF' } },
];

export const CARDS_UNAVAILABLE = 'Xspeeria cards are not available yet. We will let you know when you can create one.';

function Card({ design, width }: { design: CardDesign; width: number }): ReactElement {
  const height = Math.round(width / 1.59);
  return (
    <View style={[cardStyles.card, { width, height }]}>
      <CardArt id={`card-${design.currency}`} symbol={design.symbol} palette={design.palette} width={width} height={height} />
      <View style={cardStyles.layer} pointerEvents="none">
        <Text style={cardStyles.virtual}>Virtual Card</Text>
        <View style={cardStyles.chip}>
          <Chip size={Math.round(width * 0.105)} />
        </View>
        <View style={[cardStyles.contactless, { left: width * 0.8, top: height * 0.38 }]}>
          <Contactless size={Math.round(width * 0.075)} />
        </View>
        <View style={cardStyles.bottom}>
          <Text style={cardStyles.number}>**** **** **** ****</Text>
          <Text style={cardStyles.amount}>Preview · {design.currency}</Text>
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
              <Card design={d} width={cardW} />
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
  card: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#000000' },
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, paddingHorizontal: 18, paddingVertical: 16 },
  virtual: { ...brandWeight('700'), fontSize: 13, color: '#FFFFFF' },
  chip: { position: 'absolute', left: 18, top: '38%' },
  contactless: { position: 'absolute' },
  bottom: { position: 'absolute', left: 18, bottom: 14, gap: 4 },
  number: { ...brandWeight('500'), fontSize: 12, letterSpacing: 1.2, color: '#FFFFFF', opacity: 0.8 },
  amount: { ...brandWeight('700'), fontSize: 21, color: '#FFFFFF' },
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
