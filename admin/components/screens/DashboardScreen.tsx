'use client';

/**
 * Analytics Dashboard (Figma "Analytics Dashboard", ADR-061).
 *
 * Owner decisions 2026-10-26: real numbers only (tiles with no source in the platform are left
 * out, never filled with samples); Cards tab hidden (ADR-051); Adverts tab comes with advert
 * upload later (ADR-056). Escrow is shown only as a record of customer money waiting at
 * partner banks, not as revenue (ADR-051 decision 3). Corridors are NG⇄GB and NG⇄US.
 *
 * Display only: the server checks `dashboard.read` and computes every figure.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import type { Dashboard, DashboardPeriod } from '../../lib/api';
import { messageFor } from '../../lib/api';
import { change, count, duration, money, moneyChange, share } from '../../lib/figures';
import { language, tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { BarChart, card, Grid, ShareBar, StatTile, Trend } from '../dashboard/parts';
import { Icon } from '../icons';
import { ErrorState, LoadingState } from '../primitives';

const TABS = ['overview', 'customers', 'transactions', 'revenue', 'corridors', 'operations'] as const;
type Tab = (typeof TABS)[number];
export const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  customers: 'Customers',
  transactions: 'Transactions',
  revenue: 'Revenue',
  corridors: 'Corridors',
  operations: 'Operations',
};

/** Lagos is UTC+1 all year (no daylight saving), so bucket keys can be made by adding an hour. */
const LAGOS_MS = 3600_000;

export function bucketKeys(start: string, end: string, bucket: 'hour' | 'day' | 'month'): string[] {
  const keys: string[] = [];
  const d = new Date(Date.parse(start) + LAGOS_MS);
  const stop = Date.parse(end) + LAGOS_MS;
  for (let guard = 0; d.getTime() < stop && guard < 400; guard += 1) {
    const iso = d.toISOString();
    keys.push(bucket === 'hour' ? iso.slice(0, 13) : bucket === 'day' ? iso.slice(0, 10) : iso.slice(0, 7));
    if (bucket === 'hour') d.setUTCHours(d.getUTCHours() + 1);
    else if (bucket === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1, 1);
  }
  return keys;
}

function keyOf(at: string, bucket: 'hour' | 'day' | 'month'): string {
  return bucket === 'hour' ? at.slice(0, 13) : bucket === 'day' ? at.slice(0, 10) : at.slice(0, 7);
}

function bucketLabel(key: string, bucket: 'hour' | 'day' | 'month'): string {
  if (bucket === 'hour') return `${key.slice(11, 13)}:00`;
  if (bucket === 'day') return key.slice(8, 10);
  return new Intl.DateTimeFormat(language.get(), { month: 'short', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
}

function thisMonth(): string {
  return new Date(Date.now() + LAGOS_MS).toISOString().slice(0, 7);
}

/** CSV cell: quoted, and never read as a formula by a spreadsheet. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function dashboardCsv(d: Dashboard): string {
  const rows: (string | number)[][] = [[tr('Figure'), tr('This period'), tr('Period before')]];
  const o = d.overview;
  rows.push([tr('Active Users'), o.active_users.value, o.active_users.previous]);
  rows.push([tr('New Users Onboarded'), o.new_users.value, o.new_users.previous]);
  rows.push([tr('Trades started'), o.trades_started.value, o.trades_started.previous]);
  rows.push([tr('Trades completed'), o.trades_completed.value, o.trades_completed.previous]);
  for (const m of o.value) rows.push([`${tr('Transaction Value')} ${m.currency}`, money(m), money({ ...m, minor: m.previous_minor ?? '0' })]);
  for (const m of o.fees) rows.push([`${tr('Fees earned')} ${m.currency}`, money(m), money({ ...m, minor: m.previous_minor ?? '0' })]);
  rows.push([tr('Avg Settlement Time'), duration(o.avg_settlement_seconds) ?? '', '']);
  rows.push([tr('Open disputes'), o.open_disputes, '']);
  rows.push([tr('Waiting for identity check'), o.kyc_waiting, '']);
  for (const c of d.corridors) rows.push([`${tr('Corridor')} ${c.pair.join(' ⇄ ')}`, c.trades, c.previous_trades]);
  rows.push([tr('Disputes opened'), d.operations.disputes_opened.value, d.operations.disputes_opened.previous]);
  rows.push([tr('Disputes resolved'), d.operations.disputes_resolved.value, d.operations.disputes_resolved.previous]);
  return `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function DashboardScreen(): ReactElement {
  const { api } = useSession();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [month, setMonth] = useState(thisMonth());
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.dashboard(period, period === 'custom' ? month : undefined));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, period, month]);
  useEffect(() => {
    void load();
  }, [load]);

  const before =
    period === 'today' ? tr('yesterday') : period === 'year' ? tr('last year') : tr('last month');

  function download(): void {
    if (!data) return;
    const blob = new Blob([`﻿${dashboardCsv(data)}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `xspeeria-dashboard-${period === 'custom' ? month : period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExportOpen(false);
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>{tr('Analytics Dashboard')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: color.text.secondary }}>{tr('Figures from Xspeeria’s own records, in Lagos time')}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex' }}>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{tr('Period')}</span>
            <select data-testid="period" value={period} onChange={(e) => setPeriod(e.target.value as DashboardPeriod)} style={control}>
              <option value="today">{tr('Today')}</option>
              <option value="month">{tr('This Month')}</option>
              <option value="year">{tr('Year To Date')}</option>
              <option value="custom">{tr('Choose a month')}</option>
            </select>
          </label>
          {period === 'custom' ? (
            <label style={{ display: 'inline-flex' }}>
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{tr('Month')}</span>
              <input data-testid="month" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} style={control} />
            </label>
          ) : null}
          <div style={{ position: 'relative' }}>
            <button type="button" data-testid="export" aria-haspopup="menu" aria-expanded={exportOpen} disabled={!data} onClick={() => setExportOpen((o) => !o)} style={exportButton}>
              {tr('Export')} <Icon name="chevron" size={16} />
            </button>
            {exportOpen ? (
              <div role="menu" style={{ position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + 6px)', zIndex: 20, minWidth: 180, ...card, padding: 6 }}>
                <p style={{ margin: '6px 10px', fontSize: 12, color: color.text.secondary }}>{tr('CHOOSE FILE TYPE')}</p>
                <button type="button" role="menuitem" data-testid="export-csv" onClick={download} style={menuItem}>
                  CSV
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="export-pdf"
                  onClick={() => {
                    setExportOpen(false);
                    window.print();
                  }}
                  style={menuItem}
                >
                  {tr('PDF (print)')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <section style={{ ...card, padding: '8px 16px 20px' }}>
        <div role="tablist" aria-label={tr('Analytics Dashboard')} style={{ display: 'flex', gap: 22, overflowX: 'auto', borderBottom: `1px solid ${color.border.subtle}`, marginBottom: 16 }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`dash-tab-${t}`}
              data-testid={`dash-tab-${t}`}
              aria-selected={tab === t}
              aria-controls="dash-panel"
              onClick={() => setTab(t)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${tab === t ? color.brand.primary : 'transparent'}`,
                marginBottom: -1,
                padding: '10px 0',
                fontFamily: 'inherit',
                fontSize: 16,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                color: tab === t ? color.brand.primary : color.text.secondary,
              }}
            >
              {tr(TAB_LABEL[t])}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="dash-panel" aria-labelledby={`dash-tab-${tab}`}>
          {error ? (
            <ErrorState title={error} onRetry={() => void load()} />
          ) : !data ? (
            <LoadingState />
          ) : tab === 'overview' ? (
            <Overview d={data} before={before} />
          ) : tab === 'customers' ? (
            <Customers d={data} />
          ) : tab === 'transactions' ? (
            <Transactions d={data} />
          ) : tab === 'revenue' ? (
            <Revenue d={data} />
          ) : tab === 'corridors' ? (
            <Corridors d={data} />
          ) : (
            <Operations d={data} before={before} />
          )}
        </div>
      </section>
    </>
  );
}

function Money({ list }: { list: Dashboard['overview']['value'] }): ReactElement {
  if (list.length === 0) return <>0</>;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {list.map((m) => (
        <span key={m.currency} style={{ fontSize: list.length > 1 ? 20 : undefined }}>
          {money(m)}
        </span>
      ))}
    </span>
  );
}

function Overview({ d, before }: { d: Dashboard; before: string }): ReactElement {
  const o = d.overview;
  const first = o.value[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Grid>
        <StatTile testId="tile-active" label={tr('Active Users')} value={count(o.active_users.value)} tint="blue">
          <Trend change={change(o.active_users.value, o.active_users.previous)} label={before} />
        </StatTile>
        <StatTile testId="tile-new" label={tr('New Users Onboarded')} value={count(o.new_users.value)} tint="green">
          <Trend change={change(o.new_users.value, o.new_users.previous)} label={before} />
        </StatTile>
        <StatTile testId="tile-trades" label={tr('Total Transactions')} value={count(o.trades_started.value)} tint="orange">
          <Trend change={change(o.trades_started.value, o.trades_started.previous)} label={before} />
        </StatTile>
        <StatTile testId="tile-value" label={tr('Transaction Value')} value={<Money list={o.value} />} tint="grey">
          {first ? <Trend change={moneyChange(first)} label={before} /> : null}
        </StatTile>
        <StatTile testId="tile-fees" label={tr('Fees earned')} value={<Money list={o.fees} />} tint="blue">
          {o.fees[0] ? <Trend change={moneyChange(o.fees[0])} label={before} /> : null}
        </StatTile>
        <StatTile testId="tile-speed" label={tr('Avg Settlement Time')} value={duration(o.avg_settlement_seconds) ?? '—'} tint="green" />
        <StatTile testId="tile-disputes" label={tr('Open disputes')} value={count(o.open_disputes)} tint="orange" />
        <StatTile testId="tile-kyc" label={tr('Waiting for identity check')} value={count(o.kyc_waiting)} tint="grey" />
      </Grid>
      <section style={{ ...card, boxShadow: 'none', border: `1px solid ${color.border.subtle}` }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>{tr('Top corridors')}</h2>
        {d.corridors.length === 0 ? (
          <p style={{ margin: 0, color: color.text.secondary }}>{tr('No trades in this period.')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.corridors.slice(0, 5).map((c) => (
              <li key={c.pair.join('')} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#F5F6FA', borderRadius: 6 }}>
                <span>
                  <strong dir="ltr">{c.pair.join(' ⇄ ')}</strong>
                  {c.average_rate ? <span style={{ display: 'block', fontSize: 12, color: color.text.secondary }}>{tr('Avg rate: {{rate}}', { rate: c.average_rate })}</span> : null}
                </span>
                <span style={{ textAlign: 'end' }}>
                  {tr('Trades: {{n}}', { n: count(c.trades) })}
                  <Growth value={c.trades} previous={c.previous_trades} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Growth({ value, previous }: { value: number; previous: number }): ReactElement | null {
  const c = change(value, previous);
  if (!c) return null;
  return <span style={{ display: 'block', fontSize: 12, color: c.up ? '#13A36B' : '#E5484D' }}>{`${c.up ? '+' : '-'}${c.pct}`}</span>;
}

function Customers({ d }: { d: Dashboard }): ReactElement {
  const keys = bucketKeys(d.period.start, d.period.end, d.period.bucket);
  const by = new Map(d.customers.growth.map((g) => [keyOf(g.at, d.period.bucket), g]));
  const c = d.customers;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <BarChart
        testId="growth-chart"
        title={tr('User Growth Chart')}
        labels={keys.map((k) => bucketLabel(k, d.period.bucket))}
        series={[
          { name: tr('New sign-ups'), values: keys.map((k) => by.get(k)?.signed_up ?? 0) },
          { name: tr('Not yet verified'), values: keys.map((k) => by.get(k)?.not_verified ?? 0) },
        ]}
      />
      <Grid>
        <StatTile label={tr('Churn Rate')} value={share(c.inactive_30_days, c.active_customers) ?? '—'} tint="blue">
          <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('Users inactive >30 days')}</span>
        </StatTile>
        <StatTile label={tr('Active customers')} value={count(c.active_customers)} tint="green">
          <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('Accounts that finished sign-up')}</span>
        </StatTile>
      </Grid>
    </div>
  );
}

function Transactions({ d }: { d: Dashboard }): ReactElement {
  const t = d.transactions;
  const finished = t.completed + t.failed;
  const speed = t.speed;
  const total = Object.values(speed).reduce((a, b) => a + b, 0);
  return (
    <Grid min={300}>
      <section style={{ ...card, border: `1px solid ${color.border.subtle}`, boxShadow: 'none', textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, textAlign: 'start' }}>{tr('Transaction Success Rate')}</h2>
        {finished === 0 ? (
          <p style={{ color: color.text.secondary }}>{tr('No trades finished in this period.')}</p>
        ) : (
          <>
            <p data-testid="success-rate" style={{ margin: 0, fontSize: 52, fontWeight: 700, color: '#13A36B' }}>{share(t.completed, finished)}</p>
            <p style={{ margin: '0 0 16px', color: color.text.secondary }}>{tr('successful transactions ({{n}})', { n: count(t.completed) })}</p>
            <p style={{ margin: 0, fontSize: 40, fontWeight: 700, color: '#E5484D' }}>{share(t.failed, finished)}</p>
            <p style={{ margin: 0, color: color.text.secondary }}>{tr('failed or cancelled ({{n}})', { n: count(t.failed) })}</p>
          </>
        )}
      </section>
      <section style={{ ...card, border: `1px solid ${color.border.subtle}`, boxShadow: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{tr('Settlement Speed Distribution')}</h2>
        <ShareBar label={tr('<1 min')} part={speed.lt_1m} whole={total} />
        <ShareBar label={tr('1-5 mins')} part={speed['1_5m']} whole={total} />
        <ShareBar label={tr('5-10 mins')} part={speed['5_10m']} whole={total} />
        <ShareBar label={tr('10-60 mins')} part={speed['10_60m']} whole={total} />
        <ShareBar label={tr('> 1 hour')} part={speed.gt_60m} whole={total} />
      </section>
    </Grid>
  );
}

function Revenue({ d }: { d: Dashboard }): ReactElement {
  const currencies = [...new Set(d.revenue.fees_by_time.map((f) => f.currency).concat(d.overview.fees.map((f) => f.currency)))].sort();
  const [cur, setCur] = useState(currencies.includes('NGN') ? 'NGN' : (currencies[0] ?? 'NGN'));
  const keys = bucketKeys(d.period.start, d.period.end, d.period.bucket);
  const rows = d.revenue.fees_by_time.filter((f) => f.currency === cur);
  const scale = rows[0]?.scale ?? 2;
  const by = new Map(rows.map((r) => [keyOf(r.at, d.period.bucket), r.minor]));
  // Bar heights only; every number shown is formatted exactly from the minor units.
  const minors = keys.map((k) => by.get(k) ?? '0');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('Fees Xspeeria earned on completed trades')}</span>
        {currencies.length > 1 ? (
          <label>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{tr('Currency')}</span>
            <select data-testid="revenue-currency" value={cur} onChange={(e) => setCur(e.target.value)} style={control}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <BarChart
        testId="revenue-chart"
        title={tr('Revenue Breakdown')}
        labels={keys.map((k) => bucketLabel(k, d.period.bucket))}
        series={[{ name: tr('Fees ({{currency}})', { currency: cur }), values: minors.map((m) => Number(m)), show: (_v, i) => money({ currency: cur, scale, minor: minors[i] ?? '0' }) }]}
      />
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{tr('Waiting in escrow now')}</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: color.text.secondary }}>
          {tr('A record of customer money held by partner banks until both sides have paid. It is not Xspeeria’s money and not revenue.')}
        </p>
        <Grid>
          {d.revenue.waiting_in_escrow.length === 0 ? (
            <StatTile label={tr('Waiting in escrow')} value="0" tint="blue" />
          ) : (
            d.revenue.waiting_in_escrow.map((e) => (
              <StatTile key={e.currency} testId={`escrow-${e.currency}`} label={tr('Waiting in escrow ({{currency}})', { currency: e.currency })} value={money(e)} tint="blue">
                <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('{{n}} payments in', { n: count(e.legs) })}</span>
              </StatTile>
            ))
          )}
        </Grid>
      </div>
    </div>
  );
}

function Corridors({ d }: { d: Dashboard }): ReactElement {
  return (
    <div style={{ border: `1px solid ${color.border.subtle}`, borderRadius: 12, overflowX: 'auto' }}>
      <table data-testid="corridors" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ backgroundColor: '#F8F9FB' }}>
            {[tr('Corridor'), tr('Trades'), tr('Growth'), tr('Avg Rate')].map((h, i) => (
              <th key={h} scope="col" style={{ ...th, textAlign: i === 0 ? 'start' : 'end' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.corridors.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ ...td, color: color.text.secondary }}>
                {tr('No trades in this period.')}
              </td>
            </tr>
          ) : (
            d.corridors.map((c) => {
              const g = change(c.trades, c.previous_trades);
              return (
                <tr key={c.pair.join('')}>
                  <td style={td} dir="ltr">
                    {c.pair.join(' ⇄ ')}
                  </td>
                  <td style={{ ...td, textAlign: 'end' }}>{count(c.trades)}</td>
                  <td style={{ ...td, textAlign: 'end', color: g ? (g.up ? '#13A36B' : '#E5484D') : color.text.secondary }}>{g ? `${g.up ? '+' : '-'}${g.pct}` : '—'}</td>
                  <td style={{ ...td, textAlign: 'end' }} dir="ltr">
                    {c.average_rate ?? '—'}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function Operations({ d, before }: { d: Dashboard; before: string }): ReactElement {
  const p = d.operations;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{tr('Operational Health Metrics')}</h2>
      <Grid>
        <StatTile label={tr('Disputes opened')} value={count(p.disputes_opened.value)} tint="blue">
          <Trend change={change(p.disputes_opened.value, p.disputes_opened.previous)} label={before} />
        </StatTile>
        <StatTile label={tr('Disputes resolved')} value={count(p.disputes_resolved.value)} tint="green">
          <Trend change={change(p.disputes_resolved.value, p.disputes_resolved.previous)} label={before} />
        </StatTile>
        <StatTile label={tr('Mean Time to Resolve')} value={duration(p.mean_seconds_to_resolve) ?? '—'} tint="orange" />
        <StatTile label={tr('Reconciliation items open')} value={count(p.reconciliation_open)} tint="grey" />
      </Grid>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{tr('Liquidity')}</h2>
      <Grid>
        <StatTile testId="offers-naira" label={tr('Open offers paying naira')} value={count(p.open_offers_paying_naira)} tint="blue">
          <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('People buying foreign currency')}</span>
        </StatTile>
        <StatTile testId="offers-foreign" label={tr('Open offers paying foreign currency')} value={count(p.open_offers_paying_foreign)} tint="green">
          <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('People buying naira')}</span>
        </StatTile>
      </Grid>
    </div>
  );
}

const control = {
  height: 40,
  padding: '0 12px',
  border: `1px solid ${color.border.strong}`,
  borderRadius: 6,
  backgroundColor: color.bg.canvas,
  fontFamily: 'inherit',
  fontSize: 14,
} as const;
const exportButton = {
  height: 40,
  padding: '0 18px',
  border: 'none',
  borderRadius: 6,
  backgroundColor: color.brand.primary,
  color: color.text.onFill,
  fontFamily: 'inherit',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
} as const;
const menuItem = {
  display: 'block',
  width: '100%',
  textAlign: 'start',
  padding: '10px 10px',
  background: 'none',
  border: 'none',
  borderRadius: 6,
  fontFamily: 'inherit',
  fontSize: 14,
  cursor: 'pointer',
} as const;
const th = { padding: '12px 16px', fontWeight: 600, borderBottom: `1px solid ${color.border.subtle}` } as const;
const td = { padding: '14px 16px', borderBottom: `1px solid ${color.border.subtle}` } as const;
