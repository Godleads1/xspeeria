'use client';

/**
 * Users (customers), after the Figma "Users" frame: four count tiles, search, a status filter
 * and the list (ADR-062).
 *
 * Owner decisions 2026-10-26: Suspend = temporary (can't log in or trade; open deals keep
 * settling), Close = for good; only a Super Admin may change them, with a reason. The ⋮ menu
 * shows only to a Super Admin (display only — the server checks again).
 * The Figma "Total Active / Inactive" tiles count app activity in the last 30 days.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type Customer, type CustomerAction, type CustomerPage, type CustomerStats, type CustomerStatus } from '../../lib/api';
import { count } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { space } from '../../theme';
import { Grid, StatTile } from '../dashboard/parts';
import { BarSelect, FilterBar, SearchBox } from '../FilterBar';
import { Button, FormError, Notice, PageTitle } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { ReasonDialog } from '../ReasonDialog';
import { RowMenu, type RowAction } from '../RowMenu';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';

const PAGE = 50;

export function CustomerStatusChip({ status }: { status: CustomerStatus }): ReactElement {
  if (status === 'suspended') return <StatusChip label={tr('Suspended')} tone="warning" />;
  if (status === 'closed') return <StatusChip label={tr('Closed')} tone="error" />;
  return <StatusChip label={tr('Active')} tone="success" />;
}

export const QUESTION: Record<CustomerAction, string> = {
  suspend: 'Suspend {{name}}? They are logged out and can’t log in or trade until you lift it. Deals already under way keep settling.',
  reactivate: 'Lift the suspension for {{name}}? They can log in and trade again.',
  close: 'Close the account of {{name}} for good? This can’t be undone from the console.',
};
export const CONFIRM: Record<CustomerAction, string> = { suspend: 'Yes, Suspend', reactivate: 'Yes, Reactivate', close: 'Yes, Close' };
export const DONE: Record<CustomerAction, string> = {
  suspend: '{{name}} is suspended and was logged out.',
  reactivate: '{{name}} can log in again.',
  close: 'The account of {{name}} is closed.',
};

export function UsersScreen(): ReactElement {
  const { me, api, can } = useSession();
  const isSuper = me.role === 'super_admin';
  // ADR-073: everything a customer did (Super Admin, activity.read).
  const canActivity = can('activity.read');
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [page, setPage] = useState<CustomerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | CustomerStatus>('');
  const [offset, setOffset] = useState(0);
  const [asking, setAsking] = useState<{ customer: Customer; action: CustomerAction } | null>(null);
  // A link from another screen (e.g. a fraud alert) can open the list already searched. The value
  // comes from the address bar: it is only ever used as search text (the server checks it).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('q');
      if (q) setSearch(q.slice(0, 80));
    } catch {
      // No address to read (tests): start empty.
    }
  }, []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Ask the server only after typing pauses.
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
        api.listCustomers({ search: query || undefined, status: status || undefined, offset, limit: PAGE }),
        api.customerStats(),
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

  const nameOf = (c: Customer) => c.name ?? c.email;

  async function act(reason: string): Promise<void> {
    if (!asking) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.changeCustomer(asking.customer.id, asking.action, reason);
      setNotice(tr(DONE[asking.action], { name: nameOf(asking.customer) }));
      setAsking(null);
      await load();
    } catch (e) {
      setActionError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  const actionsFor = (c: Customer): RowAction[] => {
    const activity: RowAction[] = canActivity
      ? [{ label: tr('View activity'), testId: `activity-${c.id}`, onSelect: () => window.location.assign(`/users/activity?id=${encodeURIComponent(c.id)}`) }]
      : [];
    return [...activity, ...changesFor(c)];
  };

  const changesFor = (c: Customer): RowAction[] => {
    if (!isSuper) return [];
    const open = (action: CustomerAction) => () => {
      setActionError(null);
      setNotice(null);
      setAsking({ customer: c, action });
    };
    if (c.status === 'active')
      return [
        { label: tr('Suspend'), testId: `suspend-${c.id}`, onSelect: open('suspend') },
        { label: tr('Close account'), danger: true, testId: `close-${c.id}`, onSelect: open('close') },
      ];
    if (c.status === 'suspended')
      return [
        { label: tr('Reactivate'), testId: `reactivate-${c.id}`, onSelect: open('reactivate') },
        { label: tr('Close account'), danger: true, testId: `close-${c.id}`, onSelect: open('close') },
      ];
    return [];
  };

  const columns: readonly Column<Customer>[] = [
    { key: 'ref', header: tr('ID'), render: (c) => <span dir="ltr">{c.ref}</span> },
    { key: 'name', header: tr('NAME'), render: (c) => c.name ?? <span title={tr('No approved identity check yet')}>—</span> },
    { key: 'email', header: tr('E-MAIL ADDRESS'), render: (c) => c.email },
    { key: 'phone', header: tr('PHONE'), render: (c) => <span dir="ltr">{c.phone}</span> },
    { key: 'last', header: tr('LAST LOGIN'), render: (c) => when(c.last_login_at) },
    { key: 'status', header: tr('STATUS'), render: (c) => <CustomerStatusChip status={c.status} /> },
    ...(isSuper || canActivity
      ? [{ key: 'actions', header: tr('ACTION'), render: (c: Customer) => <RowMenu label={tr('Actions for {{name}}', { name: nameOf(c) })} actions={actionsFor(c)} testId={`menu-${c.id}`} /> }]
      : []),
  ];

  const total = page?.total ?? 0;
  return (
    <>
      <PageTitle crumb={tr('Users')}>{tr('Users')}</PageTitle>
      <Grid>
        <StatTile testId="users-total" label={tr('Total User')} value={stats ? count(stats.total) : '—'} tint="blue">
          {stats && stats.suspended > 0 ? <span style={{ fontSize: 13 }}>{tr('{{n}} suspended', { n: count(stats.suspended) })}</span> : null}
        </StatTile>
        <StatTile testId="users-active" label={tr('Total Active Users')} value={stats ? count(stats.active_30_days) : '—'} tint="green">
          <span style={{ fontSize: 13 }}>{tr('Used the app in the last 30 days')}</span>
        </StatTile>
        <StatTile testId="users-inactive" label={tr('Total Inactive Users')} value={stats ? count(stats.inactive_30_days) : '—'} tint="orange">
          <span style={{ fontSize: 13 }}>{tr('No activity for 30 days')}</span>
        </StatTile>
        <StatTile testId="users-kyc" label={tr('Total Pending KYC verification')} value={stats ? count(stats.kyc_waiting) : '—'} tint="grey" />
      </Grid>
      <FormError message={error && page ? error : null} />
      <Notice message={notice} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder={tr('Search name, email or phone')} testId="users-search" />
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
              setStatus(v as '' | CustomerStatus);
              setOffset(0);
            }}
            testId="users-status"
            options={[
              { value: '', label: tr('Status') },
              { value: 'active', label: tr('Active') },
              { value: 'suspended', label: tr('Suspended') },
              { value: 'closed', label: tr('Closed') },
            ]}
          />
        </FilterBar>
      </div>
      <Panel>
        <DataTable
          caption={tr('Users')}
          hideCaption
          columns={columns}
          rows={page?.items ?? []}
          status={error && !page ? 'error' : page === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={query || status ? tr('No users match your search') : tr('No users yet')}
        />
        {total > PAGE ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13 }}>
              {tr('{{from}}–{{to}} of {{total}}', { from: count(offset + 1), to: count(Math.min(offset + PAGE, total)), total: count(total) })}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} testId="users-prev">
                {tr('Previous')}
              </Button>
              <Button variant="secondary" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} testId="users-next">
                {tr('Next')}
              </Button>
            </span>
          </div>
        ) : null}
      </Panel>
      {asking ? (
        <ReasonDialog
          title={tr(QUESTION[asking.action], { name: nameOf(asking.customer) })}
          confirm={tr(CONFIRM[asking.action])}
          danger={asking.action !== 'reactivate'}
          busy={busy}
          error={actionError}
          onCancel={() => setAsking(null)}
          onConfirm={(reason) => void act(reason)}
        />
      ) : null}
    </>
  );
}
