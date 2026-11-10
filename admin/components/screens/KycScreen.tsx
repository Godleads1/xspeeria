'use client';

/**
 * Identity checks waiting for a person (ADR-069; owner 2026-10-27). No Figma frame exists for
 * this screen; it follows the other admin lists.
 *
 * Three lists:
 * - Waiting for staff: checks Xspeeria held (same person on another account, a second country's
 *   ID that doesn't match, or checks incomplete). Approving needs two people.
 * - Being reviewed in Didit: Didit is deciding (owner: decided in Didit's console). Read-only.
 * - Decided: held checks staff have approved or rejected.
 * Oldest first while waiting (Compliance Operations Manual §4.2). Display only — the server checks
 * every permission and rule again.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type KycPage, type KycQueue, type KycReviewReason, type KycRow } from '../../lib/api';
import { count } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color, space } from '../../theme';
import { Grid, StatTile } from '../dashboard/parts';
import { SearchBox } from '../FilterBar';
import { Button, FormError, PageTitle } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';

const PAGE = 50;

export const QUEUE_LABEL: Record<KycQueue, string> = {
  held: 'Waiting for staff',
  in_didit: 'Being reviewed in Didit',
  decided: 'Decided',
};
export const REVIEW_REASON: Record<KycReviewReason, string> = {
  DUPLICATE_IDENTITY: 'Same person on another account',
  IDENTITY_MISMATCH: 'Doesn’t match the account’s identity',
  CHECKS_INCOMPLETE: 'Checks incomplete',
  // ADR-104: a redo identity check on a different ID document than the approved one.
  REDO_NEW_DOCUMENT: 'New identity check on a different ID',
};
export const COUNTRY_NAME: Record<string, string> = {
  NG: 'Nigeria',
  GB: 'United Kingdom',
  US: 'United States',
  CA: 'Canada',
  // ADR-105
  DE: 'Germany',
  FR: 'France',
  CN: 'China',
};

export function KycStatusChip({ row }: { row: Pick<KycRow, 'status' | 'review_reason' | 'awaiting_second'> }): ReactElement {
  if (row.status === 'approved') return <StatusChip label={tr('Approved')} tone="success" />;
  if (row.status === 'rejected') return <StatusChip label={tr('Rejected')} tone="error" />;
  if (row.review_reason === null) return <StatusChip label={tr('In Didit')} tone="neutral" />;
  if (row.awaiting_second) return <StatusChip label={tr('Waiting for a second person')} tone="warning" />;
  return <StatusChip label={tr('Waiting')} tone="warning" />;
}

export function KycScreen(): ReactElement {
  const { api } = useSession();
  const [queue, setQueue] = useState<KycQueue>('held');
  const [page, setPage] = useState<KycPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
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
      setPage(await api.listKycCases({ queue, search: query || undefined, offset, limit: PAGE }));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, queue, query, offset]);
  useEffect(() => {
    void load();
  }, [load]);

  const columns: readonly Column<KycRow>[] = [
    {
      key: 'ref',
      header: tr('Check ID'),
      render: (c) => (
        <a href={`/kyc/case?id=${encodeURIComponent(c.id)}`} data-testid={`open-${c.id}`} dir="ltr" style={{ color: 'inherit', fontWeight: 600 }}>
          {c.ref}
        </a>
      ),
    },
    { key: 'customer', header: tr('Customer'), render: (c) => c.customer },
    { key: 'country', header: tr('Country'), render: (c) => tr(COUNTRY_NAME[c.country] ?? c.country) },
    { key: 'why', header: tr('Why it needs a person'), render: (c) => (c.review_reason ? tr(REVIEW_REASON[c.review_reason]) : tr('Didit is reviewing it')) },
    { key: 'since', header: queue === 'decided' ? tr('Decided') : tr('Waiting since'), render: (c) => when(queue === 'decided' ? c.decided_at : c.waiting_since) },
    { key: 'status', header: tr('Status'), render: (c) => <KycStatusChip row={c} /> },
  ];

  const total = page?.total ?? 0;
  return (
    <>
      <PageTitle crumb={tr('Identity checks')}>{tr('Identity checks')}</PageTitle>
      <Grid>
        <StatTile testId="kyc-held" label={tr('Waiting for staff')} value={page ? count(page.held) : '—'} tint="orange">
          <span style={{ fontSize: 13 }}>{tr('Approving needs two people')}</span>
        </StatTile>
        <StatTile testId="kyc-didit" label={tr('Being reviewed in Didit')} value={page ? count(page.in_didit) : '—'} tint="blue">
          <span style={{ fontSize: 13 }}>{tr('Decided in Didit’s console')}</span>
        </StatTile>
      </Grid>
      <div role="tablist" aria-label={tr('Identity checks')} style={{ display: 'flex', gap: 22, borderBottom: `1px solid ${color.border.subtle}` }}>
        {(Object.keys(QUEUE_LABEL) as KycQueue[]).map((q) => (
          <button
            key={q}
            type="button"
            role="tab"
            aria-selected={queue === q}
            data-testid={`queue-${q}`}
            onClick={() => {
              setQueue(q);
              setOffset(0);
            }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${queue === q ? color.brand.primary : 'transparent'}`,
              marginBottom: -1,
              padding: '10px 0',
              fontFamily: 'inherit',
              fontSize: 15,
              fontWeight: queue === q ? 600 : 400,
              cursor: 'pointer',
              color: queue === q ? color.brand.primary : color.text.secondary,
            }}
          >
            {tr(QUEUE_LABEL[q])}
          </button>
        ))}
      </div>
      <FormError message={error && page ? error : null} />
      <div style={{ display: 'flex', gap: space.sm, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder={tr('Search name or email')} testId="kyc-search" />
      </div>
      <Panel>
        <DataTable
          caption={tr('Identity checks')}
          hideCaption
          columns={columns}
          rows={page?.items ?? []}
          status={error && !page ? 'error' : page === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={query ? tr('No checks match your search') : tr('Nothing here right now')}
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
