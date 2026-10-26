'use client';

/** Figma "Light Toast": white card, blue info mark, title, message and a close button. */

import { useEffect, useState, type ReactElement } from 'react';

import { tr } from '../lib/i18n';
import { admin, color } from '../theme';

export function Toast({
  title,
  message,
  testId,
  autoHideMs = 8000,
}: {
  title: string;
  message: string;
  testId?: string;
  autoHideMs?: number;
}): ReactElement | null {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open || autoHideMs <= 0) return;
    const t = setTimeout(() => setOpen(false), autoHideMs);
    return () => clearTimeout(t);
  }, [open, autoHideMs]);
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      style={{
        position: 'fixed',
        top: 24,
        insetInlineEnd: 24,
        zIndex: 50,
        width: 343,
        maxWidth: 'calc(100vw - 48px)',
        boxSizing: 'border-box',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '16px 16px 16px 14px',
        backgroundColor: color.bg.canvas,
        borderRadius: 10,
        boxShadow: `0 12px 32px ${admin.shadow}`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flex: '0 0 auto',
          width: 24,
          height: 24,
          borderRadius: 6,
          backgroundColor: color.brand.secondary,
          color: color.text.onFill,
          display: 'grid',
          placeItems: 'center',
          fontWeight: 800,
          fontSize: 14,
          fontFamily: 'Georgia, serif',
        }}
      >
        i
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: color.text.primary }}>{title}</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.45, color: color.text.secondary }}>{message}</p>
      </div>
      <button
        type="button"
        aria-label={tr('Close')}
        onClick={() => setOpen(false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: color.text.secondary, fontSize: 20, lineHeight: 1, padding: 2 }}
      >
        ×
      </button>
    </div>
  );
}
