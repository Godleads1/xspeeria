/**
 * Launch screen (Figma 33:1355): the Xspeeria logo centred on the soft surface. It is the
 * same picture as the native splash (app.json), held for a moment after the app is ready so
 * it reads as the first screen, then fades into Welcome (or Home when signed in).
 * Always light, like the native splash, so there is no flash between the two.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import { Animated, Image } from 'react-native';
import { tr } from "../../i18n";

export const LAUNCH_HOLD_MS = 1200;
const LOGO_W = 290;
const LOGO_H = Math.round((LOGO_W * 127) / 448);

export function LaunchSplash({ onDone, holdMs = LAUNCH_HOLD_MS }: { onDone: () => void; holdMs?: number }): ReactElement {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => onDone());
    }, holdMs);
    return () => clearTimeout(t);
  }, [holdMs, onDone, opacity]);

  return (
    <Animated.View testID="launch-splash" style={[styles.fill, { opacity }]} accessible accessibilityLabel={tr("Xspeeria")}>
      <Image source={require('../../../../assets/brand/xspeeria-logo.png')} style={{ width: LOGO_W, height: LOGO_H }} resizeMode="contain" />
    </Animated.View>
  );
}

/** Same value as app.json splash backgroundColor and light `bg.sunken` (splash.test.ts). */
export const SPLASH_BACKGROUND = '#F8F9FD';

// Fixed light colour on purpose: matches the native splash in every mode.
const styles = {
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: SPLASH_BACKGROUND, alignItems: 'center', justifyContent: 'center' },
} as const;
