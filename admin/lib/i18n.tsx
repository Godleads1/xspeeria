'use client';

/**
 * Console languages (ADR-053: "English UK, English US, French, Arabic, Spanish, Chinese
 * (Simplified), Portuguese — for both the mobile and the web").
 *
 * Same rules as the app: the English (UK) sentence is the key, `tr('Log in')`; a missing
 * translation shows English, never a blank; English (US) lists only words spelt differently.
 * Arabic turns the whole page right to left. The choice is kept in this browser only.
 *
 * Translations were drafted without a native speaker (like the app's) and must be reviewed
 * before launch.
 */

import { useEffect, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';

import ar from './locales/ar.json';
import enUS from './locales/en-US.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import zhHans from './locales/zh-Hans.json';

export const LANGUAGES = [
  { code: 'en-GB', label: 'English - United Kingdom', short: 'English', flag: 'gb' },
  { code: 'en-US', label: 'English - United States of America', short: 'English (US)', flag: 'us' },
  { code: 'fr', label: 'French', short: 'Français', flag: 'fr' },
  { code: 'ar', label: 'Arabic', short: 'العربية', flag: 'ar' },
  { code: 'es', label: 'Spanish', short: 'Español', flag: 'es' },
  { code: 'zh-Hans', label: 'Chinese', short: '简体中文', flag: 'cn' },
  { code: 'pt', label: 'Portuguese', short: 'Português', flag: 'pt' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const WORDS: Record<Exclude<LanguageCode, 'en-GB'>, Record<string, string>> = {
  'en-US': enUS,
  fr,
  ar,
  es,
  'zh-Hans': zhHans,
  pt,
};
const CODES = new Set<string>(LANGUAGES.map((l) => l.code));
const KEY = 'xspeeria.admin.language';

let current: LanguageCode = 'en-GB';
const listeners = new Set<() => void>();

export const isRtl = (code: LanguageCode): boolean => code === 'ar';

/** Marks an English sentence kept in a constant; the screen translates it with `tr`. */
export function k(key: string): string {
  return key;
}

export function tr(key: string, values?: Record<string, unknown>): string {
  const text = current === 'en-GB' ? key : (WORDS[current][key] ?? key);
  return values ? text.replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(values[n] ?? '')) : text;
}

function applyToPage(code: LanguageCode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
  document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr';
}

export const language = {
  get: (): LanguageCode => current,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(code: string): void {
    if (!CODES.has(code)) return;
    current = code as LanguageCode;
    applyToPage(current);
    try {
      window.localStorage.setItem(KEY, current);
    } catch {
      /* Not saved (private window, blocked storage): the browser's language is used next time. */
    }
    for (const l of listeners) l();
  },
};

/** The browser's own language, mapped to one we offer; English (UK) otherwise. */
export function browserLanguage(tags: readonly string[]): LanguageCode {
  for (const tag of tags) {
    const [lang = '', ...rest] = tag.split('-');
    const l = lang.toLowerCase();
    if (l === 'en') return rest.some((r) => r.toUpperCase() === 'US') ? 'en-US' : 'en-GB';
    if (l === 'zh') {
      if (/Hant|TW|HK|MO/i.test(tag)) continue; // Traditional Chinese is not offered
      return 'zh-Hans';
    }
    if (l === 'fr' || l === 'ar' || l === 'es' || l === 'pt') return l;
  }
  return 'en-GB';
}

export function useLanguage(): LanguageCode {
  // The server always renders English; the saved choice is applied after the page loads.
  return useSyncExternalStore(language.subscribe, language.get, () => 'en-GB');
}

/**
 * Wraps the whole console. Picks the saved (or browser) language once the page has loaded,
 * and redraws everything when the language changes.
 */
export function LanguageRoot({ children }: { children: ReactNode }): ReactElement {
  const code = useLanguage();
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(KEY);
    } catch {
      saved = null;
    }
    const pick = saved && CODES.has(saved) ? saved : browserLanguage(navigator.languages ?? [navigator.language]);
    if (pick !== current) language.set(pick);
    else applyToPage(current);
  }, []);
  // A new key redraws every screen in the new language (typed text in open forms is cleared).
  return <div key={code} style={{ display: 'contents' }}>{children}</div>;
}
