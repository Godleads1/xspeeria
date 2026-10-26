'use client';

/**
 * Figma "Dropdown" language picker: a white button (flag, language, arrow) opening the list
 * of the seven languages. Flags are drawn here (simple round flags) because Windows shows
 * flag emoji as letters.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';

import { LANGUAGES, language, tr, useLanguage } from '../lib/i18n';
import { color } from '../theme';
import { Icon } from './icons';

export function Flag({ flag, size = 24 }: { flag: string; size?: number }): ReactElement {
  const clip = `flag-${flag}`;
  const body: Record<string, ReactElement> = {
    gb: (
      <>
        <rect width="24" height="24" fill="#012169" />
        <path d="M0 0 24 24M24 0 0 24" stroke="#fff" strokeWidth="5" />
        <path d="M0 0 24 24M24 0 0 24" stroke="#C8102E" strokeWidth="1.6" />
        <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="7" />
        <path d="M12 0v24M0 12h24" stroke="#C8102E" strokeWidth="4" />
      </>
    ),
    us: (
      <>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} y={i * 3.7} width="24" height="1.85" fill="#B22234" />
        ))}
        <rect y="1.85" width="24" height="1.85" fill="#fff" />
        <rect width="11" height="13" fill="#3C3B6E" />
      </>
    ),
    fr: (
      <>
        <rect width="8" height="24" fill="#0055A4" />
        <rect x="8" width="8" height="24" fill="#fff" />
        <rect x="16" width="8" height="24" fill="#EF4135" />
      </>
    ),
    ar: (
      <>
        <rect width="24" height="24" fill="#006C35" />
        <text x="12" y="16" textAnchor="middle" fontSize="11" fill="#fff" fontFamily="sans-serif">
          ع
        </text>
      </>
    ),
    es: (
      <>
        <rect width="24" height="24" fill="#AA151B" />
        <rect y="6" width="24" height="12" fill="#F1BF00" />
      </>
    ),
    cn: (
      <>
        <rect width="24" height="24" fill="#EE1C25" />
        <path d="m8 5 1.2 3.6H13l-3 2.2 1.1 3.6L8 12.2l-3.1 2.2L6 10.8 3 8.6h3.8Z" fill="#FFFF00" />
      </>
    ),
    pt: (
      <>
        <rect width="24" height="24" fill="#DA291C" />
        <rect width="9.6" height="24" fill="#046A38" />
        <circle cx="9.6" cy="12" r="4" fill="#FFE900" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>{body[flag]}</g>
    </svg>
  );
}

export function LanguagePicker(): ReactElement {
  const code = useLanguage();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const active = LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button
        type="button"
        data-testid="language"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tr('Language: {{name}}', { name: active.short })}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          backgroundColor: color.bg.canvas,
          border: `1px solid ${color.border.subtle}`,
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 14,
          color: color.text.primary,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
        }}
      >
        <Flag flag={active.flag} size={26} />
        {active.short}
        <Icon name="chevron" size={16} />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={tr('Language')}
          style={{
            position: 'absolute',
            insetInlineEnd: 0,
            top: 'calc(100% + 6px)',
            zIndex: 20,
            width: 280,
            margin: 0,
            padding: '6px 0',
            listStyle: 'none',
            backgroundColor: color.bg.canvas,
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)',
          }}
        >
          {LANGUAGES.map((l, i) => (
            <li key={l.code} role="option" aria-selected={l.code === code}>
              <button
                type="button"
                data-testid={`language-${l.code}`}
                lang={l.code}
                onClick={() => {
                  setOpen(false);
                  language.set(l.code);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  width: '100%',
                  padding: '12px 18px',
                  background: l.code === code ? color.brand.secondarySurface : 'none',
                  border: 'none',
                  borderTop: i === 0 ? 'none' : `1px solid ${color.border.subtle}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 15,
                  color: color.text.primary,
                  textAlign: 'start',
                }}
              >
                <Flag flag={l.flag} size={22} />
                {l.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
