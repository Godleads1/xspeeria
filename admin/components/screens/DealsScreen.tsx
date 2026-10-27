'use client';

/**
 * Transactions (ADR-073, Super Admin only): find a deal by the reference customers see in the
 * app (first 8 characters), by either customer's email, or by its full ID, then open its
 * timeline. Read-only.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type DealRow } from '../../lib/api';
import { money } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { SearchBox } from '../FilterBar';
import { Button, PageTitle } from '../forms';
import { Panel } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { PHASE_LABEL } from './ReversalScreen';
import { when } from './common';

const PAGE = 50;

/** An exact decimal from the server ("264100.00") in the console's money format; no floats. */
export function decimalMoney(amount: string | null | undefined, currency: string | null | undefined): string {
  if (!amount || !currency) return '—';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!m) return '—';
  const frac = m[3] ?? '';
  return money({ currency, scale: frac.length, minor: `${m[1]}${m[2]}${frac}`.replace(/^(-?)0+(?=\d)/, '$1') });
}

export function phaseLabel(phase: string | null): string {
  if (!phase) return tr('No escrow yet');
  return PHASE_LABEL[phase] ? tr(PHASE_LABEL[phase]) : phase;
}

export function DealsScreen(): ReactElement {
  const { api } = useSession();
  const [search, setSearch] = useState('');
  const [typed, setTyped] = useState('');
  const [items, setItems] = useState<DealRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Search after a short pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim().slice(0, 80)), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const load = useCallback(
    async (offset: number) => {
      setBusy(true);
      setError(null);
      try {
        const page = await api.listDeals({ search: search || undefined, offset, limit: PAGE });
        setItems((old) => (offset ? [...(old ?? []), ...page.items] : page.items));
        setTotal(page.total);
      } catch (e) {
        setError(messageFor(e));
      } finally {
        setBusy(false);
      }
    },
    [api, search],
  );
  useEffect(() => {
    setItems(null);
    void load(0);
  }, [load]);

  type Row = DealRow & { id: string };
  const columns: readonly Column<Row>[] = [
    {
      key: 'ref',
      header: tr('REFERENCE'),
      render: (d) => (
        <Link href={`/deals/case?id=${encodeURIComponent(d.match_id)}`} data-testid={`deal-${d.ref}`} style={{ fontWeight: 600 }}>
          {d.ref}
        </Link>
      ),
    },
    { key: 'taken', header: tr('TAKEN (LAGOS)'), render: (d) => when(d.taken_at) },
    { key: 'amount', header: tr('AMOUNT'), numeric: true, render: (d) => decimalMoney(d.amount, d.currency) },
    { key: 'pair', header: tr('FOR'), render: (d) => d.counter_currency },
    { key: 'owner', header: tr('OFFER OWNER'), render: (d) => d.offer_owner.email },
    { key: 'taker', header: tr('TAKER'), render: (d) => d.taker.email },
    { key: 'phase', header: tr('STATUS'), render: (d) => phaseLabel(d.phase) },
  ];

  return (
    <>
      <PageTitle
        crumb={tr('Transactions')}
        sub={tr('Every deal, with each step from offer to payout. Search by the reference the customer sees, an email, or the full ID.')}
      >
        {tr('Transactions')}
      </PageTitle>
      <SearchBox value={typed} onChange={setTyped} placeholder={tr('Reference, email or ID')} testId="deals-search" />
      <Panel>
        <DataTable
          caption={tr('Transactions')}
          hideCaption
          columns={columns}
          rows={(items ?? []).map((d) => ({ ...d, id: d.match_id }))}
          status={error && items === null ? 'error' : items === null ? 'loading' : 'ready'}
          onRetry={() => void load(0)}
          emptyTitle={tr('No deals found')}
        />
        {error && items !== null ? <p style={{ color: color.error.text, margin: 0 }}>{error}</p> : null}
        {items && items.length < total ? (
          <Button variant="secondary" busy={busy} testId="deals-more" onClick={() => void load(items.length)}>
            {tr('Show more')}
          </Button>
        ) : null}
      </Panel>
    </>
  );
}
