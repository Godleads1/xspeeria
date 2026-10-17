/**
 * Light / dark mode (DEC-016, ADR-010).
 *
 * One app-wide mode, chosen with Profile → Switch Mode and remembered on the device.
 * `color`, `interaction` and `themed()` styles read the current mode at render time, and
 * every route subscribes with `useThemeMode()`, so a change repaints every screen — including
 * screens built later, as long as they use `themed()` and the live `color`.
 */

import { useSyncExternalStore } from 'react';
import { Appearance, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  color as lightColor,
  colorDark,
  interaction as lightInteraction,
  interactionDark,
  type ColorScheme,
  type InteractionScheme,
} from '@xspeeria/tokens';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'xspeeria.themeMode';

let mode: ThemeMode = 'light';
const listeners = new Set<() => void>();

export function getThemeMode(): ThemeMode {
  return mode;
}

export function setThemeMode(next: ThemeMode, persist = true): void {
  if (next === mode) return;
  mode = next;
  // Native pieces (alerts, pickers, keyboard) follow the app's mode too.
  try {
    Appearance.setColorScheme?.(next);
  } catch {
    /* Not supported on this platform. */
  }
  if (persist) AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  for (const l of listeners) l();
}

/** Restores the saved mode at startup. Unknown values are ignored (light stays). */
export async function loadSavedThemeMode(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') setThemeMode(saved, false);
  } catch {
    /* Storage unavailable: keep the default. */
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Subscribes the calling component to mode changes and returns the mode. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode, getThemeMode);
}

function live<T extends object>(light: T, dark: T): T {
  return new Proxy({} as T, {
    get: (_t, key) => (mode === 'dark' ? dark : light)[key as keyof T],
    has: (_t, key) => key in light,
    ownKeys: () => Reflect.ownKeys(light),
    getOwnPropertyDescriptor: (_t, key) => {
      const src = mode === 'dark' ? dark : light;
      const d = Object.getOwnPropertyDescriptor(src, key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

/** Semantic colours for the current mode. Read at render time, never cached at module scope. */
export const color: ColorScheme = live<ColorScheme>(lightColor, colorDark);
export const interaction: InteractionScheme = live<InteractionScheme>(lightInteraction, interactionDark);

/**
 * `StyleSheet.create` for both modes: the factory runs once per mode (lazily) with the live
 * `color`, and `styles.x` returns the current mode's style. Use it for every screen.
 */
export function themed<T extends StyleSheet.NamedStyles<T>>(factory: () => T & StyleSheet.NamedStyles<T>): T {
  const cache: Partial<Record<ThemeMode, T>> = {};
  const current = (): T => {
    const hit = cache[mode];
    if (hit) return hit;
    const made = StyleSheet.create(factory());
    cache[mode] = made;
    return made;
  };
  return new Proxy({} as T, {
    get: (_t, key) => current()[key as keyof T],
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_t, key) => {
      const d = Object.getOwnPropertyDescriptor(current(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}
