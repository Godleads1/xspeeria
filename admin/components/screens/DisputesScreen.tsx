'use client';

/**
 * Dispute Resolution list, after the Figma frame: four tiles, search, status filter, the list
 * with the SLA timer, and "Start a dispute" (ADR-063).
 *
 * SLA (owner decision 2026-10-26): 24 hours from opening to closing. The timer counts down
 * from the server's clock (sent with the list), so a wrong computer clock can't hide an overdue
 * case. Display only — the server checks every permission.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

import { messageFor, type DisputePage, type DisputeRow, type DisputeStats, type DisputeStatus } from '../../lib/api';
import { count, duration } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { space } from '../../theme';
import { Grid, StatTile } from '../dashboard/parts';
import { BarSelect, FilterBar, SearchBox } from '../FilterBar';
import { Button, FormError, Notice, PageTitle } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { RaiseDispute } from './RaiseDispute';
import { when } from './common';

const PAGE = 50;
const AMBER_UNDER_MS = 6 * 3600_000;

export function DisputeStatusChip({ status }: { status: DisputeStatus }): ReactElement {
  if (status === 'resolved') return <StatusChip label={tr('Resolved')} tone="success" />;
  if (status === 'under_review') return <StatusChip label={tr('In Progress')} tone="warning" />;
  return <StatusChip label={tr('New')} tone="neutral" />;
}

function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Remaining time, "SLA Overdue", or for a closed case whether it was closed in time. */
export function Sla({ row, now }: { row: Pick<DisputeRow, 'sla_due_at' | 'resolved_at' | 'status'>; now: number }): ReactElement {
  const due = Date.parse(row.sla_due_at);
  if (row.status === 'resolved' && row.resolved_at) {
    const met = Date.parse(row.resolved_at) <= due;
    return <span style={{ color: met ? '#13A36B' : '#E5484D' }}>{met ? tr('Met') : tr('Missed')}</span>;
  }
  const left = due - now;
  if (left <= 0) return <span style={{ color: '#E5484D', fontWeight: 600 }}>{tr('SLA Overdue')}</span>;
  return (
    <span dir="ltr" style={{ color: left < AMBER_UNDER_MS ? '#C27803' : '#13A36B', fontVariantNumeric: 'tabular-nums' }}>
      {hms(left)}
    </span>
  );
}

/** Server time now, moving on with this computer's clock since the list arrived. */
export function useServerNow(serverNow: string | null): number {
  const base = useRef<{ server: number; local: number } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    base.current = serverNow ? { server: Date.parse(serverNow), local: Date.now() } : null;
  }, [serverNow]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const b = base.current;
  return b ? b.server + (Date.now() - b.local) : serverNow ? Date.parse(serverNow) : Date.now();
}

export function DisputesScreen(): ReactElement {
  const { api, can } = useSession();
  const [page, setPage] = useState<DisputePage | null>(null);
  const [stats, setStats] = useState<DisputeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | DisputeStatus>('');
  const [mine, setMine] = useState(false);
  const [offset, setOffset] = useState(0);
  const [raising, setRaising] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useServerNow(page?.now ?? null);

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
        api.listDisputes({ search: query || undefined, status: status || undefined, mine, offset, limit: PAGE }),
        api.disputeStats(),
      ]);
      setPage(p);
      setStats(s);
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, query, status, mine, offset]);
  useEffect(() => {
    void load();
  }, [load]);

  const columns: readonly Column<DisputeRow>[] = [
    {
      key: 'ref',
      header: tr('Dispute ID'),
      render: (d) => (
        <a href={`/disputes/case?id=${encodeURIComponent(d.id)}`} data-testid={`open-${d.id}`} dir="ltr" style={{ color: 'inherit', fontWeight: 600 }}>
          {d.ref}
        </a>
      ),
    },
    { key: 'user', header: tr('User'), render: (d) => d.customer },
    {
      key: 'type',
      header: tr('Type'),
      render: (d) => (
        <span>
          {d.category_name}
          {d.kind === 'support' ? <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>{tr('Support')}</span> : null}
        </span>
      ),
    },
    { key: 'date', header: tr('Date'), render: (d) => when(d.created_at) },
    {
      key: 'status',
      header: tr('Status'),
      render: (d) => (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <DisputeStatusChip status={d.status} />
          {d.escalated ? <StatusChip label={tr('Escalated')} tone="error" /> : null}
        </span>
      ),
    },
    { key: 'agent', header: tr('Assigned Agents'), render: (d) => d.assigned_name ?? '—' },
    { key: 'sla', header: tr('SLA Timer'), render: (d) => <Sla row={d} now={now} /> },
  ];

  const total = page?.total ?? 0;
  return (
    <>
      <PageTitle
        crumb={tr('Dispute Resolution')}
        action={
          can('disputes.create') ? (
            <Button testId="start-dispute" onClick={() => setRaising(true)}>
              {tr('Start a dispute')}
            </Button>
          ) : undefined
        }
      >
        {tr('Dispute Resolution')}
      </PageTitle>
      <Grid>
        <StatTile testId="disputes-total" label={tr('Total Dispute')} value={stats ? count(stats.total) : '—'} tint="blue" />
        <StatTile testId="disputes-week" label={tr('Resolved this week')} value={stats ? count(stats.resolved_7_days) : '—'} tint="green">
          <span style={{ fontSize: 13 }}>{tr('Closed in the last 7 days')}</span>
        </StatTile>
        <StatTile testId="disputes-pending" label={tr('Pending Dispute')} value={stats ? count(stats.pending) : '—'} tint="orange">
          {stats && stats.overdue > 0 ? <span style={{ fontSize: 13, color: '#E5484D' }}>{tr('{{n}} past the 24-hour SLA', { n: count(stats.overdue) })}</span> : null}
        </StatTile>
        <StatTile testId="disputes-avg" label={tr('Average Resolution')} value={stats ? (duration(stats.avg_resolution_seconds) ?? '—') : '—'} tint="grey">
          <span style={{ fontSize: 13 }}>{tr('Cases closed in the last 30 days')}</span>
        </StatTile>
      </Grid>
      <FormError message={error && page ? error : null} />
      <Notice message={notice} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder={tr('Search name, email or dispute ID')} testId="disputes-search" />
        <FilterBar
          onReset={
            search || status || mine
              ? () => {
                  setSearch('');
                  setStatus('');
                  setMine(false);
                  setOffset(0);
                }
              : undefined
          }
        >
          <BarSelect
            label={tr('Status')}
            value={status}
            onChange={(v) => {
              setStatus(v as '' | DisputeStatus);
              setOffset(0);
            }}
            testId="disputes-status"
            options={[
              { value: '', label: tr('Status') },
              { value: 'open', label: tr('New') },
              { value: 'under_review', label: tr('In Progress') },
              { value: 'resolved', label: tr('Resolved') },
            ]}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginInlineStart: 12, cursor: 'pointer' }}>
            <input type="checkbox" data-testid="disputes-mine" checked={mine} onChange={(e) => { setMine(e.target.checked); setOffset(0); }} />
            {tr('Assigned to me')}
          </label>
        </FilterBar>
      </div>
      <Panel>
        <DataTable
          caption={tr('Dispute Resolution')}
          hideCaption
          columns={columns}
          rows={page?.items ?? []}
          status={error && !page ? 'error' : page === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={query || status || mine ? tr('No cases match your search') : tr('No disputes yet')}
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
      {raising ? (
        <RaiseDispute
          onCancel={() => setRaising(false)}
          onCreated={(ref) => {
            setRaising(false);
            setNotice(tr('A dispute with dispute ID {{id}} has been created successfully.', { id: ref }));
            void load();
          }}
        />
      ) : null}
    </>
  );
}
