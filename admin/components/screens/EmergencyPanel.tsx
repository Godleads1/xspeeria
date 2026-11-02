'use client';

/**
 * Emergency controls (SEC-039, ADR-075; owner 2026-11-02), at the top of System Health, for
 * Super Admins only:
 *
 * - **Pause all deals** ("freeze the clocks"): no new offers, takes or payout choices; bank
 *   commands are held; open windows get the paused time back on resume.
 * - **Sign everyone out**: customers, staff (except you), or both.
 *
 * Each needs a reason, is in the audit log and raises a P1 alert for the other Super Admins.
 * Display only: the server checks the Super Admin role on every call. What to do: the incident
 * plan (docs/07-security/INCIDENT_RESPONSE_PLAN.md).
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type DealPauseStatus, type SessionsWho } from '../../lib/api';
import { count } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color, space } from '../../theme';
import { Button, FormError } from '../forms';
import { Panel } from '../primitives';
import { ReasonDialog } from '../ReasonDialog';
import { when } from './common';

export const WHO_LABEL: Record<SessionsWho, string> = {
  customers: 'All customers',
  staff: 'All other staff',
  everyone: 'Everyone except me',
};

type Dialog = { kind: 'pause' } | { kind: 'resume' } | { kind: 'sessions'; who: SessionsWho } | null;

export function EmergencyPanel(): ReactElement | null {
  const { api, me } = useSession();
  const [status, setStatus] = useState<DealPauseStatus | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [who, setWho] = useState<SessionsWho>('customers');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const allowed = me.role === 'super_admin';

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      setStatus(await api.dealPauseStatus());
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) return null;

  const run = async (work: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setDone(await work());
      setDialog(null);
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const paused = status?.paused === true;
  const pause = status?.pause ?? null;

  return (
    <Panel>
      <h2 style={{ margin: 0, fontSize: 18 }}>{tr('Emergency controls')}</h2>
      <section
        data-testid="deals-state"
        role="status"
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          backgroundColor: paused ? color.error.surface : color.success.surface,
          color: paused ? color.error.text : color.success.text,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <strong>{paused ? tr('All deals are paused') : tr('Deals are running normally')}</strong>
        {paused && pause ? (
          <span style={{ fontSize: 13 }}>{tr('Since {{time}}. Reason: {{reason}}', { time: when(pause.started_at), reason: pause.reason })}</span>
        ) : null}
        {!paused && pause?.ended_at ? (
          <span style={{ fontSize: 13 }}>
            {tr('Last paused {{time}} for {{minutes}} min; {{n}} open windows got the time back.', {
              time: when(pause.started_at),
              minutes: count(Math.round((pause.details.paused_seconds ?? 0) / 60)),
              n: count((pause.details.payout_windows_extended ?? 0) + (pause.details.funding_windows_extended ?? 0) + (pause.details.queue_turns_extended ?? 0)),
            })}
          </span>
        ) : null}
      </section>
      <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
        {tr('Pausing stops new offers, takes and payout choices, and holds every command to the bank. Open payment and payout windows stop counting and get the paused time back when deals resume.')}
      </p>
      <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' }}>
        {paused ? (
          <Button variant="primary" testId="resume-deals" onClick={() => setDialog({ kind: 'resume' })}>
            {tr('Resume deals')}
          </Button>
        ) : (
          <Button variant="danger" testId="pause-deals" onClick={() => setDialog({ kind: 'pause' })}>
            {tr('Pause all deals')}
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          {tr('Sign out')}
          <select data-testid="sessions-who" value={who} onChange={(e) => setWho(e.target.value as SessionsWho)}>
            {(Object.keys(WHO_LABEL) as SessionsWho[]).map((w) => (
              <option key={w} value={w}>
                {tr(WHO_LABEL[w])}
              </option>
            ))}
          </select>
        </label>
        <Button variant="danger" testId="end-sessions" onClick={() => setDialog({ kind: 'sessions', who })}>
          {tr('Sign them out now')}
        </Button>
      </div>
      {done ? (
        <p role="status" data-testid="emergency-done" style={{ margin: 0, fontSize: 14 }}>
          {done}
        </p>
      ) : null}
      <FormError message={dialog ? null : error} />

      {dialog?.kind === 'pause' ? (
        <ReasonDialog
          title={tr('Pause all deals?')}
          description={tr('Customers can’t start or move deals until someone resumes them. Other Super Admins are alerted.')}
          confirm={tr('Pause all deals')}
          danger
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => void run(async () => {
            await api.pauseDeals(reason);
            return tr('All deals are paused.');
          })}
        />
      ) : null}
      {dialog?.kind === 'resume' ? (
        <ReasonDialog
          title={tr('Resume deals?')}
          description={tr('Open windows get the paused time back. Say why it is safe now.')}
          confirm={tr('Resume deals')}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => void run(async () => {
            await api.resumeDeals(reason);
            return tr('Deals have resumed.');
          })}
        />
      ) : null}
      {dialog?.kind === 'sessions' ? (
        <ReasonDialog
          title={tr('Sign out: {{who}}?', { who: tr(WHO_LABEL[dialog.who]) })}
          description={tr('They must sign in again with their PIN or password. Other Super Admins are alerted.')}
          confirm={tr('Sign them out now')}
          danger
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => void run(async () => {
            const r = await api.endSessions(dialog.who, reason);
            return tr('Signed out {{customers}} customer sessions and {{staff}} staff sessions.', { customers: count(r.customer_sessions), staff: count(r.staff_sessions) });
          })}
        />
      ) : null}
    </Panel>
  );
}
