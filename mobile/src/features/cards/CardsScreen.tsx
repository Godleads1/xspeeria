/**
 * Cards (Figma "Debit Cards" 266:5584), ADR-012 + ADR-023.
 *
 * Swipeable USD / EUR / NGN virtual cards on the Figma artwork, page dots, the Details /
 * Freeze Card / More actions and Transaction History, laid out exactly as the design.
 * Cards are not available: every action says so.
 *
 * Development builds show Figma's own placeholder card text and four card transactions,
 * marked "Demo" (`src/features/demo/figmaDemo.ts`, ADR-023). Release builds get none of it:
 * the cards read "Preview", the number is masked, and history is empty, because Xspeeria
 * holds no money (Standing Standards §2).
 */

import { useState, type ReactElement } from "react";
import {
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from '../../components/primitives';
import { Icon, type IconName } from "../../components/icons";
import { brandWeight, color, numericTextStyle, space, themed, typography } from "../../theme";
import {
  DEMO_BADGE,
  DEMO_CARD_TEXT,
  DEMO_CARD_TRANSACTIONS,
  type DemoCardTransaction,
} from "../demo/figmaDemo";

import { Chip, Contactless } from "../home/BestRateCard";
import { tr, k } from "../../i18n";

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
  k("Xspeeria cards are not available yet. We will let you know when you can create one.");

/** Figma card 1036:4839: artwork behind "Virtual Card", chip, contactless, number and amount. */
function CardArt({
  design,
  width,
  demoText,
}: {
  design: CardDesign;
  width: number;
  demoText: DemoCardTexts;
}): ReactElement {
  const k = width / 342;
  const height = Math.round(216 * k);
  const demo = demoText?.[design.currency] ?? null;
  return (
    <ImageBackground
      source={design.art}
      resizeMode="cover"
      style={{ width, height, borderRadius: 14 * k, overflow: "hidden" }}
      imageStyle={{ borderRadius: 14 * k }}
    >
      <View style={[cardStyles.layer, { padding: 17 * k }]} pointerEvents="none">
        <View style={cardStyles.topRow}>
          <Text style={[cardStyles.virtual, { fontSize: 13 * k }]}>{tr("Virtual Card")}</Text>
          {demo ? (
            <View testID={`card-${design.currency}-badge`} style={cardStyles.badge}>
              <Text style={cardStyles.badgeText}>{DEMO_BADGE}</Text>
            </View>
          ) : null}
        </View>
        <View style={[cardStyles.mark, { left: 17 * k, top: 72 * k }]}>
          <Chip size={Math.round(39 * k)} />
        </View>
        <View style={[cardStyles.mark, { left: 286 * k, top: 72 * k }]}>
          <Contactless size={Math.round(39 * k)} />
        </View>
        <View style={[cardStyles.bottom, { left: 17 * k, top: 151 * k }]}>
          <Text style={[cardStyles.number, { fontSize: 12 * k }]}>
            {demo ? demo.number : "**** **** **** ****"}
          </Text>
          <Text style={[cardStyles.amount, { fontSize: 21 * k }]}>
            {demo ? demo.amount : tr("Preview · {{currency}}", { currency: design.currency })}
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}

/** Figma action buttons (y=386): Details filled navy, Freeze Card and More outlined. */
function Action({
  icon,
  label,
  testID,
  filled = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  testID: string;
  filled?: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      style={styles.action}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={tr("Cards are not available yet")}
      testID={testID}
      onPress={onPress}
      hitSlop={6}
    >
      <View style={[styles.actionCircle, filled ? styles.actionFilled : null]}>
        <Icon name={icon} color={filled ? color.text.onFill : color.text.primary} size={18} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const TX_ICON: Record<DemoCardTransaction["icon"], IconName> = {
  transfer: "arrowOut",
  stay: "building",
  design: "pen",
  funded: "arrowIn",
};

/** Figma history row (1019:12764): 24px icon, title over date, signed amount on the right. */
function TransactionRow({ tx }: { tx: DemoCardTransaction }): ReactElement {
  return (
    <View
      testID={`cards-tx-${tx.id}`}
      style={styles.txRow}
      accessible
      accessibilityLabel={tr("{{title}}, {{date}}, {{amount}}. Demo", { title: tx.title, date: tx.date, amount: tx.amount })}
    >
      <Icon name={TX_ICON[tx.icon]} color={color.text.primary} size={24} />
      <View style={styles.txMain}>
        <Text style={styles.txTitle}>{tx.title}</Text>
        <Text style={styles.txDate}>{tx.date}</Text>
      </View>
      <Text style={[styles.txAmount, tx.direction === "out" ? styles.txOut : styles.txIn]}>
        {tx.amount}
      </Text>
    </View>
  );
}

type DemoCardTexts = typeof DEMO_CARD_TEXT;

/**
 * The demo props default to the DEMO_MODE-gated figures, so release builds get none; tests
 * pass `null` / `[]` to check the release rendering.
 */
export function CardsScreen({
  demoText = DEMO_CARD_TEXT,
  demoTransactions = DEMO_CARD_TRANSACTIONS,
}: {
  demoText?: DemoCardTexts;
  demoTransactions?: readonly DemoCardTransaction[];
} = {}): ReactElement {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const cardW = screenW - space.md * 2;
  const [index, setIndex] = useState(0);
  const design = CARD_DESIGNS[index];

  const unavailable = (): void => {
    Alert.alert(tr("Cards are not available"), tr(CARDS_UNAVAILABLE));
  };
  // ADR-056: a physical card per currency needs a card-issuing partner; not available yet.
  const request = (): void => {
    Alert.alert(
      tr("Request a card"),
      tr("This service is not available now. We will let you know when you can request your {{currency}} card.", { currency: design.currency }),
    );
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
          <Text accessibilityRole="header" style={styles.title}>{tr("Debit Cards")}</Text>
          <Pressable
            testID="cards-more"
            accessibilityRole="button"
            accessibilityLabel={tr("More")}
            onPress={unavailable}
            style={styles.round}
          >
            <Icon name="more" color={color.text.primary} size={18} />
          </Pressable>
        </View>

        <Text testID="cards-label" style={styles.cardLabel}>{tr("{{currency}} Card", { currency: design.currency })}</Text>

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
              accessibilityLabel={
                demoText
                  ? tr("{{currency}} virtual card, demo figures. Cards are not available yet.", { currency: d.currency })
                  : tr("{{currency}} virtual card design, preview. Cards are not available yet.", { currency: d.currency })
              }
            >
              <CardArt design={d} width={cardW} demoText={demoText} />
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

        <PrimaryButton testID="cards-request" label={tr("Request a {{currency}} card", { currency: design.currency })} onPress={request} />

        <View style={styles.actions}>
          <Action testID="cards-details" icon="info" label={tr("Details")} filled onPress={unavailable} />
          <Action testID="cards-freeze" icon="snowflake" label={tr("Freeze Card")} onPress={unavailable} />
          <Action testID="cards-actions-more" icon="more" label={tr("More")} onPress={unavailable} />
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.section}>{tr("Transaction History")}</Text>
          {demoTransactions.length > 0 ? <Text style={styles.demo}>{DEMO_BADGE}</Text> : null}
        </View>
        {demoTransactions.length > 0 ? (
          <View testID="cards-history-demo" style={styles.txList}>
            {demoTransactions.map((tx, i) => (
              <View key={tx.id}>
                {i > 0 ? <View style={styles.rule} /> : null}
                <TransactionRow tx={tx} />
              </View>
            ))}
          </View>
        ) : (
        <View testID="cards-history-empty" style={styles.empty}>
          <Text style={styles.emptyText}>{tr("Card transactions will appear here once Xspeeria cards are available.")}</Text>
          <Text style={styles.emptyNote}>{tr("Xspeeria never holds your money, so there is no balance to show.")}</Text>
        </View>
        )}
      </ScrollView>
    </View>
  );
}

const cardStyles = themed(() => ({
  layer: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  virtual: { ...brandWeight("700"), color: "#FFFFFF" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  badgeText: { ...brandWeight("700"), fontSize: 10, color: "#FFFFFF" },
  mark: { position: "absolute" },
  bottom: { position: "absolute", gap: 6 },
  number: { ...brandWeight("500"), ...numericTextStyle, letterSpacing: 1.5, color: "#FFFFFF" },
  amount: { ...brandWeight("700"), ...numericTextStyle, color: "#FFFFFF", letterSpacing: 0.3 },
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
  dotOn: { width: 14, backgroundColor: color.brand.primary },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 36,
    marginTop: space.md,
  },
  action: { alignItems: "center", gap: 6, minWidth: 56 },
  actionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  actionFilled: { backgroundColor: color.brand.fill, borderColor: color.brand.fill },
  actionLabel: {
    ...typography.caption,
    fontSize: 11,
    color: color.text.primary,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    marginTop: space.md,
  },
  demo: { ...typography.caption, fontSize: 10, ...brandWeight("700"), color: color.text.secondary },
  txList: { paddingHorizontal: space.md, marginTop: space.xs },
  txRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56 },
  txMain: { flex: 1, gap: 4 },
  txTitle: { ...typography.body, ...brandWeight("500"), fontSize: 15, color: color.text.primary },
  txDate: { ...typography.caption, color: color.text.secondary },
  txAmount: { ...typography.body, ...brandWeight("700"), ...numericTextStyle, fontSize: 15 },
  txOut: { color: color.error.text },
  txIn: { color: color.success.text },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.border.subtle, marginLeft: 38 },
  section: {
    ...typography.headline,
    ...brandWeight("500"),
    fontSize: 17,
    color: color.text.primary,
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
