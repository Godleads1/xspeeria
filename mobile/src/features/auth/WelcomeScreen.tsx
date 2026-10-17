/**
 * Welcome (Figma 33:1367), ADR-013. Swipeable intro slides with the four progress bars,
 * "Open a free profile" and "I have a profile". Slide 1 is Figma's copy; slides 2–4 are
 * drawn from the approved model and need marketing/legal review. The Figma stock photo
 * is replaced by the Xspeeria logo with a decorative ring (licence not confirmed).
 */

import { useState, type ReactElement } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { AuthTop, GhostButton } from './ui';

export const SLIDES = [
  { title: 'Welcome to Xspeeria', body: 'Experience fast, secure, and low-fee currency exchange — anytime, anywhere.' },
  { title: 'Your money stays yours', body: 'Xspeeria never holds your money. Each side pays into a partner bank account in their own country.' },
  { title: 'One flat, clear fee', body: 'No percentage and no hidden margin in the rate. You see the fee before you confirm.' },
  { title: 'Real, verified people', body: 'Everyone confirms their identity before they trade, so you always deal with real people.' },
] as const;

function Hero(): ReactElement {
  return (
    <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={260} height={220} viewBox="0 0 260 220" style={styles.heroArt}>
        <Defs>
          <RadialGradient id="w-glow" cx="0.5" cy="0.55" r="0.5">
            <Stop offset="0" stopColor="#7C3AED" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={130} cy={115} r={105} fill="url(#w-glow)" />
        <Ellipse cx={130} cy={175} rx={95} ry={18} fill="none" stroke="#A78BFA" strokeWidth={3} opacity={0.7} />
        <Ellipse cx={130} cy={175} rx={78} ry={12} fill="none" stroke="#C4B5FD" strokeWidth={1.5} opacity={0.6} />
        <Circle cx={212} cy={58} r={20} fill="#A5F3FC" opacity={0.9} />
        <Circle cx={232} cy={92} r={10} fill="#CFFAFE" opacity={0.9} />
      </Svg>
      {/* White backing keeps the navy logo legible in dark mode (invisible in light). */}
      <View style={styles.logoBacking}>
        <Image source={require('../../../../assets/brand/xspeeria-logo.png')} style={styles.logo} resizeMode="contain" />
      </View>
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
      <Hero />
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
  heroArt: { position: 'absolute' },
  logoBacking: { backgroundColor: '#FFFFFF', borderRadius: 28, paddingHorizontal: 18, paddingVertical: 6 },
  logo: { width: 170, height: 120 },
  slides: { flexGrow: 0 },
  slide: { gap: 10 },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 22, color: color.text.primary },
  body: { ...typography.body, fontSize: 16, lineHeight: 24, color: color.text.secondary },
  bars: { flexDirection: 'row', gap: 8, marginTop: space.sm },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.border.subtle },
  barOn: { backgroundColor: color.brand.fill },
  actions: { gap: 12, marginTop: space.lg },
}));
