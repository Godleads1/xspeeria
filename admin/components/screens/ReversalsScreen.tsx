'use client';

/**
 * Reversal list, after the Figma "Reversal" frame (ADR-065): tiles, search, status filter and
 * the list of refund requests.
 *
 * Design corrections (no sample figures, ADR-061; no AI, ADR-064): Figma's "AI Flagged Issues"
 * tile and "Risk Level" column are left out — nothing in Xspeeria computes them. "Initiated by"
 * is always a staff member: system-started reversals don't exist yet. The amount is what goes
 * back to each person who paid in (fee included), one line per currency.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type ReversalPage, type ReversalRow, type ReversalStats, type ReversalStatus } from '../../lib/api';
import { count, money } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { space } from '../../theme';
import { Grid, StatTile } from '../dashboard/parts';
import { BarSelect, FilterBar, SearchBox } from '../FilterBar';
import { Button, FormError, PageTitle } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';

const PAGE = 50;

export const REVERSAL_STATUS: Record<ReversalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function ReversalStatusChip({ status }: { status: ReversalStatus }): ReactElement {
  const tone = status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'warning';
  return <StatusChip label={tr(REVERSAL_STATUS[status])} tone={tone} />;
}

export function ReversalsScreen(): ReactElement {
  const { api } = useSession();
  const [page, setPage] = useState<ReversalPage | null>(null);
  const [stats, setStats] = useState<ReversalStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | ReversalStatus>('');
  const [offset, setOffset] = useState(0);

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
        api.listReversals({ search: query || undefined, status: status || undefined, offset, limit: PAGE }),
        api.reversalStats(),
      ]);
      setPage(p);
      setStats(s);
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, query, status, offset]);
  useEffect(() => {
    void load();
  }, [load]);

  const columns: readonly Column<ReversalRow>[] = [
    {
      key: 'ref',
      header: tr('Reversal ID'),
      render: (r) => (
        <a href={`/reversals/case?id=${encodeURIComponent(r.id)}`} data-testid={`open-${r.id}`} dir="ltr" style={{ color: 'inherit', fontWeight: 600 }}>
          {r.ref}
        </a>
      ),
    },
    { key: 'by', header: tr('Initiated By'), render: (r) => r.requested_by },
    { key: 'customer', header: tr('Customer Name'), render: (r) => r.customer },
    {
      key: 'amount',
      header: tr('Amount'),
      numeric: true,
      render: (r) => (
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          {r.returns.length === 0 ? '—' : r.returns.map((x) => <span key={x.currency}>{money(x)}</span>)}
        </span>
      ),
    },
    { key: 'date', header: tr('Date'), render: (r) => when(r.requested_at) },
    {
      key: 'reason',
      header: tr('Reversal Reason'),
      render: (r) => (
        <span>
          {r.category_name}
          <span style={{ display: 'block', fontSize: 12, opacity: 0.75, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span>
        </span>
      ),
    },
    { key: 'status', header: tr('Status'), render: (r) => <ReversalStatusChip status={r.status} /> },
  ];

  const total = page?.total ?? 0;
  return (
    <>
      <PageTitle crumb={tr('Reversal')}>{tr('Reversal')}</PageTitle>
      <Grid>
        <StatTile testId="reversals-total" label={tr('Total Reversals')} value={stats ? count(stats.total) : '—'} tint="blue" />
        <StatTile testId="reversals-approved" label={tr('Approved Reversals')} value={stats ? count(stats.approved) : '—'} tint="green" />
        <StatTile testId="reversals-pending" label={tr('Pending Reversals')} value={stats ? count(stats.pending) : '—'} tint="orange">
          <span style={{ fontSize: 13 }}>{tr('Waiting for a second person to approve')}</span>
        </StatTile>
        <StatTile testId="reversals-rejected" label={tr('Rejected Reversals')} value={stats ? count(stats.rejected) : '—'} tint="grey" />
      </Grid>
      <FormError message={error && page ? error : null} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder={tr('Search name, email or reversal ID')} testId="reversals-search" />
        <FilterBar
          onReset={
            search || status
              ? () => {
                  setSearch('');
                  setStatus('');
                  setOffset(0);
                }
              : undefined
          }
        >
          <BarSelect
            label={tr('Status')}
            value={status}
            onChange={(v) => {
              setStatus(v as '' | ReversalStatus);
              setOffset(0);
            }}
            testId="reversals-status"
            options={[
              { value: '', label: tr('Status') },
              { value: 'pending', label: tr('Pending') },
              { value: 'approved', label: tr('Approved') },
              { value: 'rejected', label: tr('Rejected') },
            ]}
          />
        </FilterBar>
      </div>
      <Panel>
        <DataTable
          caption={tr('Reversal')}
          hideCaption
          columns={columns}
          rows={page?.items ?? []}
          status={error && !page ? 'error' : page === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={query || status ? tr('No reversals match your search') : tr('No reversals yet')}
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
    </>
  );
}
