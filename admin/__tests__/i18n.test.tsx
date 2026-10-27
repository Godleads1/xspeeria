/**
 * Console languages (ADR-053): every sentence the console shows has a translation in each
 * language, placeholders survive, Arabic turns the page right to left, and the picker works.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguagePicker } from '../components/LanguagePicker';
import { CodeBoxes } from '../components/CodeBoxes';
import { Toast } from '../components/Toast';
import { STATUS_LABEL, TAB_LABEL } from '../components/screens/DashboardScreen';
import { THEME_LABEL } from '../components/ThemeSwitch';
import { CONFIRM, DONE, QUESTION } from '../components/screens/UsersScreen';
import { EVENTS, OUTCOMES } from '../components/screens/DisputeCaseScreen';
import { PRIORITY } from '../components/screens/RaiseDispute';
import { REVERSAL_STATUS } from '../components/screens/ReversalsScreen';
import { PHASE_LABEL } from '../components/screens/ReversalScreen';
import { OUTAGE_STATUS, SEVERITY } from '../components/screens/OutagesScreen';
import { FRAUD_RULE, FRAUD_SEVERITY, FRAUD_STATUS } from '../components/screens/FraudScreen';
import { RESOLUTION } from '../components/screens/FraudCaseScreen';
import { COUNTRY_NAME, QUEUE_LABEL, REVIEW_REASON } from '../components/screens/KycScreen';
import { ID_TYPE, STATE_WORD } from '../components/screens/KycCaseScreen';
import { ADVERT_STATE } from '../components/screens/AdvertsScreen';
import { WORK_DETAIL, WORK_LABEL } from '../components/Notifications';
import ar from '../lib/locales/ar.json';
import es from '../lib/locales/es.json';
import fr from '../lib/locales/fr.json';
import pt from '../lib/locales/pt.json';
import zh from '../lib/locales/zh-Hans.json';
import { browserLanguage, language, tr } from '../lib/i18n';
import { ACTION_LABELS, ACTIONS, MODULES, ROLE_LABELS } from '../lib/permissions';
import { NAV_ITEMS, PLANNED_DESTINATIONS } from '../fixtures';
import { useState } from 'react';

const LOCALES: Record<string, Record<string, string>> = { fr, ar, es, 'zh-Hans': zh, pt };

function sources(dir = join(__dirname, '..')): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', '__tests__', 'locales', 'public'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function shownSentences(): Set<string> {
  const found = new Set<string>();
  for (const file of sources()) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) found.add(m[1].replace(/\\'/g, "'"));
  }
  for (const l of [...MODULES, ...ACTIONS, ...NAV_ITEMS, ...PLANNED_DESTINATIONS]) found.add(l.label);
  for (const l of [...Object.values(ROLE_LABELS), ...Object.values(ACTION_LABELS), ...Object.values(TAB_LABEL), ...Object.values(QUESTION), ...Object.values(CONFIRM), ...Object.values(DONE), ...Object.values(EVENTS), ...Object.values(OUTCOMES), ...Object.values(PRIORITY), ...Object.values(STATUS_LABEL), ...Object.values(THEME_LABEL), ...Object.values(REVERSAL_STATUS), ...Object.values(PHASE_LABEL), ...Object.values(SEVERITY), ...Object.values(OUTAGE_STATUS), ...Object.values(ADVERT_STATE), ...Object.values(FRAUD_RULE), ...Object.values(FRAUD_SEVERITY), ...Object.values(FRAUD_STATUS), ...Object.values(RESOLUTION), ...Object.values(QUEUE_LABEL), ...Object.values(REVIEW_REASON), ...Object.values(COUNTRY_NAME), ...Object.values(ID_TYPE), ...Object.values(STATE_WORD), ...Object.values(WORK_LABEL), ...Object.values(WORK_DETAIL)]) found.add(l);
  return found;
}

afterEach(() => {
  act(() => language.set('en-GB'));
});

describe('console languages', () => {
  it('every sentence the console shows is translated in every language', () => {
    const missing: string[] = [];
    for (const key of shownSentences()) {
      for (const [code, words] of Object.entries(LOCALES)) if (!(key in words)) missing.push(`${code}: ${key}`);
    }
    expect(missing).toEqual([]);
  });

  it('names and numbers survive translation', () => {
    for (const words of Object.values(LOCALES)) {
      for (const [key, value] of Object.entries(words)) {
        const want = [...key.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
        const got = [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
        expect(got, key).toEqual(want);
      }
    }
  });

  it('picks the browser language, English (UK) otherwise', () => {
    expect(browserLanguage(['fr-FR'])).toBe('fr');
    expect(browserLanguage(['en-US'])).toBe('en-US');
    expect(browserLanguage(['zh-TW', 'pt-BR'])).toBe('pt'); // Traditional Chinese not offered
    expect(browserLanguage(['de-DE'])).toBe('en-GB');
  });

  it('the picker lists seven languages and Arabic turns the page right to left', async () => {
    render(<LanguagePicker />);
    fireEvent.click(screen.getByTestId('language'));
    expect(screen.getAllByRole('option')).toHaveLength(7);
    await act(async () => fireEvent.click(screen.getByTestId('language-ar')));
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(tr('Logout')).toBe('تسجيل الخروج');
    act(() => language.set('fr'));
    expect(document.documentElement.dir).toBe('ltr');
    expect(tr('Invitation sent to {{name}}.', { name: 'Kemi' })).toBe('Invitation envoyée à Kemi.');
  });

  it('unknown sentences fall back to English, never blank', () => {
    act(() => language.set('es'));
    expect(tr('A sentence nobody translated')).toBe('A sentence nobody translated');
  });
});

describe('two-factor code boxes', () => {
  function Boxes() {
    const [v, setV] = useState('');
    return <CodeBoxes value={v} onChange={setV} testId="c" />;
  }

  it('typing moves on, Backspace goes back, paste fills all six', () => {
    render(<Boxes />);
    fireEvent.change(screen.getByTestId('c'), { target: { value: '4' } });
    expect(screen.getByTestId('c')).toHaveValue('4');
    expect(document.activeElement).toBe(screen.getByTestId('c-1'));
    fireEvent.keyDown(screen.getByTestId('c-1'), { key: 'Backspace' });
    expect(screen.getByTestId('c')).toHaveValue('');
    fireEvent.paste(screen.getByTestId('c'), { clipboardData: { getData: () => '98 76-54' } });
    expect(['c', 'c-1', 'c-2', 'c-3', 'c-4', 'c-5'].map((id) => (screen.getByTestId(id) as HTMLInputElement).value).join('')).toBe('987654');
  });
});

describe('toast', () => {
  it('shows and closes', () => {
    render(<Toast title="Password Changed" message="Done." testId="t" />);
    expect(screen.getByTestId('t')).toHaveTextContent('Password Changed');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('t')).toBeNull();
  });
});
