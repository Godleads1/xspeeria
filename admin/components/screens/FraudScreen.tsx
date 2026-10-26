'use client';

/**
 * Figma "Fraud Management" (ADR-068; owner 2026-10-26: "Simple rules + staff flag").
 *
 * Alerts come from a few simple rules over data Xspeeria already has, or from a staff member.
 * Columns follow Figma: Alert ID, User, Type, Severity, Date Raised, Status. Figma's sample
 * types ("Card Skimming", "Phishing Scam", "Synthetic ID") are not things Xspeeria can detect,
 * so the types are the rules we actually run. An alert never blocks anything by itself.
 * Display only — the server checks every permission.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type Customer, type FraudAlertRow, type FraudPage, type FraudRule, type FraudSeverity, type FraudStats, type FraudStatus } from '../../lib/api';
import { count } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color, space } from '../../theme';
import { Grid, StatTile } from '../dashboard/parts';
import { BarSelect, FilterBar, SearchBox } from '../FilterBar';
import { Button, FormError, Notice, PageTitle, Select } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';

const PAGE = 50;

export const FRAUD_RULE: Record<FraudRule, string> = {
  pin_lockout: 'Locked out: too many wrong PINs',
  code_lockout: 'Locked out: too many wrong sign-in codes',
  disputes_against: 'Many disputes against this person',
  payout_name_mismatch: 'Payout account in another name',
  staff_report: 'Reported by staff',
};
export const FRAUD_STATUS: Record<FraudStatus, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
export const FRAUD_SEVERITY: Record<FraudSeverity, string> = { low: 'Low', medium: 'Medium', high: 'High' };

const DOT: Record<FraudSeverity, string> = { low: admin.up, medium: admin.amber, high: admin.down };

export function FraudSeverityDot({ severity }: { severity: FraudSeverity }): ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: DOT[severity] }} />
      {tr(FRAUD_SEVERITY[severity])}
    </span>
  );
}

export function FraudStatusChip({ status }: { status: FraudStatus }): ReactElement {
  const tone = status === 'resolved' ? 'success' : status === 'in_progress' ? 'warning' : 'error';
  return <StatusChip label={tr(FRAUD_STATUS[status])} tone={tone} />;
}

export function FraudScreen(): ReactElement {
  const { api, can } = useSession();
  const [page, setPage] = useState<FraudPage | null>(null);
  const [stats, setStats] = useState<FraudStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | FraudStatus>('');
  const [rule, setRule] = useState<'' | FraudRule>('');
  const [offset, setOffset] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s] = await Promise.all([
        api.listFraudAlerts({ search: query || undefined, status: status || undefined, rule: rule || undefined, offset, limit: PAGE }),
        api.fraudStats(),
      ]);
      setPage(p);
      setStats(s);
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, query, status, rule, offset]);
  useEffect(() => {
    void load();
  }, [load]);

  const columns: readonly Column<FraudAlertRow>[] = [
    {
      key: 'ref',
      header: tr('Alert ID'),
      render: (a) => (
        <a href={`/fraud/case?id=${encodeURIComponent(a.id)}`} data-testid={`open-${a.id}`} dir="ltr" style={{ color: 'inherit', fontWeight: 600 }}>
          {a.ref}
        </a>
      ),
    },
    { key: 'user', header: tr('User'), render: (a) => a.customer },
    { key: 'type', header: tr('Type'), render: (a) => tr(FRAUD_RULE[a.rule]) },
    { key: 'severity', header: tr('Severity'), render: (a) => <FraudSeverityDot severity={a.severity} /> },
    { key: 'date', header: tr('Date Raised'), render: (a) => when(a.created_at) },
    { key: 'status', header: tr('Status'), render: (a) => <FraudStatusChip status={a.status} /> },
  ];

  const total = page?.total ?? 0;
  return (
    <>
      <PageTitle
        crumb={tr('Fraud Management')}
        action={
          can('fraud_alerts.create') ? (
            <Button testId="report-fraud" onClick={() => setReporting(true)}>
              {tr('Report suspected fraud')}
            </Button>
          ) : undefined
        }
      >
        {tr('Fraud Management')}
      </PageTitle>
      <Grid>
        <StatTile testId="fraud-open" label={tr('Open alerts')} value={stats ? count(stats.open) : '—'} tint="orange" />
        <StatTile testId="fraud-high" label={tr('High risk, not resolved')} value={stats ? count(stats.high_open) : '—'} tint="orange" />
        <StatTile testId="fraud-progress" label={tr('In Progress')} value={stats ? count(stats.in_progress) : '—'} tint="blue" />
        <StatTile testId="fraud-resolved" label={tr('Resolved')} value={stats ? count(stats.resolved) : '—'} tint="green" />
      </Grid>
      <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
        {tr('Alerts come from simple checks on Xspeeria’s own records, or from staff. An alert never blocks a customer or a deal by itself.')}
      </p>
      <FormError message={error && page ? error : null} />
      <Notice message={notice} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder={tr('Search name, email or alert ID')} testId="fraud-search" />
        <FilterBar
          onReset={
            search || status || rule
              ? () => {
                  setSearch('');
                  setStatus('');
                  setRule('');
                  setOffset(0);
                }
              : undefined
          }
        >
          <BarSelect
            label={tr('Type')}
            value={rule}
            onChange={(v) => {
              setRule(v as '' | FraudRule);
              setOffset(0);
            }}
            testId="fraud-rule"
            options={[{ value: '', label: tr('Type') }, ...(Object.keys(FRAUD_RULE) as FraudRule[]).map((k) => ({ value: k, label: tr(FRAUD_RULE[k]) }))]}
          />
          <BarSelect
            label={tr('Status')}
            value={status}
            onChange={(v) => {
              setStatus(v as '' | FraudStatus);
              setOffset(0);
            }}
            testId="fraud-status"
            options={[{ value: '', label: tr('Status') }, ...(Object.keys(FRAUD_STATUS) as FraudStatus[]).map((k) => ({ value: k, label: tr(FRAUD_STATUS[k]) }))]}
          />
        </FilterBar>
      </div>
      <Panel>
        <DataTable
          caption={tr('Fraud Management')}
          hideCaption
          columns={columns}
          rows={page?.items ?? []}
          status={error && !page ? 'error' : page === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={query || status || rule ? tr('No alerts match your search') : tr('No fraud alerts')}
        />
        {total > PAGE ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13 }}>
              {tr('{{from}}–{{to}} of {{total}}', { from: count(offset + 1), to: count(Math.min(offset + PAGE, total)), total: count(total) })}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                {tr('Previous')}
              </Button>
              <Button variant="secondary" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
                {tr('Next')}
              </Button>
            </span>
          </div>
        ) : null}
      </Panel>
      {reporting ? (
        <ReportDialog
          onCancel={() => setReporting(false)}
          onDone={(ref) => {
            setReporting(false);
            setNotice(tr('Alert {{ref}} raised', { ref }));
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function ReportDialog({ onCancel, onDone }: { onCancel: () => void; onDone: (ref: string) => void }): ReactElement {
  const { api } = useSession();
  const [who, setWho] = useState('');
  const [found, setFound] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [severity, setSeverity] = useState<FraudSeverity>('medium');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = who.trim();
    if (customer || q.length < 2) {
      setFound([]);
      return;
    }
    const t = setTimeout(() => {
      api.listCustomers({ search: q, limit: 5 }).then(
        (p) => setFound(p.items),
        (e: unknown) => setError(messageFor(e)),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [api, who, customer]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const ok = customer !== null && note.trim().length >= 5;
  const box = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, fontFamily: 'inherit', fontSize: 14, padding: 8, borderRadius: 6, border: `1px solid ${color.border.strong}`, backgroundColor: color.bg.canvas, color: color.text.primary } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="fraud-report-title"
        data-testid="fraud-report-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok || !customer || busy) return;
          setBusy(true);
          setError(null);
          api.reportFraud({ user_id: customer.id, severity, note: note.trim() }).then(
            (r) => onDone(r.ref),
            (err: unknown) => {
              setError(messageFor(err));
              setBusy(false);
            },
          );
        }}
        style={{ width: 480, maxWidth: '100%', backgroundColor: color.bg.canvas, borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <h2 id="fraud-report-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {tr('Report suspected fraud')}
        </h2>
        <label style={{ fontSize: 13 }}>
          {tr('Customer')}
          {customer ? (
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, padding: 8, borderRadius: 6, backgroundColor: color.bg.sunken }}>
              <span data-testid="fraud-customer">{customer.name ?? customer.email}</span>
              <button type="button" onClick={() => setCustomer(null)} style={{ border: 'none', background: 'none', color: color.brand.secondaryText, cursor: 'pointer', fontFamily: 'inherit' }}>
                {tr('Change')}
              </button>
            </span>
          ) : (
            <input data-testid="fraud-customer-search" value={who} placeholder={tr('Search name, email or phone')} onChange={(e) => setWho(e.target.value)} style={{ ...box, height: 40 }} />
          )}
        </label>
        {!customer && found.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: '-8px 0 0', padding: 0, border: `1px solid ${color.border.subtle}`, borderRadius: 6 }}>
            {found.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  data-testid={`pick-${c.id}`}
                  onClick={() => setCustomer(c)}
                  style={{ width: '100%', textAlign: 'start', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: color.text.primary }}
                >
                  {c.name ?? c.email} <span style={{ color: color.text.secondary, fontSize: 12 }}>{c.email}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Select label={tr('Severity')} value={severity} onChange={(v) => setSeverity(v as FraudSeverity)} testId="fraud-severity" options={(Object.keys(FRAUD_SEVERITY) as FraudSeverity[]).map((k) => ({ value: k, label: tr(FRAUD_SEVERITY[k]) }))} />
        <label style={{ fontSize: 13 }}>
          {tr('What happened')}
          <textarea data-testid="fraud-note" rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...box, resize: 'vertical' }} />
          <span style={{ fontSize: 12, color: color.text.secondary }}>{tr('At least 5 characters. Saved in the audit log.')}</span>
        </label>
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button variant="secondary" onClick={onCancel}>
            {tr('Cancel')}
          </Button>
          <Button type="submit" testId="fraud-report-save" disabled={!ok} busy={busy}>
            {tr('Raise alert')}
          </Button>
        </div>
      </form>
    </div>
  );
}
