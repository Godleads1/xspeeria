/**
 * Welcome (Figma 33:1367), ADR-013. Swipeable intro slides with the four progress bars;
 * each slide's picture and text move together in one horizontal swipe (product owner,
 * 2026-10-18),
 * "Open a free profile" and "I have a profile". One picture per slide (Figma component
 * 55:2057, variants 55:2056/2054/2055/2053). Titles are Figma's; slide text is Figma's
 * except three claims that are not true or not verified for Xspeeria (ADR-022): "end-to-end
 * encryption" (not verified), "send and receive funds across borders" (no money crosses the
 * border) and "spend via prepaid card" (cards are not available, ADR-012). Copy needs
 * marketing/legal review. The photo artwork's licence must be confirmed before release.
 */

import { useRef, useState, type ReactElement } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { AuthTop, GhostButton } from './ui';
import { tr, k } from "../../i18n";

export const SLIDES = [
  { title: k("Welcome to Xspeeria"), body: k("Experience fast, secure, and low-fee currency exchange — anytime, anywhere.") },
  { title: k("Exchange Money Peer-to-Peer"), body: k("Set your own rate and match with verified people. One clear, capped fee, with no hidden margin in the rate.") },
  { title: k("Safe. Verified. Secure."), body: k("Everyone is identity-checked. Your money goes to a partner bank’s escrow, never to Xspeeria, until both sides have paid.") },
  { title: k("Go Global, Seamlessly"), body: k("Exchange naira with people abroad. Each side is paid by local transfer in their own country — no money crosses the border.") },
] as const;

/** Decorative artwork, one per slide (Figma; licence to confirm, ADR-013). */
const HERO_IMAGES = [
  require('../../../assets/images/welcome-hero.png'),
  require('../../../assets/images/welcome-slide2.png'),
  require('../../../assets/images/welcome-slide3.png'),
  require('../../../assets/images/welcome-slide4.png'),
] as const;

export function WelcomeScreen({ onSignUp, onLogIn }: { onSignUp: () => void; onLogIn: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const pager = useRef<ScrollViewInstance>(null);

  const pageAt = (x: number): number => Math.max(0, Math.min(SLIDES.length - 1, Math.round(x / width)));
  // Bars follow the finger while swiping, and settle when the swipe ends.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const i = pageAt(e.nativeEvent.contentOffset.x);
    if (i !== index) setIndex(i);
  };
  const goTo = (i: number): void => {
    setIndex(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <View testID="welcome-screen" style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.sm }]}>
      <View style={styles.padded}>
        <AuthTop />
      </View>
      <ScrollView
        ref={pager}
        testID="welcome-slides"
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onScroll}
        style={styles.pager}
        contentContainerStyle={styles.pagerContent}
      >
        {SLIDES.map((s, i) => (
          <View key={s.title} testID={`welcome-slide-${i}`} style={[styles.page, { width }]}>
            <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Image testID={`welcome-hero-${i}`} source={HERO_IMAGES[i]} style={styles.heroImage} resizeMode="contain" />
            </View>
            <View style={styles.text}>
              <Text accessibilityRole="header" style={styles.title}>{tr(s.title)}</Text>
              <Text style={styles.body}>{tr(s.body)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.padded, styles.bars]} accessibilityLabel={tr("Slide {{value}} of {{length}}", { value: index + 1, length: SLIDES.length })}>
        {SLIDES.map((s, i) => (
          <Pressable
            key={s.title}
            testID={`welcome-bar-${i}`}
            accessibilityRole="button"
            accessibilityLabel={tr("Show slide {{value}} of {{length}}", { value: i + 1, length: SLIDES.length })}
            accessibilityState={{ selected: i === index }}
            onPress={() => goTo(i)}
            hitSlop={{ top: 12, bottom: 12 }}
            style={styles.barHit}
          >
            <View style={[styles.bar, i === index ? styles.barOn : null]} />
          </Pressable>
        ))}
      </View>
      <View style={[styles.padded, styles.actions]}>
        <PrimaryButton testID="welcome-signup" label={tr("Open a free profile")} onPress={onSignUp} />
        <GhostButton testID="welcome-login" label={tr("I have a profile")} onPress={onLogIn} />
      </View>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  padded: { paddingHorizontal: space.md },
  pager: { flex: 1 },
  pagerContent: { flexGrow: 1 },
  page: { flex: 1, paddingHorizontal: space.md },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  // Figma pictures are 300×300 pt; the files are 900×900 px (3×) so they stay sharp on phones.
  heroImage: { width: 300, height: 300, maxHeight: '100%' },
  text: { gap: 10, minHeight: 110 },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 22, color: color.text.primary },
  body: { ...typography.body, fontSize: 16, lineHeight: 24, color: color.text.secondary },
  bars: { flexDirection: 'row', gap: 8, marginTop: space.sm },
  barHit: { flex: 1, paddingVertical: 4 },
  bar: { height: 4, borderRadius: 2, backgroundColor: color.border.subtle },
  barOn: { backgroundColor: color.brand.fill },
  actions: { gap: 12, marginTop: space.lg },
}));
