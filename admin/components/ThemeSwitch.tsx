'use client';

/** Light / Dark / System switch (ADR-064): three small buttons, the chosen one pressed. */

import type { ReactElement } from 'react';

import { tr } from '../lib/i18n';
import { theme, useTheme, type ThemeChoice } from '../lib/theme';
import { color } from '../theme';

const ICON: Record<ThemeChoice, string> = {
  light: 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4',
  dark: 'M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5Z',
  system: 'M3 4h14v9H3zM7 17h6M10 13v4',
};
export const THEME_LABEL: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function ThemeSwitch({ compact = false }: { compact?: boolean }): ReactElement {
  const current = useTheme();
  return (
    <div
      role="group"
      aria-label={tr('Theme')}
      data-testid="theme"
      style={{ display: 'inline-flex', border: `1px solid ${color.border.subtle}`, borderRadius: 10, overflow: 'hidden', backgroundColor: color.bg.canvas }}
    >
      {(Object.keys(THEME_LABEL) as ThemeChoice[]).map((t) => {
        const on = t === current;
        return (
          <button
            key={t}
            type="button"
            data-testid={`theme-${t}`}
            aria-pressed={on}
            title={tr(THEME_LABEL[t])}
            aria-label={compact ? tr(THEME_LABEL[t]) : undefined}
            onClick={() => theme.set(t)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 38,
              padding: compact ? '0 10px' : '0 12px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: on ? 600 : 500,
              color: on ? color.text.primary : color.text.secondary,
              backgroundColor: on ? color.bg.sunken : 'transparent',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON[t]} />
            </svg>
            {compact ? null : tr(THEME_LABEL[t])}
          </button>
        );
      })}
    </div>
  );
}
