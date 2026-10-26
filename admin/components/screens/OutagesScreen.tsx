'use client';

/**
 * Figma "Service Outage Incident Management" (ADR-066; owner 2026-10-26: "Show a notice only").
 *
 * Staff report an outage with the words every signed-in app user sees in a banner until it is
 * resolved. Nothing is blocked. Columns follow Figma: Incident ID, Service, Start Time, End Time
 * (expected, or when it was resolved), Severity, Duration, Status.
 *
 * Times are typed and shown in Lagos time (UTC+1 all year). Display only — the server checks every
 * permission and rule again.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type Outage, type OutageInput, type OutagePage, type OutageSeverity, type OutageStatus } from '../../lib/api';
import { count, duration } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color, space } from '../../theme';
import { BarSelect, FilterBar, SearchBox } from '../FilterBar';
import { Button, FormError, Notice, PageTitle, Select, TextInput } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { RowMenu, type RowAction } from '../RowMenu';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';

const PAGE = 50;

export const SEVERITY: Record<OutageSeverity, string> = { low: 'Low', medium: 'Medium', high: 'High' };
export const OUTAGE_STATUS: Record<OutageStatus, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };

const DOT: Record<OutageSeverity, string> = { low: admin.up, medium: admin.amber, high: admin.down };

export function SeverityDot({ severity }: { severity: OutageSeverity }): ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: DOT[severity] }} />
      {tr(SEVERITY[severity])}
    </span>
  );
}

function OutageChip({ status }: { status: OutageStatus }): ReactElement {
  const tone = status === 'resolved' ? 'success' : status === 'in_progress' ? 'warning' : 'error';
  return <StatusChip label={tr(OUTAGE_STATUS[status])} tone={tone} />;
}

/** "2026-10-26T14:30" typed in Lagos time -> ISO with the +01:00 offset the server needs. */
export function lagosToIso(local: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00+01:00` : undefined;
}

/** ISO -> "2026-10-26T14:30" in Lagos time, for a datetime-local box. */
export function isoToLagos(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t + 3600_000).toISOString().slice(0, 16);
}

export function OutagesScreen(): ReactElement {
  const { api, can } = useSession();
  const [page, setPage] = useState<OutagePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | OutageStatus>('');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Outage | 'new' | null>(null);
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
      setPage(await api.listOutages({ search: query || undefined, status: status || undefined, offset, limit: PAGE }));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, query, status, offset]);
  useEffect(() => {
    void load();
  }, [load]);

  async function quick(o: Outage, next: OutageStatus, done: string): Promise<void> {
    setError(null);
    try {
      await api.changeOutage(o.id, { status: next });
      setNotice(done);
      await load();
    } catch (e) {
      setError(messageFor(e));
    }
  }

  function actionsFor(o: Outage): RowAction[] {
    if (o.status === 'resolved' || !can('outages.update')) return [];
    const list: RowAction[] = [{ label: tr('Edit'), onSelect: () => setEditing(o), testId: `edit-${o.id}` }];
    if (o.status === 'open') list.push({ label: tr('Mark In Progress'), onSelect: () => void quick(o, 'in_progress', tr('Outage {{ref}} is in progress', { ref: o.ref })), testId: `progress-${o.id}` });
    list.push({ label: tr('Mark Resolved'), onSelect: () => void quick(o, 'resolved', tr('Outage {{ref}} is resolved; the app notice is gone', { ref: o.ref })), testId: `resolve-${o.id}` });
    return list;
  }

  const columns: readonly Column<Outage>[] = [
    { key: 'ref', header: tr('Incident ID'), render: (o) => <span dir="ltr" style={{ fontWeight: 600 }}>{o.ref}</span> },
    {
      key: 'service',
      header: tr('Service'),
      render: (o) => (
        <span>
          {o.service}
          <span style={{ display: 'block', fontSize: 12, opacity: 0.75, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.message}>
            {o.message}
          </span>
        </span>
      ),
    },
    { key: 'start', header: tr('Start Time'), render: (o) => when(o.started_at) },
    {
      key: 'end',
      header: tr('End Time'),
      render: (o) =>
        o.resolved_at ? (
          when(o.resolved_at)
        ) : o.expected_end_at ? (
          <span>
            {when(o.expected_end_at)}
            <span style={{ display: 'block', fontSize: 12, opacity: 0.75 }}>{tr('Expected')}</span>
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'severity', header: tr('Severity'), render: (o) => <SeverityDot severity={o.severity} /> },
    {
      key: 'duration',
      header: tr('Duration'),
      // Planned work that hasn't begun yet, by the server's clock.
      render: (o) => (page && Date.parse(o.started_at) > Date.parse(page.now) ? tr('Not started') : (duration(o.duration_seconds) ?? '—')),
    },
    { key: 'status', header: tr('Status'), render: (o) => <OutageChip status={o.status} /> },
    ...(can('outages.update') ? [{ key: 'actions', header: tr('ACTION'), render: (o: Outage) => <RowMenu label={tr('Actions for {{name}}', { name: o.ref })} actions={actionsFor(o)} testId={`menu-${o.id}`} /> }] : []),
  ];

  const total = page?.total ?? 0;
  const live = page?.items.filter((o) => o.status !== 'resolved' && Date.parse(o.started_at) <= Date.parse(page.now)).length ?? 0;
  return (
    <>
      <PageTitle
        crumb={tr('Service Outage Incident Management')}
        action={
          can('outages.create') ? (
            <Button testId="report-outage" onClick={() => setEditing('new')}>
              {tr('Report an outage')}
            </Button>
          ) : undefined
        }
      >
        {tr('Service Outage Incident Management')}
      </PageTitle>
      <p data-testid="live-count" style={{ margin: 0, fontSize: 14, color: color.text.secondary }}>
        {live === 0 ? tr('No notice is showing in the app right now.') : live === 1 ? tr('1 notice is showing in the app right now.') : tr('{{n}} notices are showing in the app right now.', { n: count(live) })}
      </p>
      <FormError message={error && page ? error : null} />
      <Notice message={notice} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder={tr('Search service or incident ID')} testId="outages-search" />
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
              setStatus(v as '' | OutageStatus);
              setOffset(0);
            }}
            testId="outages-status"
            options={[
              { value: '', label: tr('Status') },
              { value: 'open', label: tr('Open') },
              { value: 'in_progress', label: tr('In Progress') },
              { value: 'resolved', label: tr('Resolved') },
            ]}
          />
        </FilterBar>
      </div>
      <Panel>
        <DataTable
          caption={tr('Service Outage Incident Management')}
          hideCaption
          columns={columns}
          rows={page?.items ?? []}
          status={error && !page ? 'error' : page === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={query || status ? tr('No outages match your search') : tr('No outages reported')}
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
      {editing ? (
        <OutageDialog
          outage={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === 'new') {
              const made = await api.reportOutage(input);
              setNotice(tr('Outage {{ref}} reported; app users now see the notice', { ref: made.ref }));
            } else {
              await api.changeOutage(editing.id, input);
              setNotice(tr('Outage {{ref}} updated', { ref: editing.ref }));
            }
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

function OutageDialog({
  outage,
  onCancel,
  onSave,
}: {
  outage: Outage | null;
  onCancel: () => void;
  onSave: (input: OutageInput) => Promise<void>;
}): ReactElement {
  const [service, setService] = useState(outage?.service ?? '');
  const [message, setMessage] = useState(outage?.message ?? '');
  const [severity, setSeverity] = useState<OutageSeverity>(outage?.severity ?? 'medium');
  const [start, setStart] = useState(isoToLagos(outage?.started_at ?? null));
  const [end, setEnd] = useState(isoToLagos(outage?.expected_end_at ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const ok = service.trim().length >= 2 && message.trim().length >= 5;
  const box = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, height: 40, fontFamily: 'inherit', fontSize: 14, padding: '0 8px', borderRadius: 6, border: `1px solid ${color.border.strong}`, backgroundColor: color.bg.canvas, color: color.text.primary } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="outage-title"
        data-testid="outage-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok || busy) return;
          setBusy(true);
          setError(null);
          const input: OutageInput = { service: service.trim(), message: message.trim(), severity };
          const s = lagosToIso(start);
          if (s) input.started_at = s;
          input.expected_end_at = lagosToIso(end) ?? null;
          if (!outage && input.expected_end_at === null) delete input.expected_end_at;
          onSave(input).catch((err: unknown) => {
            setError(messageFor(err));
            setBusy(false);
          });
        }}
        style={{ width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', backgroundColor: color.bg.canvas, borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <h2 id="outage-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {outage ? tr('Edit outage {{ref}}', { ref: outage.ref }) : tr('Report an outage')}
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
          {tr('Every signed-in app user sees the message in a banner until you mark it resolved. Nothing is blocked.')}
        </p>
        <TextInput label={tr('Service')} value={service} onChange={setService} maxLength={60} testId="outage-service" placeholder={tr('e.g. GBP payouts')} />
        <label style={{ fontSize: 13 }}>
          {tr('Message for app users')}
          <textarea data-testid="outage-message" rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...box, height: 'auto', padding: 8, resize: 'vertical' }} />
          <span style={{ fontSize: 12, color: color.text.secondary }}>{tr('{{n}} of 300 characters', { n: count(message.length) })}</span>
        </label>
        <Select
          label={tr('Severity')}
          value={severity}
          onChange={(v) => setSeverity(v as OutageSeverity)}
          testId="outage-severity"
          options={(Object.keys(SEVERITY) as OutageSeverity[]).map((k) => ({ value: k, label: tr(SEVERITY[k]) }))}
        />
        <label style={{ fontSize: 13 }}>
          {tr('Start time (Lagos time)')}
          <input data-testid="outage-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={box} />
          <span style={{ fontSize: 12, color: color.text.secondary }}>{tr('Leave empty for now. A later time shows the notice from then.')}</span>
        </label>
        <label style={{ fontSize: 13 }}>
          {tr('Expected end (optional, Lagos time)')}
          <input data-testid="outage-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={box} />
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
          <Button type="submit" testId="outage-save" disabled={!ok} busy={busy}>
            {outage ? tr('Save') : tr('Report')}
          </Button>
        </div>
      </form>
    </div>
  );
}
