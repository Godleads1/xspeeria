/**
 * App languages (ADR-053). Owner, 2026-10-19: "English UK, English US, French, Arabic,
 * Spanish, Chinese (Simplified), Portuguese — for both the mobile and the web". Owner,
 * 2026-11-10 (ADR-108): Swahili and Amharic added to the mobile app for the African corridors.
 *
 * The English (UK) sentence is the key: `t('Welcome Back')`. A language file maps each
 * English sentence to its translation; anything missing falls back to English, so a gap shows
 * English rather than a blank. English (US) lists only the words spelt differently.
 *
 * The choice is kept on this device. Arabic is written right to left: the layout flips after
 * the app restarts (React Native applies direction at start-up).
 *
 * Translations were drafted without a native speaker and must be reviewed before launch.
 * Legal texts (terms, privacy policy) stay in English until lawyer-approved translations exist.
 */

import { useSyncExternalStore } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { changeLanguage, init, t as i18nT, use as addPlugin } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { getLocales } from 'expo-localization';

import ar from './locales/ar.json';
import enUS from './locales/en-US.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import sw from './locales/sw.json';
import am from './locales/am.json';
import zhHans from './locales/zh-Hans.json';

export const LANGUAGES = [
  { code: 'en-GB', name: 'English (UK)', native: 'English (UK)' },
  { code: 'en-US', name: 'English (US)', native: 'English (US)' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  { code: 'am', name: 'Amharic', native: 'አማርኛ' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const RESOURCES: Record<Exclude<LanguageCode, 'en-GB'>, Record<string, string>> = {
  'en-US': enUS,
  fr,
  ar,
  es,
  'zh-Hans': zhHans,
  pt,
  sw,
  am,
};

const KEY = 'xspeeria.language';
const CODES = new Set<string>(LANGUAGES.map((l) => l.code));

export function isRtl(code: LanguageCode): boolean {
  return code === 'ar';
}

/** The phone's own language, mapped to one we offer; English (UK) otherwise. */
export function deviceLanguage(tags: readonly { languageTag?: string | null; languageCode?: string | null; regionCode?: string | null }[]): LanguageCode {
  for (const l of tags) {
    const lang = (l.languageCode ?? l.languageTag?.split('-')[0] ?? '').toLowerCase();
    const region = (l.regionCode ?? '').toUpperCase();
    const tag = l.languageTag ?? '';
    if (lang === 'en') return region === 'US' ? 'en-US' : 'en-GB';
    if (lang === 'zh') {
      // Traditional Chinese is not offered; Simplified only for zh-Hans / mainland / Singapore.
      if (/Hant|TW|HK|MO/.test(tag) || ['TW', 'HK', 'MO'].includes(region)) continue;
      return 'zh-Hans';
    }
    if (lang === 'fr' || lang === 'ar' || lang === 'es' || lang === 'pt' || lang === 'sw' || lang === 'am') return lang;
  }
  return 'en-GB';
}

let current: LanguageCode = 'en-GB';
const listeners = new Set<() => void>();

addPlugin(initReactI18next);
void init({
  lng: 'en-GB',
  fallbackLng: 'en-GB',
  resources: Object.fromEntries(
    Object.entries(RESOURCES).map(([code, words]) => [code, { translation: words }]),
  ),
  // English sentences are the keys, so "." and ":" are ordinary characters.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  initImmediate: false,
  showSupportNotice: false,
});

function apply(code: LanguageCode): void {
  current = code;
  void changeLanguage(code);
  I18nManager.allowRTL(true);
  for (const l of listeners) l();
}

export const language = {
  get: (): LanguageCode => current,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** True when the screen direction does not match the language yet (restart needed). */
  needsRestart: (): boolean => isRtl(current) !== I18nManager.isRTL,
  async set(code: LanguageCode): Promise<void> {
    if (!CODES.has(code)) return;
    apply(code);
    // Takes effect on the next start (React Native applies direction then).
    I18nManager.forceRTL(isRtl(code));
    try {
      await AsyncStorage.setItem(KEY, code);
    } catch {
      /* Not saved: the phone's language is used next time. */
    }
  },
  /** App start: the saved choice, else the phone's language. */
  async restore(): Promise<void> {
    let saved: string | null = null;
    try {
      saved = await AsyncStorage.getItem(KEY);
    } catch {
      saved = null;
    }
    const code = saved && CODES.has(saved) ? (saved as LanguageCode) : deviceLanguage(safeLocales());
    apply(code);
    I18nManager.forceRTL(isRtl(code));
  },
};

function safeLocales(): readonly { languageTag?: string | null; languageCode?: string | null; regionCode?: string | null }[] {
  try {
    return getLocales();
  } catch {
    return [];
  }
}

/**
 * Marks an English sentence kept in a constant (module level) so the language check finds it.
 * It returns the English; the screen that shows it calls `tr(value)` at display time.
 */
export function k(key: string, values?: Record<string, unknown>): string {
  return values ? key.replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(values[n] ?? '')) : key;
}

/** Outside React (e.g. notification words): translate with the current language. */
export function tr(key: string, values?: Record<string, unknown>): string {
  return i18nT(key, values);
}

// --- dates (no locale APIs: the app formats by hand, ADR-053) ---------------------------

const MONTHS = [
  k('January'), k('February'), k('March'), k('April'), k('May'), k('June'),
  k('July'), k('August'), k('September'), k('October'), k('November'), k('December'),
];
const MONTHS_SHORT = [
  k('Jan'), k('Feb'), k('Mar'), k('Apr'), k('May'), k('Jun'),
  k('Jul'), k('Aug'), k('Sep'), k('Oct'), k('Nov'), k('Dec'),
];
const WEEKDAYS_SHORT = [k('Mo'), k('Tu'), k('We'), k('Th'), k('Fr'), k('Sa'), k('Su')];

/** `monthIndex` 0–11. */
export function monthName(monthIndex: number, short = false): string {
  return tr((short ? MONTHS_SHORT : MONTHS)[monthIndex] ?? '');
}

/** Monday-first two-letter weekday names. */
export function weekdaysShort(): string[] {
  return WEEKDAYS_SHORT.map((d) => tr(d));
}

/** "12 Oct" (or the language's order). */
export function dayMonth(day: number, monthIndex: number): string {
  return tr('{{day}} {{month}}', { day, month: monthName(monthIndex, true) });
}

/** "12 October 2026" (or the language's order); `short` uses "Oct". */
export function dayMonthYear(day: number, monthIndex: number, year: number, short = false): string {
  return tr('{{day}} {{month}} {{year}}', { day, month: monthName(monthIndex, short), year });
}

/** "October 2026" (calendar header). */
export function monthYear(monthIndex: number, year: number): string {
  return tr('{{month}} {{year}}', { month: monthName(monthIndex), year });
}

export function useLanguage(): LanguageCode {
  return useSyncExternalStore(language.subscribe, language.get, language.get);
}

/** In components: `const t = useT();` then `t('Welcome Back')`. Re-renders on a change. */
export function useT(): (key: string, values?: Record<string, unknown>) => string {
  useLanguage();
  const { t } = useTranslation();
  return (key, values) => t(key, values);
}

