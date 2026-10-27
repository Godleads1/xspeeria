'use client';

/**
 * One customer's activity (ADR-073, Super Admin only): everything they did in the app, with the
 * time, and what staff did about them, newest first. Kept for 5 years; nothing here can be
 * changed. Never shows a PIN, a code, a BVN or an account number — the server does not record them.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type ActivityCategory, type ActivityItem, type CustomerActivityPage } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { BarSelect, FilterBar } from '../FilterBar';
import { Button, PageTitle } from '../forms';
import { ErrorState, LoadingState, Panel, StatusChip, type StatusTone } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { csvCell } from './DashboardScreen';
import { CATEGORY_LABEL, OUTCOME_LABEL, activityLabel } from './activityLabels';
import { when } from './common';

const PAGE = 50;
const OUTCOME_TONE: Record<ActivityItem['outcome'], StatusTone> = { done: 'success', refused: 'warning', failed: 'error' };

/** A date from the picker, as the start or end of that day in Lagos. */
export function lagosDay(date: string, end: boolean): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return `${date}T${end ? '23:59:59.999' : '00:00:00'}+01:00`;
}

export function activityCsv(items: readonly ActivityItem[]): string {
  const head = ['Date (Lagos)', 'Who', 'Action', 'Type', 'Result', 'Deal', 'Device', 'Country'];
  const rows = items.map((i) => [
    when(i.at),
    i.source === 'staff' ? `${tr('Staff')}: ${i.staff_name ?? '—'}` : tr('Customer'),
    activityLabel(i.action),
    tr(CATEGORY_LABEL[i.category] ?? i.category),
    tr(OUTCOME_LABEL[i.outcome] ?? i.outcome),
    i.deal_ref ?? '',
    i.device ?? '',
    i.country ?? '',
  ]);
  return `${[head.map((h) => tr(h)), ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

const dateInput = {
  border: 'none',
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  color: color.text.primary,
} as const;

export function CustomerActivityScreen({ id }: { id: string }): ReactElement {
  const { api } = useSession();
  const [category, setCategory] = useState<ActivityCategory | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState<CustomerActivityPage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useCallback(
    (offset: number, limit: number) =>
      api.customerActivity(id, {
        category: category || undefined,
        since: lagosDay(from, false),
        until: lagosDay(to, true),
        offset,
        limit,
      }),
    [api, id, category, from, to],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    setPage(null);
    try {
      setPage(await query(0, PAGE));
    } catch (e) {
      setLoadError(messageFor(e));
    }
  }, [query]);
  useEffect(() => {
    void load();
  }, [load]);

  async function more(): Promise<void> {
    if (!page) return;
    setBusy(true);
    setError(null);
    try {
      const next = await query(page.items.length, PAGE);
      setPage({ ...next, items: [...page.items, ...next.items] });
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  async function download(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const all = await query(0, 500);
      const blob = new Blob([`﻿${activityCsv(all.items)}`], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `xspeeria-activity-${id.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !page) return <ErrorState title={loadError} onRetry={() => void load()} />;

  type Row = ActivityItem & { id: string };
  const columns: readonly Column<Row>[] = [
    { key: 'at', header: tr('DATE (LAGOS)'), render: (i) => when(i.at) },
    {
      key: 'who',
      header: tr('WHO'),
      render: (i) => (i.source === 'staff' ? `${tr('Staff')}: ${i.staff_name ?? '—'}` : tr('Customer')),
    },
    { key: 'action', header: tr('ACTION'), render: (i) => activityLabel(i.action) },
    { key: 'category', header: tr('TYPE'), render: (i) => tr(CATEGORY_LABEL[i.category] ?? i.category) },
    {
      key: 'outcome',
      header: tr('RESULT'),
      render: (i) => <StatusChip tone={OUTCOME_TONE[i.outcome] ?? 'neutral'} label={tr(OUTCOME_LABEL[i.outcome] ?? i.outcome)} />,
    },
    {
      key: 'deal',
      header: tr('DEAL'),
      render: (i) =>
        i.match_id && i.deal_ref ? (
          <Link href={`/deals/case?id=${encodeURIComponent(i.match_id)}`} data-testid={`deal-${i.deal_ref}`}>
            {i.deal_ref}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'device', header: tr('DEVICE'), render: (i) => i.device ?? '—' },
  ];

  const c = page?.customer;
  return (
    <>
      <PageTitle
        crumb={tr('Customer activity')}
        sub={tr('Everything this customer did in the app, and what staff did about them. Kept for 5 years; nothing here can be changed.')}
        action={
          <Button variant="secondary" busy={busy} testId="activity-csv" onClick={() => void download()}>
            {tr('Download CSV')}
          </Button>
        }
      >
        {c ? c.name ?? c.email : tr('Customer activity')}
      </PageTitle>
      {c ? (
        <p data-testid="activity-customer" style={{ margin: 0, color: color.text.secondary, fontSize: 14 }}>
          {c.email} · {c.phone} · {tr(c.status.charAt(0).toUpperCase() + c.status.slice(1))} · {tr('Joined {{date}}', { date: when(c.joined_at) })}
        </p>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <FilterBar
          onReset={
            category || from || to
              ? () => {
                  setCategory('');
                  setFrom('');
                  setTo('');
                }
              : undefined
          }
        >
          <BarSelect
            label={tr('Type')}
            value={category}
            onChange={(v) => setCategory(v as ActivityCategory | '')}
            testId="activity-category"
            options={[
              { value: '', label: tr('Everything') },
              ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label: tr(label) })),
            ]}
          />
          <input type="date" aria-label={tr('From')} data-testid="activity-from" value={from} onChange={(e) => setFrom(e.target.value)} style={dateInput} />
          <input type="date" aria-label={tr('To')} data-testid="activity-to" value={to} onChange={(e) => setTo(e.target.value)} style={dateInput} />
        </FilterBar>
      </div>
      <Panel>
        {page ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }} data-testid="activity-count">
              {tr('Showing {{shown}} of {{total}}', { shown: page.items.length, total: page.total })}
            </p>
            <DataTable
              caption={tr('Customer activity')}
              hideCaption
              columns={columns}
              rows={page.items.map((i, n) => ({ ...i, id: `${i.at}-${n}` }))}
              status="ready"
              emptyTitle={tr('Nothing recorded for this filter')}
            />
          </>
        ) : (
          <LoadingState />
        )}
        {error ? <p style={{ color: color.error.text, margin: 0 }}>{error}</p> : null}
        {page && page.items.length < page.total ? (
          <Button variant="secondary" busy={busy} testId="activity-more" onClick={() => void more()}>
            {tr('Show older')}
          </Button>
        ) : null}
      </Panel>
    </>
  );
}
