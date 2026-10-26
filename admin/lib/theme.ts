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

function wanted(): 'dark' | 'light' {
  return current === 'dark' || (current === 'system' && systemDark()) ? 'dark' : 'light';
}

function apply(): void {
  if (document.documentElement.dataset.theme !== wanted()) document.documentElement.dataset.theme = wanted();
}

if (typeof window !== 'undefined') {
  apply();
  // Keep the choice even if something rewrites <html>: React can reset that element's
  // attributes when the page re-mounts it, and browser extensions sometimes touch it.
  try {
    new MutationObserver(() => apply()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch {
    // No MutationObserver: the boot script and the switch still apply the choice.
  }
  // Another tab changed the choice: follow it here too, so tabs never disagree.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    current = read();
    apply();
    listeners.forEach((l) => l());
  });
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
