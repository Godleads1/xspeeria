'use client';

/**
 * Operations alerts for Super Admins (ADR-074; owner 2026-11-01). Shown at the top of System
 * Health. Each alert says what happened in plain words, how urgent it is (P1 critical … P4
 * low), when it was first and last seen and how often. "I'm on it" acknowledges it; "Resolve"
 * needs a note saying what was found and done. What to do for each kind of alert is in the
 * incident plan (docs/07-security/INCIDENT_RESPONSE_PLAN.md).
 *
 * Display only: the server checks monitoring.read / monitoring.update on every call.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type OpsAlert, type OpsAlertRule, type OpsAlertSeverity, type OpsAlertStatus, type OpsAlertsPage } from '../../lib/api';
import { count } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color, space } from '../../theme';
import { Button, FormError } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { ReasonDialog } from '../ReasonDialog';
import { when } from './common';

export const ALERT_REFRESH_MS = 30_000;

/** What each rule means, with the alert's own figures ({{…}} come from its details). */
export const ALERT_TITLE: Record<OpsAlertRule, string> = {
  customer_sign_in_attack: '{{failures}} failed customer sign-ins in 15 minutes ({{accounts}} accounts)',
  staff_sign_in_attack: '{{failures}} failed staff sign-ins in 15 minutes',
  staff_access_changed: 'A staff account or role was changed ({{action}})',
  emergency_control_used: 'An emergency control was used ({{action}})',
  unusual_deal_volume: '{{last_hour}} deals in the last hour, against {{hourly_average}} an hour usually',
  money_at_risk: 'A deal needs money recovered ({{phase}})',
  high_fraud_alert: 'A high-severity fraud alert opened',
  webhook_rejected: '{{refused}} webhooks refused in 15 minutes (bad signature, too old or malformed)',
  webhook_failing: 'A webhook we receive failed {{failed}} times in 15 minutes',
  api_failing: 'Calls to {{subject}} are failing',
  outside_failing: '{{subject}} is failing',
  job_failing: 'The job "{{subject}}" is failing',
  escrow_stalled: 'Escrow processing has stopped or messages to the bank failed',
};
export const ALERT_SEVERITY: Record<OpsAlertSeverity, string> = {
  P1: 'P1 · Critical',
  P2: 'P2 · High',
  P3: 'P3 · Medium',
  P4: 'P4 · Low',
};
export const ALERT_STATUS: Record<OpsAlertStatus, string> = {
  open: 'New',
  acknowledged: 'Someone is on it',
  resolved: 'Resolved',
};
const SEVERITY_TONE: Record<OpsAlertSeverity, 'error' | 'warning' | 'neutral'> = {
  P1: 'error',
  P2: 'error',
  P3: 'warning',
  P4: 'neutral',
};

export function alertTitle(a: OpsAlert): string {
  const values: Record<string, string> = { subject: a.subject };
  for (const [k, v] of Object.entries(a.details)) values[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
  return tr(ALERT_TITLE[a.rule], values);
}

export function OpsAlertsPanel(): ReactElement | null {
  const { api, can } = useSession();
  const [page, setPage] = useState<OpsAlertsPage | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState<OpsAlert | null>(null);
  const allowed = can('monitoring.read');
  const mayAct = can('monitoring.update');

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      setPage(await api.opsAlerts(showAll ? 'all' : 'live'));
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, allowed, showAll]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), ALERT_REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const act = async (id: string, work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(id);
    setError(null);
    try {
      await work();
      await load();
      return true;
    } catch (e) {
      setError(messageFor(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!allowed) return null;
  const live = page ? page.live.P1 + page.live.P2 + page.live.P3 + page.live.P4 : 0;

  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>
          {tr('Alerts')} {page ? <span data-testid="alerts-live" style={{ fontWeight: 400, color: color.text.secondary }}>({count(live)})</span> : null}
        </h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <input type="checkbox" data-testid="alerts-show-all" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          {tr('Show resolved alerts')}
        </label>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
        {tr('Raised automatically and emailed to Super Admins once an email provider is set up. What to do: the incident plan.')}
      </p>
      <FormError message={error} />
      {page && page.items.length === 0 ? (
        <p data-testid="alerts-empty" style={{ margin: 0, color: color.success.text }}>
          {tr('No alerts. Everything the rules watch is normal.')}
        </p>
      ) : null}
      {page && page.items.length ? (
        <ul data-testid="alerts-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {page.items.map((a) => (
            <li
              key={a.id}
              data-testid={`alert-${a.id}`}
              style={{ border: `1px solid ${color.border.subtle}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusChip label={tr(ALERT_SEVERITY[a.severity])} tone={SEVERITY_TONE[a.severity]} />
                <StatusChip label={tr(ALERT_STATUS[a.status])} tone={a.status === 'resolved' ? 'success' : a.status === 'acknowledged' ? 'warning' : 'neutral'} />
                <span style={{ fontSize: 12, color: color.text.secondary }} dir="ltr">
                  {a.ref}
                </span>
              </div>
              <strong style={{ fontSize: 15 }}>{alertTitle(a)}</strong>
              <span style={{ fontSize: 13, color: color.text.secondary }}>
                {tr('First seen {{first}} · last seen {{last}} · {{n}} times', { first: when(a.first_seen_at), last: when(a.last_seen_at), n: count(a.occurrences) })}
              </span>
              {a.resolution_note ? <span style={{ fontSize: 13 }}>{tr('Resolved: {{note}}', { note: a.resolution_note })}</span> : null}
              {mayAct && a.status !== 'resolved' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {a.status === 'open' ? (
                    <Button variant="secondary" busy={busy === a.id} testId={`alert-ack-${a.id}`} onClick={() => void act(a.id, () => api.acknowledgeAlert(a.id))}>
                      {tr('I’m on it')}
                    </Button>
                  ) : null}
                  <Button variant="primary" testId={`alert-resolve-${a.id}`} onClick={() => setResolving(a)}>
                    {tr('Resolve')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {resolving ? (
        <ReasonDialog
          title={tr('Resolve alert')}
          description={tr('Say what you found and what you did. This is kept with the alert.')}
          confirm={tr('Resolve')}
          busy={busy === resolving.id}
          error={error}
          onCancel={() => setResolving(null)}
          onConfirm={(note) => void act(resolving.id, () => api.resolveAlert(resolving.id, note)).then((ok) => ok && setResolving(null))}
        />
      ) : null}
    </Panel>
  );
}
