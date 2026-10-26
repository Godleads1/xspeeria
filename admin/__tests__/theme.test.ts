/** Theme choice (ADR-064): applied to <html>, kept if something resets it, synced across tabs. */

import { act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { theme } from '../lib/theme';

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  act(() => theme.set('light'));
});

describe('theme', () => {
  it('applies Dark and remembers it in this browser', () => {
    theme.set('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('xspeeria.admin.theme')).toBe('dark');
  });

  it('puts the choice back if something removes or changes it on <html>', async () => {
    theme.set('dark');
    document.documentElement.removeAttribute('data-theme');
    await tick();
    expect(document.documentElement.dataset.theme).toBe('dark');
    document.documentElement.dataset.theme = 'light';
    await tick();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows a choice made in another tab', () => {
    theme.set('light');
    window.localStorage.setItem('xspeeria.admin.theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'xspeeria.admin.theme', newValue: 'dark' }));
    expect(theme.get()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
