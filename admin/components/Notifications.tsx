'use client';

/**
 * Figma top-bar bell and "Notification" side panel (ADR-070; owner 2026-10-27).
 *
 * The panel lists work waiting for the signed-in person (held identity checks, refunds waiting
 * for a second person, new fraud alerts, new disputes), read live from the server and limited
 * to what their role can act on. The red count is work that arrived since they last opened the
 * panel; opening it clears the count. It never shows a made-up number.
 *
 * The bell asks every minute and when the tab comes back into view. Those checks don't count
 * as activity on the server, so an idle session still ends after 15 minutes; when it has, the
 * page goes back to log-in.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

import { AdminApiError, type StaffWorkFeed, type StaffWorkKind } from '../lib/api';
import { tr } from '../lib/i18n';
import { admin, color } from '../theme';
import { Icon, type IconName } from './icons';
import { when } from './screens/common';

export const POLL_MS = 60_000;

export const WORK_LABEL: Record<StaffWorkKind, string> = {
  kyc_confirm: 'Identity check waiting for your confirmation',
  kyc_recommend: 'Identity check waiting for staff',
  reversal: 'Refund waiting for your approval',
  fraud: 'New fraud alert',
  dispute: 'New dispute or support case',
};
export const WORK_DETAIL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const WORK_ICON: Record<StaffWorkKind, IconName> = {
  kyc_confirm: 'kyc',
  kyc_recommend: 'kyc',
  reversal: 'reversals',
  fraud: 'fraud',
  dispute: 'disputes',
};
const WORK_PAGE: Record<StaffWorkKind, string> = {
  kyc_confirm: '/kyc/case',
  kyc_recommend: '/kyc/case',
  reversal: '/reversals/case',
  fraud: '/fraud/case',
  dispute: '/disputes/case',
};

export interface BellSource {
  load: () => Promise<StaffWorkFeed>;
  seen: () => Promise<void>;
  /** The session has ended (401): back to log-in. */
  onSignedOut?: () => void;
}

export function NotificationBell({ source }: { source?: BellSource }): ReactElement {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<StaffWorkFeed | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const bell = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!source) return;
    try {
      setFeed(await source.load());
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 401) source.onSignedOut?.();
      // Anything else: keep what we had and try again at the next check.
    }
  }, [source]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function openPanel(): void {
    setOpen(true);
    if (!source) return;
    void load();
    if (feed && feed.new > 0) {
      void source.seen().then(
        // The dots stay for this look; the count clears.
        () => setFeed((f) => (f ? { ...f, new: 0 } : f)),
        () => undefined,
      );
    }
  }

  function close(): void {
    setOpen(false);
    bell.current?.focus();
  }

  const count = feed?.new ?? 0;
  const items = feed?.items ?? [];
  return (
    <>
      <button
        ref={bell}
        type="button"
        data-testid="bell"
        aria-label={count > 0 ? tr('Notifications ({{n}} new)', { n: count }) : tr('Notifications')}
        aria-expanded={open}
        onClick={() => (open ? close() : openPanel())}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: color.brand.secondary, display: 'grid', placeItems: 'center' }}
      >
        <Icon name="bell" size={24} />
        {count > 0 ? (
          <span
            aria-hidden="true"
            data-testid="bell-count"
            style={{ position: 'absolute', top: 0, insetInlineEnd: 0, minWidth: 16, height: 16, padding: '0 3px', boxSizing: 'border-box', borderRadius: 8, backgroundColor: '#F93C65', color: '#FFFFFF', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div aria-hidden="true" onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 40, backgroundColor: admin.scrim }} />
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
              width: 360,
              maxWidth: '100vw',
              backgroundColor: color.bg.canvas,
              boxShadow: `0 0 32px ${admin.shadow}`,
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
            {items.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: color.text.disabled }}>
                <Icon name="bell" size={64} />
                <p style={{ margin: 0, fontSize: 12 }}>{tr('No notification')}</p>
              </div>
            ) : (
              <>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flex: 1 }}>
                  {items.map((i) => (
                    <li key={`${i.kind}-${i.id}`} style={{ borderBottom: `1px solid ${color.border.subtle}` }}>
                      <a
                        href={`${WORK_PAGE[i.kind]}?id=${encodeURIComponent(i.id)}`}
                        data-testid={`work-${i.kind}-${i.id}`}
                        style={{ display: 'flex', gap: 12, padding: '12px 14px', textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}
                      >
                        <span aria-hidden="true" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', backgroundColor: color.bg.sunken, color: color.brand.primary }}>
                          <Icon name={WORK_ICON[i.kind]} size={18} />
                        </span>
                        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: i.new ? 700 : 500, color: color.text.primary }}>
                            {tr(WORK_LABEL[i.kind])}
                            {i.detail && WORK_DETAIL[i.detail] ? ` · ${tr(WORK_DETAIL[i.detail])}` : ''}
                          </span>
                          <span style={{ fontSize: 12, color: color.text.secondary }}>
                            <span dir="ltr">{i.ref}</span> · {when(i.at)}
                          </span>
                        </span>
                        {i.new ? (
                          <span role="img" aria-label={tr('New')} style={{ flexShrink: 0, marginTop: 6, width: 8, height: 8, borderRadius: '50%', backgroundColor: '#F93C65' }} />
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
                {feed && feed.total > items.length ? (
                  <p style={{ margin: 0, padding: '10px 14px', fontSize: 12, color: color.text.secondary, borderTop: `1px solid ${color.border.subtle}` }}>
                    {tr('Showing the newest {{shown}} of {{total}}', { shown: items.length, total: feed.total })}
                  </p>
                ) : null}
              </>
            )}
          </aside>
        </>
      ) : null}
    </>
  );
}
