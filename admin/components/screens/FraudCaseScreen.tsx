'use client';

/**
 * One fraud alert (ADR-068): what raised it, the customer, and the work on it (mark in progress,
 * resolve as confirmed or a false alarm, with a note). An alert never acts by itself; staff use
 * the screens that already exist (Users: suspend — Super Admin; a dispute: ask for a refund).
 */

import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { messageFor, type FraudAlert } from '../../lib/api';
import { count } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color } from '../../theme';
import { Icon } from '../icons';
import { ErrorState, LoadingState } from '../primitives';
import { Toast } from '../Toast';
import { FRAUD_RULE, FraudSeverityDot, FraudStatusChip } from './FraudScreen';
import { when } from './common';

export const RESOLUTION: Record<'confirmed' | 'false_alarm', string> = {
  confirmed: 'Confirmed fraud',
  false_alarm: 'False alarm',
};

/** What the rule found, in plain words (no account numbers beyond the last 4 digits). */
export function finding(a: FraudAlert): string {
  const d = a.details;
  switch (a.rule) {
    case 'pin_lockout':
      return tr('The app locked this account after 5 wrong PINs, until {{time}}.', { time: when(String(d.locked_until ?? '')) });
    case 'code_lockout':
      return tr('This account was locked after 5 wrong sign-in codes, until {{time}}.', { time: when(String(d.locked_until ?? '')) });
    case 'disputes_against':
      return tr('{{n}} disputes were raised against this person in the last {{days}} days.', { n: count(Number(d.disputes ?? 0)), days: count(Number(d.days ?? 30)) });
    case 'payout_name_mismatch':
      return tr('A payout account at {{bank}} ending {{last4}} is in a name that shares no word with the verified name.', { bank: String(d.bank ?? '—'), last4: String(d.last4 ?? '----') });
    default:
      return tr('Raised by a staff member.');
  }
}

export function FraudCaseScreen({ id }: { id: string }): ReactElement {
  const { api, can } = useSession();
  const [a, setA] = useState<FraudAlert | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setA(await api.fraudAlert(id));
    } catch (e) {
      setLoadError(messageFor(e));
    }
  }, [api, id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setToast(done);
      await load();
      return true;
    } catch (e) {
      setError(messageFor(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState title={loadError} onRetry={() => void load()} />;
  if (!a) return <LoadingState />;
  const open = a.status !== 'resolved';
  const mayWork = open && can('fraud_alerts.update');

  return (
    <>
      <nav aria-label={tr('Breadcrumb')} style={{ fontSize: 13, color: color.text.secondary }}>
        {tr('Home')} / {tr('Admin Panel')} / <a href="/fraud" style={{ color: color.brand.secondaryText }}>{tr('Fraud Management')}</a>
      </nav>
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 600 }}>{tr('Fraud Alert')}</h1>
      <section style={{ backgroundColor: color.bg.canvas, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <a href="/fraud" aria-label={tr('Back to the list')} style={{ color: color.text.secondary, display: 'inline-flex', transform: 'rotate(90deg)' }}>
            <Icon name="chevron" size={22} />
          </a>
          <span style={{ fontSize: 18 }}>
            {tr(FRAUD_RULE[a.rule])} <span dir="ltr" style={{ color: color.text.secondary, fontSize: 14 }}>· {a.ref}</span>
          </span>
          <FraudStatusChip status={a.status} />
          <FraudSeverityDot severity={a.severity} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
          <Card title={tr('What raised it')} testId="fraud-finding">
            <p data-testid="finding" style={{ margin: 0, fontSize: 15 }}>
              {finding(a)}
            </p>
            {a.rule === 'payout_name_mismatch' ? (
              <>
                <Field label={tr('Name on the payout account')} value={a.account_name ?? '—'} />
                <Field label={tr('Verified name')} value={a.verified_name ?? '—'} />
              </>
            ) : null}
            {a.note ? <Field label={tr('Staff note')} value={<span style={{ whiteSpace: 'pre-wrap' }}>{a.note}</span>} /> : null}
            {a.raised_by ? <Field label={tr('Raised by')} value={a.raised_by} /> : null}
            <Field label={tr('Date Raised')} value={when(a.created_at)} />
            {a.resolution ? (
              <>
                <Field label={tr('Outcome')} value={tr(RESOLUTION[a.resolution])} />
                <Field label={tr('Resolved by')} value={a.resolved_by ?? '—'} />
                {a.resolution_note ? <Field label={tr('Note')} value={a.resolution_note} /> : null}
              </>
            ) : null}
          </Card>
          <Card title={tr('Customer Details')} testId="fraud-customer-card">
            <Field label={tr('Customer Name')} value={a.customer} />
            <Field label={tr('Email Address')} value={a.customer_email} />
            <Field label={tr('Phone Number')} value={<span dir="ltr">{a.customer_phone ?? '—'}</span>} />
            <Field label={tr('Account')} value={a.customer_status === 'suspended' ? tr('Suspended') : a.customer_status === 'closed' ? tr('Closed') : tr('Active')} />
            {can('users.read') ? (
              <a href={`/users?q=${encodeURIComponent(a.customer_email)}`} style={{ color: color.brand.secondaryText, fontSize: 14 }}>
                {tr('Open in Users')}
              </a>
            ) : null}
            <p style={{ margin: 0, fontSize: 12, color: color.text.secondary }}>
              {tr('An alert never blocks anyone by itself. To stop this customer trading, a Super Admin suspends them in Users.')}
            </p>
          </Card>
        </div>
        {error && !resolving ? (
          <p role="alert" style={{ margin: 0, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        {mayWork ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, paddingTop: 16, borderTop: `1px solid ${color.border.subtle}`, flexWrap: 'wrap' }}>
            {a.status === 'open' ? (
              <button type="button" data-testid="fraud-start" disabled={busy} onClick={() => void run(() => api.startFraudAlert(a.id), tr('Status changed to In Progress'))} style={secondary}>
                {tr('Mark In Progress')}
              </button>
            ) : null}
            <button type="button" data-testid="fraud-resolve" onClick={() => setResolving(true)} style={primary}>
              {tr('Resolve')}
            </button>
          </div>
        ) : null}
      </section>
      {resolving ? (
        <ResolveDialog
          busy={busy}
          error={error}
          onCancel={() => {
            setResolving(false);
            setError(null);
          }}
          onConfirm={(resolution, note) =>
            void run(() => api.resolveFraudAlert(a.id, resolution, note), tr('Alert resolved')).then((ok) => ok && setResolving(false))
          }
        />
      ) : null}
      {toast ? <Toast key={toast + Date.now()} testId="fraud-toast" title={toast} message={tr('Saved in the audit log.')} autoHideMs={5000} /> : null}
    </>
  );
}

function ResolveDialog({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (resolution: 'confirmed' | 'false_alarm', note: string) => void;
}): ReactElement {
  const [resolution, setResolution] = useState<'confirmed' | 'false_alarm' | ''>('');
  const [note, setNote] = useState('');
  const ok = resolution !== '' && note.trim().length >= 3;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="fraud-resolve-title"
        data-testid="fraud-resolve-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && resolution) onConfirm(resolution, note.trim());
        }}
        style={{ width: 430, maxWidth: '100%', backgroundColor: color.bg.canvas, borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2 id="fraud-resolve-title" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
          {tr('Resolve alert')}
        </h2>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend style={{ fontSize: 13, marginBottom: 6 }}>{tr('Outcome')}</legend>
          {(Object.keys(RESOLUTION) as ('confirmed' | 'false_alarm')[]).map((k) => (
            <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="radio" name="resolution" data-testid={`resolution-${k}`} checked={resolution === k} onChange={() => setResolution(k)} />
              {tr(RESOLUTION[k])}
            </label>
          ))}
        </fieldset>
        <label style={{ fontSize: 13 }}>
          {tr('Note (saved in the audit log)')}
          <textarea data-testid="resolution-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, fontFamily: 'inherit', fontSize: 14, padding: 8, borderRadius: 6, border: `1px solid ${color.border.strong}`, backgroundColor: color.bg.canvas, color: color.text.primary }} />
        </label>
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" onClick={onCancel} style={secondary}>
            {tr('Cancel')}
          </button>
          <button type="submit" data-testid="resolution-save" disabled={!ok || busy} style={{ ...primary, opacity: !ok || busy ? 0.55 : 1 }}>
            {tr('Resolve')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Card({ title, testId, children }: { title: string; testId?: string; children: ReactNode }): ReactElement {
  return (
    <section data-testid={testId} aria-label={title} style={{ border: `1px solid ${color.border.subtle}`, borderRadius: 14, overflow: 'hidden' }}>
      <h2 style={{ margin: 0, padding: '10px 14px', fontSize: 15, fontWeight: 600, backgroundColor: color.bg.sunken }}>{title}</h2>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div>
      <div style={{ fontSize: 13, color: color.text.secondary }}>{label}</div>
      <div style={{ fontSize: 15 }}>{value}</div>
    </div>
  );
}

const secondary = {
  height: 44,
  padding: '0 18px',
  borderRadius: 8,
  border: `1px solid ${color.border.strong}`,
  backgroundColor: color.bg.canvas,
  color: color.text.primary,
  fontFamily: 'inherit',
  fontSize: 15,
  cursor: 'pointer',
} as const;
const primary = { ...secondary, border: 'none', backgroundColor: color.brand.fill, color: color.text.onFill } as const;
