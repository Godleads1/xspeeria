'use client';

/**
 * Figma top-bar bell and "Notification" side panel.
 *
 * Staff notifications (new disputes, fraud alerts, reversal approvals) come with the A-3
 * screens; until then the panel shows the Figma empty state and the bell carries no count.
 * It never shows a made-up number.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';

import { tr } from '../lib/i18n';
import { color } from '../theme';
import { Icon } from './icons';

export function NotificationBell({ count = 0 }: { count?: number }): ReactElement {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const bell = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function close(): void {
    setOpen(false);
    bell.current?.focus();
  }

  return (
    <>
      <button
        ref={bell}
        type="button"
        data-testid="bell"
        aria-label={count > 0 ? tr('Notifications ({{n}} new)', { n: count }) : tr('Notifications')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: color.brand.secondary, display: 'grid', placeItems: 'center' }}
      >
        <Icon name="bell" size={24} />
        {count > 0 ? (
          <span
            aria-hidden="true"
            style={{ position: 'absolute', top: 0, insetInlineEnd: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#F93C65', color: '#fff', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div aria-hidden="true" onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 40, backgroundColor: 'rgba(15, 23, 42, 0.12)' }} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="notifications-title"
            data-testid="notifications"
            style={{
              position: 'fixed',
              top: 0,
              bottom: 0,
              insetInlineEnd: 0,
              zIndex: 41,
              width: 340,
              maxWidth: '100vw',
              backgroundColor: color.bg.canvas,
              boxShadow: '0 0 32px rgba(15, 23, 42, 0.18)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 10px', borderBottom: `1px solid ${color.border.subtle}` }}>
              <h2 id="notifications-title" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
                {tr('Notification')}
              </h2>
              <button
                ref={closeButton}
                type="button"
                aria-label={tr('Close')}
                onClick={close}
                style={{ width: 24, height: 24, borderRadius: '50%', border: `1px solid ${color.text.secondary}`, background: 'none', cursor: 'pointer', color: color.text.secondary, display: 'grid', placeItems: 'center', padding: 0 }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#B0B3BC' }}>
              <Icon name="bell" size={64} />
              <p style={{ margin: 0, fontSize: 12 }}>{tr('No notification')}</p>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
