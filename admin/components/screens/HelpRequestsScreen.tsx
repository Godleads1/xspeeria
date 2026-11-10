'use client';

/**
 * Help requests (ADR-103): people who cannot log in write through "Need help?" on the app's
 * log-in screen. Staff read the request, reply (the reply shows in the app on the phone that
 * sent it) and close it.
 *
 * Nothing proves who wrote the form. The approved procedure: never confirm that an account
 * exists, never share account details here, and send the person through the checks (face check,
 * identity check) rather than changing the account from this page. The account match is shown
 * only to help staff decide where to look.
 *
 * Buttons show only to staff whose role allows them (display only; the server checks again).
 */

import { useCallback, useEffect, useState, type CSSProperties, type ReactElement } from 'react';

import { messageFor, type HelpRequestDetail, type HelpRequestRow } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color, space } from '../../theme';
import { FormError, Notice, PageTitle } from '../forms';
import { EmptyState, ErrorState, LoadingState, StatusChip } from '../primitives';
import { when } from './common';

type Filter = 'open' | 'closed' | '';

export function HelpRequestsScreen(): ReactElement {
  const { api, can } = useSession();
  const [filter, setFilter] = useState<Filter>('open');
  const [rows, setRows] = useState<HelpRequestRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [detail, setDetail] = useState<HelpRequestDetail | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canWork = can('disputes.update');

  const loadList = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await api.helpRequests(filter || undefined));
    } catch (e) {
      setLoadError(messageFor(e));
    }
  }, [api, filter]);
  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setError(null);
    try {
      setDetail(await api.helpRequest(id));
    } catch (e) {
      setDetail(null);
      setError(messageFor(e));
    }
  }, [api]);
  useEffect(() => {
    if (picked) void loadDetail(picked);
  }, [picked, loadDetail]);

  const run = async (fn: () => Promise<void>, done: string): Promise<boolean> => {
    if (!detail) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await Promise.all([loadDetail(detail.request_id), loadList()]);
      return true;
    } catch (e) {
      setError(messageFor(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle crumb={tr('Help requests')}>{tr('Help requests')}</PageTitle>
      <p style={{ margin: 0, fontSize: 14, color: color.text.secondary }}>
        {tr('From people who cannot log in. Nothing proves who wrote these: never confirm an account or share its details here. Send the person through the face check or identity check instead.')}
      </p>
      <div style={{ display: 'flex', gap: space.sm }}>
        <label style={{ fontSize: 14 }}>
          {tr('Status')}{' '}
          <select data-testid="help-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={tool}>
            <option value="open">{tr('Open')}</option>
            <option value="closed">{tr('Closed')}</option>
            <option value="">{tr('All')}</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 2fr', gap: space.md, alignItems: 'start' }}>
        <section aria-label={tr('Help requests')} data-testid="help-list" style={box}>
          {loadError ? (
            <ErrorState title={loadError} onRetry={() => void loadList()} />
          ) : rows === null ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <EmptyState title={tr('No help requests.')} />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map((r) => (
                <li key={r.request_id}>
                  <button
                    type="button"
                    data-testid={`help-row-${r.request_id}`}
                    onClick={() => setPicked(r.request_id)}
                    aria-current={picked === r.request_id ? 'true' : undefined}
                    style={{ ...rowStyle, backgroundColor: picked === r.request_id ? color.bg.sunken : 'transparent' }}
                  >
                    <span dir="ltr" style={{ fontWeight: 600 }}>{r.phone}</span>
                    <span style={{ fontSize: 13, color: color.text.secondary }}>{r.email}</span>
                    <span style={{ fontSize: 12, color: color.text.secondary }}>
                      {when(r.last_message_at)} · {tr('{{n}} messages', { n: String(r.messages) })}
                    </span>
                    {r.status === 'closed' ? <StatusChip label={tr('Closed')} tone="neutral" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label={tr('Conversation')} data-testid="help-detail" style={{ ...box, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <FormError message={error} />
          <Notice message={notice} />
          {!detail ? (
            <p style={{ margin: 0, color: color.text.secondary }}>{tr('Pick a request to read it.')}</p>
          ) : (
            <>
              <div data-testid="help-match" style={{ fontSize: 13 }}>
                {detail.matched_user_id
                  ? detail.email_matches_account
                    ? tr('The phone and email both match an account.')
                    : tr('The phone matches an account, but the email does not.')
                  : tr('No account has this phone number.')}
                {detail.matched_user_id ? (
                  <a href={`/users/activity?id=${encodeURIComponent(detail.matched_user_id)}`} style={{ marginInlineStart: 6 }}>
                    {tr('Account activity')}
                  </a>
                ) : null}
              </div>
              {detail.thread.map((m) => (
                <div key={m.message_id} style={{ alignSelf: m.author === 'staff' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: 10, backgroundColor: m.author === 'staff' ? admin.bubbleStaff : admin.bubbleUser }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{m.author === 'staff' ? tr('Staff') : tr('Customer')}</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.body}</div>
                  <div style={{ fontSize: 11, color: color.text.secondary }}>{when(m.created_at)}</div>
                </div>
              ))}
              {detail.status === 'closed' ? (
                <p data-testid="help-closed" style={{ margin: 0, color: color.text.secondary }}>{tr('This request is closed.')}</p>
              ) : canWork ? (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = reply.trim();
                      if (!text) return;
                      void run(() => api.replyHelp(detail.request_id, text), tr('Reply sent')).then((ok) => ok && setReply(''));
                    }}
                    style={{ display: 'flex', gap: 8 }}
                  >
                    <textarea data-testid="help-reply" aria-label={tr('Reply to the customer')} placeholder={tr('Reply to the customer')} rows={2} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} style={{ flex: 1, fontFamily: 'inherit', fontSize: 14, padding: 8, borderRadius: 6, border: `1px solid ${color.border.strong}`, resize: 'vertical' }} />
                    <button type="submit" data-testid="help-send" disabled={busy || !reply.trim()} style={{ ...tool, backgroundColor: color.brand.fill, color: color.text.onFill, border: 'none', opacity: busy || !reply.trim() ? 0.55 : 1 }}>
                      {tr('Send')}
                    </button>
                  </form>
                  <button type="button" data-testid="help-close" disabled={busy} onClick={() => void run(() => api.closeHelp(detail.request_id), tr('Request closed'))} style={{ ...tool, alignSelf: 'flex-start' }}>
                    {tr('Close request')}
                  </button>
                  <p data-testid="help-delete-note" style={{ margin: 0, fontSize: 12, color: color.text.secondary }}>
                    {tr('A closed request is deleted after 12 hours, with its messages and contact details.')}
                  </p>
                </>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}

const box: CSSProperties = { border: `1px solid ${color.border.subtle}`, borderRadius: 14, overflow: 'hidden' };
const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  width: '100%',
  padding: '10px 14px',
  border: 'none',
  borderBottom: `1px solid ${color.border.subtle}`,
  fontFamily: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  color: 'inherit',
};
const tool: CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 6,
  border: `1px solid ${color.border.strong}`,
  backgroundColor: color.bg.canvas,
  fontFamily: 'inherit',
  fontSize: 14,
  cursor: 'pointer',
};
