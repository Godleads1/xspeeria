'use client';

/**
 * System Health (ADR-072; owner 2026-10-27: "all api used should be monitored", "Super Admin see
 * it"). No Figma frame exists; it follows the dashboard's tiles and the admin tables.
 *
 * Shows, for the last hour, day or week:
 * - an overall status and warnings in plain words;
 * - every route of Xspeeria's own API and the webhooks we receive;
 * - every outside system Xspeeria calls (Didit, phone push, SMS, email, the bank);
 * - every background job (escrow, deal expiry, waiting queues, fraud scan, push, demo robots);
 * - the escrow work queues and the database;
 * - the operations alerts raised for Super Admins (ADR-074), at the top.
 *
 * Counts and timings only: nothing here names a customer. Refreshes every 30 seconds.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';

import { messageFor, type HealthApi as RawApi, type HealthJob as RawJob, type HealthStatus, type HealthWarning, type HealthWindow, type SystemHealth } from '../../lib/api';
import { count } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color, space } from '../../theme';
import { BarChart, Grid, StatTile } from '../dashboard/parts';
import { SearchBox } from '../FilterBar';
import { Button, FormError, PageTitle } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';
import { EmergencyPanel } from './EmergencyPanel';
import { OpsAlertsPanel } from './OpsAlertsPanel';

export const REFRESH_MS = 30_000;

/** The server's job names (app.main), translated for display. */
export const JOB_NAMES = ['Escrow processing', 'Deal expiry', 'Waiting queues', 'Fraud scan', 'Phone push', 'Demo robots', 'Alert rules'] as const;

export const WINDOW_LABEL: Record<HealthWindow, string> = {
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
};
export const STATUS_TEXT: Record<HealthStatus, string> = {
  ok: 'Everything is working',
  warning: 'Some things need a look',
  problem: 'Something is not working',
};
type HealthApi = RawApi & { id: string };
type HealthJob = RawJob & { id: string };
const withId = (kind: string, rows: RawApi[]): HealthApi[] => rows.map((a) => ({ ...a, id: `${kind}:${a.method}:${a.name}` }));

export const JOB_STATE: Record<RawJob['state'], string> = {
  ok: 'Working',
  late: 'Late',
  failing: 'Failing',
};
export const WARNING_TEXT: Record<HealthWarning['code'], string> = {
  outside_failing: '{{name}} failed {{value}} times',
  server_errors: '{{name}}: {{value}} of calls failed',
  some_errors: '{{name}}: {{value}} failed calls',
  slow: '{{name}} is slow ({{value}} ms on average)',
  job_failed: 'The job "{{name}}" failed last time ({{value}})',
  job_late: 'The job "{{name}}" has not worked for a while',
  escrow_messages_failed: '{{value}} escrow messages to the bank failed',
  reconciliation_open: '{{value}} bank records don’t match ours and wait for a person',
  database_slow: 'The database is slow to answer ({{value}} ms)',
};

const STATUS_TONE: Record<HealthStatus, { bg: string; fg: string }> = {
  ok: { bg: color.success.surface, fg: color.success.text },
  warning: { bg: color.warning.surface, fg: color.warning.text },
  problem: { bg: color.error.surface, fg: color.error.text },
};

function pct(rate: number): string {
  return `${(rate * 100).toFixed(rate > 0 && rate < 0.001 ? 2 : 1)}%`;
}

export function warningText(w: HealthWarning): string {
  const value = w.code === 'server_errors' && typeof w.value === 'number' ? pct(w.value) : String(w.value ?? '');
  return tr(WARNING_TEXT[w.code], { name: w.name ?? '', value });
}

function since(iso: string, now: string): string {
  const s = Math.max(0, Math.round((Date.parse(now) - Date.parse(iso)) / 1000));
  if (s < 3600) return tr('{{n}} min', { n: Math.max(1, Math.round(s / 60)) });
  if (s < 86_400) return tr('{{n}} h', { n: Math.round(s / 3600) });
  return tr('{{n}} days', { n: Math.round(s / 86_400) });
}

function errors(a: HealthApi): string {
  const failed = a.server_errors + a.network_errors;
  return failed ? `${count(failed)} (${pct(a.error_rate)})` : '0';
}

export function SystemHealthScreen(): ReactElement {
  const { api } = useSession();
  const [win, setWin] = useState<HealthWindow>('1h');
  const [data, setData] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await api.systemHealth(win));
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }, [api, win]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const own = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = data ? [...withId('own', data.apis.own), ...withId('webhook', data.apis.webhook)] : [];
    return q ? rows.filter((a) => a.name.toLowerCase().includes(q)) : rows;
  }, [data, search]);

  const apiColumns: readonly Column<HealthApi>[] = [
    {
      key: 'name',
      header: tr('API'),
      render: (a) => (
        <span dir="ltr" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>
          <strong>{a.method}</strong> {a.name}
        </span>
      ),
    },
    { key: 'calls', header: tr('Calls'), numeric: true, render: (a) => count(a.calls) },
    { key: 'errors', header: tr('Failed'), numeric: true, render: (a) => <span style={{ color: a.server_errors + a.network_errors ? color.error.text : undefined }}>{errors(a)}</span> },
    { key: 'client', header: tr('Refused (4xx)'), numeric: true, render: (a) => count(a.client_errors) },
    { key: 'avg', header: tr('Average'), numeric: true, render: (a) => `${count(a.avg_ms)} ms` },
    { key: 'max', header: tr('Slowest'), numeric: true, render: (a) => `${count(a.max_ms)} ms` },
    { key: 'last', header: tr('Last call'), render: (a) => when(a.last_call_at) },
  ];
  const outsideColumns: readonly Column<HealthApi>[] = [
    {
      key: 'service',
      header: tr('Service'),
      render: (a) => {
        const [service, ...rest] = a.name.split(': ');
        return (
          <span>
            <strong>{service}</strong>
            <span dir="ltr" style={{ display: 'block', fontSize: 12, color: color.text.secondary, fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {a.method === 'CALL' ? rest.join(': ') : `${a.method} ${rest.join(': ')}`}
            </span>
          </span>
        );
      },
    },
    { key: 'calls', header: tr('Calls'), numeric: true, render: (a) => count(a.calls) },
    { key: 'errors', header: tr('Failed'), numeric: true, render: (a) => <span style={{ color: a.server_errors + a.network_errors ? color.error.text : undefined }}>{errors(a)}</span> },
    { key: 'noanswer', header: tr('No answer'), numeric: true, render: (a) => count(a.network_errors) },
    { key: 'avg', header: tr('Average'), numeric: true, render: (a) => `${count(a.avg_ms)} ms` },
    { key: 'max', header: tr('Slowest'), numeric: true, render: (a) => `${count(a.max_ms)} ms` },
    { key: 'last', header: tr('Last call'), render: (a) => when(a.last_call_at) },
  ];
  const jobColumns: readonly Column<HealthJob>[] = [
    { key: 'name', header: tr('Job'), render: (j) => <strong>{tr(j.name)}</strong> },
    { key: 'every', header: tr('Runs every'), render: (j) => tr('{{n}} s', { n: j.every_seconds }) },
    {
      key: 'state',
      header: tr('Status'),
      render: (j) => <StatusChip label={tr(JOB_STATE[j.state])} tone={j.state === 'ok' ? 'success' : j.state === 'late' ? 'warning' : 'error'} />,
    },
    { key: 'ok', header: tr('Last worked'), render: (j) => when(j.last_ok_at) },
    { key: 'failed', header: tr('Last failed'), render: (j) => (j.last_failed_at ? `${when(j.last_failed_at)} · ${j.last_error ?? ''}` : '—') },
    { key: 'took', header: tr('Took'), numeric: true, render: (j) => (j.last_duration_ms === null ? '—' : `${count(j.last_duration_ms)} ms`) },
    { key: 'runs', header: tr('Runs / failures'), numeric: true, render: (j) => `${count(j.runs)} / ${count(j.failures)}` },
  ];

  const tone = data ? STATUS_TONE[data.status] : null;
  const labels = data ? data.series.map((p) => new Date(p.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(win === '7d' ? { day: '2-digit', month: 'short' } : {}) })) : [];

  return (
    <>
      <PageTitle crumb={tr('System Health')}>{tr('System Health')}</PageTitle>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label={tr('Period')} style={{ display: 'flex', gap: 22, borderBottom: `1px solid ${color.border.subtle}` }}>
          {(Object.keys(WINDOW_LABEL) as HealthWindow[]).map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={win === w}
              data-testid={`window-${w}`}
              onClick={() => setWin(w)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${win === w ? color.brand.primary : 'transparent'}`,
                marginBottom: -1,
                padding: '10px 0',
                fontFamily: 'inherit',
                fontSize: 15,
                fontWeight: win === w ? 600 : 400,
                cursor: 'pointer',
                color: win === w ? color.brand.primary : color.text.secondary,
              }}
            >
              {tr(WINDOW_LABEL[w])}
            </button>
          ))}
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: color.text.secondary }}>
          {data ? tr('Updated {{time}} · refreshes every 30 seconds', { time: new Date(data.now).toLocaleTimeString() }) : null}
          <Button variant="secondary" busy={busy} testId="health-refresh" onClick={() => void load()}>
            {tr('Refresh')}
          </Button>
        </span>
      </div>
      <FormError message={error} />
      <EmergencyPanel />
      <OpsAlertsPanel />

      {data && tone ? (
        <>
          <section data-testid="health-status" role="status" style={{ padding: '14px 18px', borderRadius: 12, backgroundColor: tone.bg, color: tone.fg, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <strong style={{ fontSize: 17 }}>{tr(STATUS_TEXT[data.status])}</strong>
            {data.warnings.length ? (
              <ul data-testid="health-warnings" style={{ margin: 0, paddingInlineStart: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {data.warnings.map((w, i) => (
                  <li key={`${w.code}-${w.name ?? ''}-${i}`} style={{ color: w.level === 'red' ? color.error.text : color.warning.text }}>
                    {warningText(w)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <Grid>
            <StatTile testId="health-calls" label={tr('API calls')} value={count(data.totals.calls)} tint="blue">
              <span style={{ fontSize: 13 }}>{tr(WINDOW_LABEL[data.window])}</span>
            </StatTile>
            <StatTile testId="health-errors" label={tr('Failed calls')} value={count(data.totals.errors)} tint={data.totals.errors ? 'orange' : 'green'}>
              <span style={{ fontSize: 13 }}>{tr('{{rate}} of calls', { rate: pct(data.totals.error_rate) })}</span>
            </StatTile>
            <StatTile testId="health-speed" label={tr('Average response')} value={`${count(data.totals.avg_ms)} ms`} tint="grey" />
            <StatTile testId="health-db" label={tr('Database')} value={data.database.ok ? tr('Connected') : tr('Not answering')} tint={data.database.ok ? 'green' : 'orange'}>
              <span style={{ fontSize: 13 }}>{tr('Answers in {{ms}} ms', { ms: data.database.ping_ms })}</span>
            </StatTile>
            <StatTile testId="health-uptime" label={tr('Server running for')} value={since(data.server_started_at, data.now)} tint="blue">
              <span style={{ fontSize: 13 }} dir="ltr">
                {data.environment} · {data.api_version}
              </span>
            </StatTile>
          </Grid>

          <Panel>
            <BarChart
              testId="health-chart"
              title={tr('Calls and failures')}
              labels={labels}
              series={[
                { name: tr('Calls'), values: data.series.map((p) => p.calls) },
                { name: tr('Failed'), values: data.series.map((p) => p.errors) },
              ]}
            />
          </Panel>

          <Panel>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{tr('Xspeeria API')}</h2>
              <SearchBox value={search} onChange={setSearch} placeholder={tr('Search an API')} testId="health-search" />
            </div>
            <DataTable caption={tr('Xspeeria API')} hideCaption columns={apiColumns} rows={own} status="ready" emptyTitle={tr('No calls in this period')} />
          </Panel>

          <Panel>
            <h2 style={{ margin: 0, fontSize: 18 }}>{tr('Outside services')}</h2>
            <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>{tr('Every call Xspeeria makes to another system: Didit, phone push, SMS, email and the bank.')}</p>
            <DataTable caption={tr('Outside services')} hideCaption columns={outsideColumns} rows={withId('outside', data.apis.outside)} status="ready" emptyTitle={tr('No calls to outside services in this period')} />
          </Panel>

          <Panel>
            <h2 style={{ margin: 0, fontSize: 18 }}>{tr('Background jobs')}</h2>
            <DataTable caption={tr('Background jobs')} hideCaption columns={jobColumns} rows={data.jobs.map((j) => ({ ...j, id: j.name }))} status="ready" emptyTitle={tr('No job has run yet')} />
          </Panel>

          <Panel>
            <h2 style={{ margin: 0, fontSize: 18 }}>{tr('Escrow work queues')}</h2>
            <Grid min={180}>
              <StatTile testId="queue-waiting" label={tr('Messages to the bank waiting')} value={count(data.queues.escrow_messages_waiting)} tint="grey" />
              <StatTile testId="queue-failed" label={tr('Messages to the bank failed')} value={count(data.queues.escrow_messages_failed)} tint={data.queues.escrow_messages_failed ? 'orange' : 'green'} />
              <StatTile testId="queue-bank" label={tr('Bank events waiting')} value={count(data.queues.bank_events_waiting)} tint="grey" />
              <StatTile testId="queue-recon" label={tr('Records that don’t match')} value={count(data.queues.reconciliation_open)} tint={data.queues.reconciliation_open ? 'orange' : 'green'} />
            </Grid>
          </Panel>
        </>
      ) : !error ? (
        <p role="status">{tr('Loading…')}</p>
      ) : null}
    </>
  );
}
