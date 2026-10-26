'use client';

/**
 * Figma confirm dialog with "Enter reason" (e.g. Reject): a question, a reason box, and
 * No, Cancel / Yes, <action>. The reason is required (5–300 characters, as on the server).
 */

import { useEffect, useId, useRef, useState, type ReactElement } from 'react';

import { tr } from '../lib/i18n';
import { color } from '../theme';

export function ReasonDialog({
  title,
  confirm,
  danger = false,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  confirm: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}): ReactElement {
  const [reason, setReason] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const clean = reason.trim().replace(/\s+/g, ' ');
  const ok = clean.length >= 5 && clean.length <= 300;
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const button = { flex: 1, height: 48, borderRadius: 10, fontFamily: 'inherit', fontSize: 16, fontWeight: 500, cursor: 'pointer' } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(15, 23, 42, 0.35)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        data-testid="reason-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) onConfirm(clean);
        }}
        style={{ width: 420, maxWidth: '100%', backgroundColor: color.bg.canvas, borderRadius: 6, boxShadow: '0 16px 40px rgba(15, 23, 42, 0.25)' }}
      >
        <p id={`${id}-title`} style={{ margin: 0, padding: '28px 28px 16px', fontSize: 18, fontWeight: 500, textAlign: 'center', lineHeight: 1.4 }}>
          {title}
        </p>
        <fieldset style={{ margin: '0 28px', padding: '0 12px 6px', border: `1px solid ${color.border.strong}`, borderRadius: 4 }}>
          <legend style={{ padding: '0 4px', fontSize: 12 }}>
            <label htmlFor={`${id}-reason`}>{tr('Enter reason')}</label>
          </legend>
          <textarea
            ref={box}
            id={`${id}-reason`}
            data-testid="reason"
            value={reason}
            maxLength={300}
            rows={4}
            placeholder={tr('enter')}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: 15, background: 'transparent' }}
          />
        </fieldset>
        <p style={{ margin: '6px 28px 0', fontSize: 12, color: color.text.secondary }}>{tr('At least 5 characters. Saved in the audit log.')}</p>
        {error ? (
          <p role="alert" style={{ margin: '8px 28px 0', fontSize: 13, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 14, padding: 16, marginTop: 16, borderTop: `1px solid ${color.border.subtle}` }}>
          <button type="button" data-testid="reason-cancel" onClick={onCancel} style={{ ...button, backgroundColor: color.bg.canvas, border: `1px solid ${color.text.primary}`, color: color.text.primary }}>
            {tr('No, Cancel')}
          </button>
          <button
            type="submit"
            data-testid="reason-confirm"
            disabled={!ok || busy}
            style={{ ...button, border: 'none', color: '#fff', backgroundColor: danger ? '#EF4444' : '#12B981', opacity: !ok || busy ? 0.55 : 1, cursor: !ok || busy ? 'not-allowed' : 'pointer' }}
          >
            {confirm}
          </button>
        </div>
      </form>
    </div>
  );
}
