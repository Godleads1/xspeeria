/**
 * ADR-053: the seven app languages. Every sentence the app shows has a translation in each
 * language, with the same {{placeholders}} and <n> tags, and nothing stale is left behind.
 */
import fs from 'fs';
import path from 'path';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { LANGUAGES, RESOURCES, dayMonthYear, deviceLanguage, isRtl, language, tr } from '../src/i18n';
import { keysIn, placeholders, tags } from '../src/i18n/keys';
import { trRich } from '../src/i18n/rich';
import { LanguageSheet } from '../src/features/profile/LanguageSheet';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { ProfileScreen } from '../src/features/profile/ProfileScreen';

const ROOT = path.join(__dirname, '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (!/node_modules|locales/.test(p)) out.push(...sources(p));
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('keys.ts')) out.push(p);
  }
  return out;
}

const KEYS = new Set([...sources(path.join(ROOT, 'src')), ...sources(path.join(ROOT, 'app'))].flatMap((f) => keysIn(fs.readFileSync(f, 'utf8'))));

afterEach(async () => {
  await act(async () => {
    await language.set('en-GB');
  });
});

describe('language files', () => {
  it('finds the app sentences', () => {
    expect(KEYS.size).toBeGreaterThan(1000);
    expect(KEYS.has('Welcome Back')).toBe(true);
  });

  it.each(['fr', 'ar', 'es', 'zh-Hans', 'pt'] as const)('%s translates every sentence, keeping placeholders and tags', (code) => {
    const words = RESOURCES[code];
    const missing = [...KEYS].filter((k) => !words[k]?.trim());
    expect(missing).toEqual([]);
    const broken = [...KEYS].filter(
      (k) => placeholders(words[k]).join() !== placeholders(k).join() || tags(words[k]).join() !== tags(k).join(),
    );
    expect(broken).toEqual([]);
    expect(Object.keys(words).filter((k) => !KEYS.has(k))).toEqual([]);
  });

  it('English (US) lists only real sentences and keeps their placeholders', () => {
    const us = RESOURCES['en-US'];
    for (const [k, v] of Object.entries(us)) {
      expect(KEYS.has(k)).toBe(true);
      expect(placeholders(v)).toEqual(placeholders(k));
    }
    expect(us['Deal cancelled']).toBe('Deal canceled');
  });

  it('offers exactly the seven languages the owner chose', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en-GB', 'en-US', 'fr', 'ar', 'es', 'zh-Hans', 'pt']);
    expect(LANGUAGES.filter((l) => isRtl(l.code)).map((l) => l.code)).toEqual(['ar']);
  });
});

describe('choosing a language', () => {
  it('starts from the phone language when nothing is saved', () => {
    expect(deviceLanguage([{ languageTag: 'fr-FR', languageCode: 'fr', regionCode: 'FR' }])).toBe('fr');
    expect(deviceLanguage([{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }])).toBe('en-US');
    expect(deviceLanguage([{ languageTag: 'en-NG', languageCode: 'en', regionCode: 'NG' }])).toBe('en-GB');
    expect(deviceLanguage([{ languageTag: 'zh-Hans-CN', languageCode: 'zh', regionCode: 'CN' }])).toBe('zh-Hans');
    // Traditional Chinese is not offered: fall through to the next phone language.
    expect(deviceLanguage([{ languageTag: 'zh-Hant-TW', languageCode: 'zh', regionCode: 'TW' }, { languageTag: 'pt-BR', languageCode: 'pt', regionCode: 'BR' }])).toBe('pt');
    expect(deviceLanguage([{ languageTag: 'yo-NG', languageCode: 'yo', regionCode: 'NG' }])).toBe('en-GB');
    expect(deviceLanguage([])).toBe('en-GB');
  });

  it('translates with placeholders, and falls back to English for an unknown sentence', async () => {
    await act(async () => {
      await language.set('fr');
    });
    expect(tr('Log out')).toBe('Se déconnecter');
    expect(tr('Step {{step}} of {{steps}}', { step: 2, steps: 3 })).toBe('Étape 2 sur 3');
    expect(tr('A sentence nobody wrote')).toBe('A sentence nobody wrote');
    await act(async () => {
      await language.set('en-US');
    });
    expect(tr('Deal cancelled')).toBe('Deal canceled');
    expect(tr('Log out')).toBe('Log out');
    expect(dayMonthYear(12, 9, 2026)).toBe('October 12, 2026');
    await act(async () => {
      await language.set('zh-Hans');
    });
    expect(dayMonthYear(12, 9, 2026)).toBe('2026年10月12日');
  });

  it('keeps styled parts of a sentence where the translation puts them', async () => {
    await act(async () => {
      await language.set('ar');
    });
    await render(
      <Text testID="rich">
        {trRich('1. All payments <1>MUST</1> be made from a bank account registered in your name, matching the name on your Xspeeria profile.', {}, {
          1: (s) => <Text testID="rich-strong">{s}</Text>,
        })}
      </Text>,
    );
    expect(screen.getByTestId('rich-strong')).toHaveTextContent('يجب');
  });

  it('the picker lists each language in its own name and switches', async () => {
    const onClose = jest.fn();
    await render(<LanguageSheet visible onClose={onClose} />);
    expect(screen.getByText('Français')).toBeTruthy();
    expect(screen.getByText('العربية')).toBeTruthy();
    expect(screen.getByText('简体中文')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('language-es'));
    });
    expect(language.get()).toBe('es');
    expect(onClose).toHaveBeenCalled();
  });

  it('screens draw in another language', async () => {
    await act(async () => {
      await language.set('fr');
    });
    await render(<LoginScreen onDone={jest.fn()} onSignUp={jest.fn()} onForgot={jest.fn()} />);
    expect(screen.getByText('Bon retour')).toBeTruthy();
    expect(screen.getByText('PIN oublié ?')).toBeTruthy();
    await act(async () => {
      await language.set('ar');
    });
    await render(<ProfileScreen onOpen={jest.fn()} />);
    expect(screen.getByText('الأمان')).toBeTruthy();
    expect(screen.getByText('العربية')).toBeTruthy();
  });
});
