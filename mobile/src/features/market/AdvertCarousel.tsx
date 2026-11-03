/**
 * The Market screen's advert slot when staff have placed adverts (ADR-067; ADR-086).
 *
 * Owner, 2026-11-03: "many ads can be posted and it will be auto sliding itself". The slot
 * shows one advert at a time and slides to the next every `rotateSeconds` (5 by default, set
 * by the server), newest first, round and round. Small dots show which one is showing.
 *
 * - Swipe left or right to move by hand; touching the slot pauses the sliding (8 seconds at
 *   most, in case the finger lifting is never reported).
 * - With the phone's "Reduce motion" setting on, it never slides by itself (swipe still works).
 * - One advert: no dots, no sliding.
 * - Tapping opens the advert's link, only if it is a full https address.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  AccessibilityInfo,
  Animated,
  Image,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { safeAdvertLink } from "../../api/advertsApi";
import { tr } from "../../i18n";
import { color, themed } from "../../theme";

export interface AdvertSlide {
  id: string;
  name: string;
  link_url: string | null;
  source: { uri: string; headers: Record<string, string> };
}

const SWIPE = 30; // points of sideways movement that count as a swipe
/** A pause ends by itself after this, in case the phone never reports the finger lifting. */
const PAUSE_MAX_MS = 8000;

export function AdvertCarousel({
  slides,
  rotateSeconds = 5,
}: {
  slides: readonly AdvertSlide[];
  rotateSeconds?: number;
}): ReactElement | null {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [width, setWidth] = useState(0);
  const offset = useRef(new Animated.Value(0)).current;
  const count = slides.length;
  const at = count ? index % count : 0;

  useEffect(() => {
    let alive = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((on) => alive && setReduceMotion(Boolean(on)))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (on: boolean) =>
      setReduceMotion(on),
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  // The list changed (an advert ended or was added): start again from the first.
  const ids = slides.map((s) => s.id).join(",");
  useEffect(() => setIndex(0), [ids]);

  const go = (step: 1 | -1): void => {
    if (count < 2) return;
    setIndex((i) => (i + step + count) % count);
    if (!reduceMotion && width > 0) {
      offset.setValue(step * width); // the next one comes in from the side it moves towards
      Animated.timing(offset, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    }
  };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    if (!paused) return undefined;
    const t = setTimeout(() => setPaused(false), PAUSE_MAX_MS);
    return () => clearTimeout(t);
  }, [paused]);

  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return undefined;
    const t = setTimeout(() => goRef.current(1), Math.max(1, rotateSeconds) * 1000);
    return () => clearTimeout(t);
  }, [at, count, paused, reduceMotion, rotateSeconds]);

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -SWIPE) goRef.current(1);
          else if (g.dx >= SWIPE) goRef.current(-1);
        },
      }),
    [],
  );

  if (count === 0) return null;
  const slide = slides[at];
  const link = safeAdvertLink(slide.link_url);
  return (
    <View
      testID="market-advert-carousel"
      style={styles.fill}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...swipe.panHandlers}
    >
      <Animated.View style={[styles.fill, { transform: [{ translateX: offset }] }]}>
        <Pressable
          key={slide.id}
          testID="market-advert-live"
          accessibilityRole={link ? "link" : "image"}
          accessibilityLabel={
            count > 1
              ? tr("Advert {{n}} of {{total}}: {{name}}", { n: at + 1, total: count, name: slide.name })
              : slide.name
          }
          accessibilityHint={count > 1 ? tr("Swipe left or right for the other adverts.") : undefined}
          disabled={!link}
          // A finger on the advert (to read, tap or swipe) pauses the sliding until it lifts.
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          onTouchCancel={() => setPaused(false)}
          onPress={() => {
            if (link) void Linking.openURL(link).catch(() => undefined);
          }}
          style={styles.fill}
        >
          <Image source={slide.source} resizeMode="cover" style={styles.fill} />
        </Pressable>
      </Animated.View>
      {count > 1 ? (
        <View style={styles.dots} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          {slides.map((s, i) => (
            <View
              key={s.id}
              testID={`advert-dot-${i}`}
              accessibilityState={{ selected: i === at }}
              style={[styles.dot, i === at ? styles.dotOn : null]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  fill: { width: "100%", height: "100%" },
  dots: {
    position: "absolute" as const,
    bottom: 6,
    left: 0,
    right: 0,
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    gap: 5,
  },
  // Over a picture of any colour: white with a dark edge, the selected one longer.
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.35)",
  },
  dotOn: { width: 16, backgroundColor: color.text.onFill },
}));
