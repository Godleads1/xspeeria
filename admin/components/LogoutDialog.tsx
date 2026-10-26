'use client';

/** Figma "Are you sure you want to log out of the application?" with No, Cancel / Yes, Logout. */

import { useEffect, useRef, type ReactElement } from 'react';

import { tr } from '../lib/i18n';
import { admin, color } from '../theme';

export function LogoutDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }): ReactElement {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const button = { flex: 1, height: 52, borderRadius: 10, fontFamily: 'inherit', fontSize: 16, fontWeight: 500, cursor: 'pointer' } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        data-testid="logout-dialog"
        style={{ width: 390, maxWidth: '100%', backgroundColor: color.bg.canvas, borderRadius: 4, boxShadow: `0 16px 40px ${admin.shadow}`, textAlign: 'center' }}
      >
        <p id="logout-title" style={{ margin: 0, padding: '28px 32px 16px', fontSize: 18, fontWeight: 500, lineHeight: 1.4 }}>
          {tr('Are you sure you want to log out of the application?')}
        </p>
        <svg width="120" height="110" viewBox="0 0 120 110" aria-hidden="true" style={{ display: 'block', margin: '0 auto 24px' }}>
          <path d="M28 10h30v90H28z" style={{ fill: color.text.secondary }} />
          <path d="M58 10h12v20h-6V16h-6zM58 100h12V80h-6v14h-6z" style={{ fill: color.text.secondary }} />
          <circle cx="51" cy="57" r="3" fill="#fff" />
          <path d="M66 46h22V34l24 21-24 21V64H66z" fill="#9BD8C2" />
        </svg>
        <div style={{ display: 'flex', gap: 14, padding: '16px 14px 16px', borderTop: `1px solid ${color.border.subtle}` }}>
          <button ref={cancel} type="button" data-testid="logout-cancel" onClick={onCancel} style={{ ...button, backgroundColor: color.bg.canvas, border: `1px solid ${color.text.primary}`, color: color.text.primary }}>
            {tr('No, Cancel')}
          </button>
          <button type="button" data-testid="logout-confirm" onClick={onConfirm} style={{ ...button, backgroundColor: color.error.fill, border: 'none', color: color.text.onFill }}>
            {tr('Yes, Logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
