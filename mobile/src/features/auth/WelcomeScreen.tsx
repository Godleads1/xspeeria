/**
 * Welcome (Figma 33:1367), ADR-013. Swipeable intro slides with the four progress bars,
 * "Open a free profile" and "I have a profile". One picture per slide (Figma component
 * 55:2057, variants 55:2056/2054/2055/2053). Titles are Figma's; slide text is Figma's
 * except three claims that are not true or not verified for Xspeeria (ADR-022): "end-to-end
 * encryption" (not verified), "send and receive funds across borders" (no money crosses the
 * border) and "spend via prepaid card" (cards are not available, ADR-012). Copy needs
 * marketing/legal review. The photo artwork's licence must be confirmed before release.
 */

import { useState, type ReactElement } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { AuthTop, GhostButton } from './ui';

export const SLIDES = [
  { title: 'Welcome to Xspeeria', body: 'Experience fast, secure, and low-fee currency exchange — anytime, anywhere.' },
  { title: 'Exchange Money Peer-to-Peer', body: 'Set your own rate and match with verified people. One clear 1% fee, with no hidden margin in the rate.' },
  { title: 'Safe. Verified. Secure.', body: 'Everyone is identity-checked. Your money goes to a partner bank’s escrow, never to Xspeeria, until both sides have paid.' },
  { title: 'Go Global, Seamlessly', body: 'Exchange naira with people abroad. Each side is paid by local transfer in their own country — no money crosses the border.' },
] as const;

/** Decorative artwork, one per slide (Figma; licence to confirm, ADR-013). */
const HERO_IMAGES = [
  require('../../../assets/images/welcome-hero.png'),
  require('../../../assets/images/welcome-slide2.png'),
  require('../../../assets/images/welcome-slide3.png'),
  require('../../../assets/images/welcome-slide4.png'),
] as const;

function Hero({ index }: { index: number }): ReactElement {
  return (
    <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image testID="welcome-hero" source={HERO_IMAGES[index]} style={styles.heroImage} resizeMode="contain" />
    </View>
  );
}

export function WelcomeScreen({ onSignUp, onLogIn }: { onSignUp: () => void; onLogIn: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const slideW = width - space.md * 2;
  const [index, setIndex] = useState(0);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, Math.round(e.nativeEvent.contentOffset.x / slideW))));
  };

  return (
    <View testID="welcome-screen" style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + space.sm }]}>
      <AuthTop />
      <Hero index={index} />
      <ScrollView testID="welcome-slides" horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onEnd} style={styles.slides}>
        {SLIDES.map((s) => (
          <View key={s.title} style={[styles.slide, { width: slideW }]}>
            <Text accessibilityRole="header" style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.bars} accessible accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.bar, i === index ? styles.barOn : null]} />
        ))}
      </View>
      <View style={styles.actions}>
        <PrimaryButton testID="welcome-signup" label="Open a free profile" onPress={onSignUp} />
        <GhostButton testID="welcome-login" label="I have a profile" onPress={onLogIn} />
      </View>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas, paddingHorizontal: space.md },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  // Figma pictures are 300×300 pt; the files are 900×900 px (3×) so they stay sharp on phones.
  heroImage: { width: 300, height: 300 },
  slides: { flexGrow: 0 },
  slide: { gap: 10 },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 22, color: color.text.primary },
  body: { ...typography.body, fontSize: 16, lineHeight: 24, color: color.text.secondary },
  bars: { flexDirection: 'row', gap: 8, marginTop: space.sm },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.border.subtle },
  barOn: { backgroundColor: color.brand.fill },
  actions: { gap: 12, marginTop: space.lg },
}));
