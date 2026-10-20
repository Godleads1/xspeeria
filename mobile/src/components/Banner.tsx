/**
 * In-app banner (Figma "Incorrect Password" message, ADR-044 N-2): a rounded card at the top
 * of the screen with a coloured icon, a bold title, one line of text and a close button.
 * It goes away by itself after a few seconds. One banner at a time; a new one replaces it.
 *
 * `showBanner` can be called from anywhere (no React context needed); `BannerHost` is rendered
 * once at the root. The banner never shows amounts, account numbers or anything secret.
 */

import { useEffect, useSyncExternalStore, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, typography, themed, brandWeight } from '../theme';
import { Icon, type IconName } from './icons';
import { tr } from "../i18n";

export type BannerTone = 'success' | 'warning' | 'error' | 'info';

export interface BannerMessage {
  tone: BannerTone;
  title: string;
  message?: string;
  /** Tapping the banner (not the close button). */
  onPress?: () => void;
}

const SHOW_MS = 5_000;

let current: (BannerMessage & { id: number }) | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function showBanner(b: BannerMessage): void {
  current = { ...b, id: nextId++ };
  emit();
}

export function hideBanner(): void {
  current = null;
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const ICON: Record<BannerTone, IconName> = { success: 'check', warning: 'info', error: 'close', info: 'bell' };

function tones(t: BannerTone): { surface: string; border: string; fill: string } {
  switch (t) {
    case 'success':
      return { surface: color.success.surface, border: color.success.border, fill: color.success.fill };
    case 'warning':
      return { surface: color.warning.surface, border: color.warning.border, fill: color.warning.fill };
    case 'error':
      return { surface: color.error.surface, border: color.error.border, fill: color.error.fill };
    default:
      return { surface: color.brand.secondarySurface, border: color.brand.secondary, fill: color.brand.secondary };
  }
}

export function Banner({ banner, onClose }: { banner: BannerMessage; onClose: () => void }): ReactElement {
  const t = tones(banner.tone);
  return (
    <View
      testID="banner"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
    >
      <Pressable
        testID="banner-open"
        accessibilityRole={banner.onPress ? 'button' : undefined}
        disabled={!banner.onPress}
        onPress={() => {
          onClose();
          banner.onPress?.();
        }}
        style={styles.main}
      >
        <View style={[styles.icon, { backgroundColor: t.fill }]}>
          <Icon name={ICON[banner.tone]} color={color.text.onFill} size={16} weight={2.25} />
        </View>
        <View style={styles.text}>
          <Text testID="banner-title" style={styles.title}>
            {banner.title}
          </Text>
          {banner.message ? (
            <Text testID="banner-message" style={styles.message}>
              {banner.message}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable testID="banner-close" accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={onClose} hitSlop={10}>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

/** Render once at the root. */
export function BannerHost(): ReactElement | null {
  const b = useSyncExternalStore(subscribe, () => current, () => current);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!b) return undefined;
    const id = b.id;
    const t = setTimeout(() => {
      if (current?.id === id) hideBanner();
    }, SHOW_MS);
    return () => clearTimeout(t);
  }, [b]);
  if (!b) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      <Banner banner={b} onClose={hideBanner} />
    </View>
  );
}

const styles = themed(() => ({
  host: { position: 'absolute', left: 12, right: 12, zIndex: 1000 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { ...typography.body, ...brandWeight('700'), color: color.text.primary },
  message: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  close: { ...typography.body, color: color.text.secondary, paddingHorizontal: 2 },
}));
