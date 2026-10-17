/**
 * Cards (Figma "Debit Cards"), ADR-012 — PREVIEW ONLY.
 *
 * Swipeable USD / EUR / NGN virtual cards using the Figma card artwork, page dots, the Details / Freeze Card /
 * More actions, a "Create yours" button and the Transaction History heading. Cards are not
 * available: "Create yours" says so, the actions are disabled, and no balance, card number
 * or card transaction is shown — Xspeeria holds no money (PRODUCT.md, no-balance rule).
 */

import { useState, type ReactElement } from "react";
import {
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "../../components/icons";
import { PrimaryButton } from "../../components/primitives";
import { brandWeight, color, space, themed, typography } from "../../theme";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Chip, Contactless } from "../home/BestRateCard";

/** Card artwork colours (illustration, like flags.tsx — not UI tokens). */
interface CardDesign {
  readonly currency: "USD" | "EUR" | "NGN";
  readonly symbol: string;
  /** Figma "Card BG" artwork (342×216, taken from the design file; licence to confirm). */
  readonly art: ImageSourcePropType;
}

export const CARD_DESIGNS: readonly CardDesign[] = [
  {
    currency: "USD",
    symbol: "$",
    art: require("../../../assets/images/card-usd.png"),
  },
  {
    currency: "EUR",
    symbol: "€",
    art: require("../../../assets/images/card-eur.png"),
  },
  {
    currency: "NGN",
    symbol: "₦",
    art: require("../../../assets/images/card-ngn.png"),
  },
];

export const CARDS_UNAVAILABLE =
  "Xspeeria cards are not available yet. We will let you know when you can create one.";

/** Figma card 1036:4839: artwork behind "Virtual Card", chip, contactless, number and amount. */
function CardArt({
  design,
  width,
}: {
  design: CardDesign;
  width: number;
}): ReactElement {
  const k = width / 342;
  const height = Math.round(216 * k);
  return (
    <View style={[cardStyles.shadow, { width, height, borderRadius: 14 * k }]}>
      <ImageBackground
        source={design.art}
        resizeMode="cover"
        style={{ width, height }}
        imageStyle={{ borderRadius: 14 * k }}
      >
        {/* Gloss: a soft light sweep from the top-left and a thin bright edge, like a real card. */}
        <Svg
          width={width}
          height={height}
          style={cardStyles.layer}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient
              id={`sheen-${design.currency}`}
              x1="0"
              y1="0"
              x2="0.9"
              y2="1"
            >
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.14" />
              <Stop offset="0.38" stopColor="#FFFFFF" stopOpacity="0.03" />
              <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect
            width={width}
            height={height}
            rx={14 * k}
            fill={`url(#sheen-${design.currency})`}
          />
          <Rect
            x={0.5}
            y={0.5}
            width={width - 1}
            height={height - 1}
            rx={14 * k}
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={0.16}
          />
        </Svg>
        <View
          style={[cardStyles.layer, { padding: 17 * k }]}
          pointerEvents="none"
        >
          <Text style={[cardStyles.virtual, { fontSize: 13 * k }]}>
            Virtual Card
          </Text>
          <View style={[cardStyles.mark, { left: 17 * k, top: 72 * k }]}>
            <Chip size={Math.round(39 * k)} />
          </View>
          <View style={[cardStyles.mark, { left: 286 * k, top: 72 * k }]}>
            <Contactless size={Math.round(39 * k)} />
          </View>
          <View style={[cardStyles.bottom, { left: 17 * k, top: 151 * k }]}>
            <Text style={[cardStyles.number, { fontSize: 12 * k }]}>
              **** **** **** ****
            </Text>
            <Text style={[cardStyles.preview, { fontSize: 21 * k }]}>
              Preview · {design.currency}
            </Text>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

function Action({
  icon,
  label,
  testID,
}: {
  icon: IconName;
  label: string;
  testID: string;
}): ReactElement {
  return (
    <View
      style={styles.action}
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`${label}, not available yet`}
      testID={testID}
    >
      <View style={styles.actionCircle}>
        <Icon name={icon} color={color.text.disabled} size={20} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

export function CardsScreen({
  onCreate,
}: {
  onCreate?: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const cardW = screenW - space.md * 2;
  const [index, setIndex] = useState(0);
  const design = CARD_DESIGNS[index];

  const create = (): void => {
    if (onCreate) onCreate();
    else Alert.alert("Cards are not available", CARDS_UNAVAILABLE);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardW + space.sm));
    setIndex(Math.max(0, Math.min(CARD_DESIGNS.length - 1, i)));
  };

  return (
    <View
      testID="cards-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Debit Cards
          </Text>
          <Pressable
            testID="cards-more"
            accessibilityRole="button"
            accessibilityLabel="More"
            onPress={create}
            style={styles.round}
          >
            <Icon name="more" color={color.text.primary} size={18} />
          </Pressable>
        </View>

        <Text testID="cards-label" style={styles.cardLabel}>
          {design.currency} Card
        </Text>

        <ScrollView
          testID="cards-carousel"
          horizontal
          pagingEnabled={false}
          snapToInterval={cardW + space.sm}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          contentContainerStyle={{ paddingHorizontal: space.md, paddingTop: 4, paddingBottom: 16, gap: space.sm }}
        >
          {CARD_DESIGNS.map((d) => (
            <View
              key={d.currency}
              testID={`card-${d.currency}`}
              accessible
              accessibilityLabel={`${d.currency} virtual card design, preview. Cards are not available yet.`}
            >
              <CardArt design={d} width={cardW} />
            </View>
          ))}
        </ScrollView>

        <View
          style={styles.dots}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {CARD_DESIGNS.map((d, i) => (
            <View
              key={d.currency}
              style={[styles.dot, i === index ? styles.dotOn : null]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <Action testID="cards-details" icon="info" label="Details" />
          <Action testID="cards-freeze" icon="lock" label="Freeze Card" />
          <Action testID="cards-actions-more" icon="more" label="More" />
        </View>

        <View style={styles.create}>
          <PrimaryButton
            testID="cards-create"
            label="Create yours"
            onPress={create}
          />
        </View>

        <Text style={styles.section}>Transaction History</Text>
        <View testID="cards-history-empty" style={styles.empty}>
          <Text style={styles.emptyText}>
            Card transactions will appear here once Xspeeria cards are
            available.
          </Text>
          <Text style={styles.emptyNote}>
            Xspeeria never holds your money, so there is no balance to show.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const cardStyles = themed(() => ({
  layer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  shadow: {
    backgroundColor: "#05080F",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  virtual: { ...brandWeight("700"), color: "#FFFFFF" },
  mark: { position: "absolute" },
  bottom: { position: "absolute", gap: 6 },
  number: {
    ...brandWeight("500"),
    letterSpacing: 1.5,
    color: "#FFFFFF",
    opacity: 0.85,
  },
  preview: {
    ...brandWeight("700"),
    color: "#FFFFFF",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
}));

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    minHeight: 44,
  },
  title: {
    ...typography.headline,
    ...brandWeight("700"),
    fontSize: 20,
    color: color.text.primary,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    ...typography.body,
    ...brandWeight("500"),
    fontSize: 16,
    color: color.text.primary,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.border.subtle,
  },
  dotOn: { width: 16, backgroundColor: color.brand.primary },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginTop: space.sm,
  },
  action: { alignItems: "center", gap: 6 },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.sunken,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    ...typography.caption,
    fontSize: 11,
    color: color.text.disabled,
  },
  create: { paddingHorizontal: space.md, marginTop: space.md },
  section: {
    ...typography.headline,
    ...brandWeight("500"),
    fontSize: 17,
    color: color.text.primary,
    paddingHorizontal: space.md,
    marginTop: space.md,
  },
  empty: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: 12,
    backgroundColor: color.bg.sunken,
    gap: 6,
  },
  emptyText: { ...typography.body, fontSize: 14, color: color.text.primary },
  emptyNote: { ...typography.caption, color: color.text.secondary },
}));
