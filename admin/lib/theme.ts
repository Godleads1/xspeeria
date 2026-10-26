'use client';

/**
 * Light / Dark / System theme (ADR-064). The choice is kept in this browser only
 * (`localStorage`, read and written inside try/catch); "System" follows the computer's
 * setting and changes with it. A tiny script in <head> (`THEME_BOOT`) applies the saved choice
 * before the page paints, so dark mode never flashes white.
 */

import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'xspeeria.admin.theme';
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

let current: ThemeChoice = typeof window === 'undefined' ? 'system' : read();

function apply(): void {
  const dark = current === 'dark' || (current === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

if (typeof window !== 'undefined') {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (current === 'system') {
        apply();
        listeners.forEach((l) => l());
      }
    });
  } catch {
    // Old browsers without matchMedia listeners: "System" is read once.
  }
}

export const theme = {
  get: (): ThemeChoice => current,
  /** "dark" or "light" as shown right now. */
  shown: (): 'dark' | 'light' =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  set(choice: ThemeChoice): void {
    current = choice;
    try {
      window.localStorage.setItem(KEY, choice);
    } catch {
      // Private window or blocked storage: the choice lasts until the page closes.
    }
    apply();
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(theme.subscribe, theme.get, () => 'system');
}

/** Runs in <head> before paint: same rules as above, no imports. */
export const THEME_BOOT = `(function(){try{var v=localStorage.getItem('${KEY}');var d=v==='dark'||((v===null||v==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;
