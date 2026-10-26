'use client';

/**
 * Audit log (ADR-060, FX-04): who did what in the console, newest first. Read-only — the
 * database refuses edits and deletes, and there is no control here that could change it.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type AdminApi, type AuditItem } from '../../lib/api';
import { ACTION_LABELS, actionLabel, roleLabel } from '../../lib/permissions';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { BarSelect, FilterBar } from '../FilterBar';
import { Button, PageTitle } from '../forms';
import { Panel } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';

function describe(item: Pick<AuditItem, "detail">): string {
  const d = item.detail ?? {};
  const parts: string[] = [];
  const role = d.role as unknown;
  if (typeof role === 'string') parts.push(tr('role: {{name}}', { name: roleLabel(role) }));
  if (role && typeof role === 'object' && 'from' in role && 'to' in role) {
    const r = role as { from: unknown; to: unknown };
    parts.push(tr('role: {{from}} → {{to}}', { from: roleLabel(String(r.from)), to: roleLabel(String(r.to)) }));
  }
  const status = d.status as unknown;
  if (status && typeof status === 'object' && 'to' in status) {
    parts.push(tr('status → {{to}}', { to: tr(String((status as { to: unknown }).to)) }));
  }
  if (typeof d.name === 'string') parts.push(roleLabel(d.name));
  if (Array.isArray(d.added) && d.added.length) parts.push(tr('added {{list}}', { list: d.added.join(', ') }));
  if (Array.isArray(d.removed) && d.removed.length) parts.push(tr('removed {{list}}', { list: d.removed.join(', ') }));
  if (Array.isArray(d.permissions)) parts.push(tr('{{count}} permissions', { count: d.permissions.length }));
  if (typeof d.reason === 'string') parts.push(tr(d.reason.replace(/_/g, ' ')));
  return parts.join('; ') || '—';
}

export function AuditScreen(): ReactElement {
  const { api } = useSession();
  const [action, setAction] = useState('');
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (before?: number) => {
      setBusy(true);
      setError(null);
      try {
        const page = await api.auditLog({ action: action || undefined, before, limit: 50 });
        setItems((old) => (before ? [...(old ?? []), ...page.items] : page.items));
        setNext(page.next_before);
      } catch (e) {
        setError(messageFor(e));
      } finally {
        setBusy(false);
      }
    },
    [api, action],
  );

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  type Row = Omit<AuditItem, 'id'> & { id: string };

  const columns: readonly Column<Row>[] = [
    { key: 'id', header: tr('ID'), render: (i) => String(i.id).padStart(5, '0') },
    { key: 'who', header: tr('NAME'), render: (i) => i.staff_email ?? tr('Unknown email') },
    { key: 'action', header: tr('ACTION'), render: (i) => actionLabel(i.action) },
    { key: 'detail', header: tr('DETAILS'), render: (i) => describe(i) },
    { key: 'ip', header: tr('ADDRESS'), render: (i) => i.ip_address ?? '—' },
    { key: 'at', header: tr('DATE (LAGOS)'), render: (i) => when(i.at) },
  ];

  return (
    <>
      <PageTitle crumb={tr('Audit Logs')} sub={tr('Every log-in and change in the console. Nothing here can be edited or deleted.')}>
        {tr('Audit Logs')}
      </PageTitle>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <FilterBar onReset={action ? () => setAction('') : undefined}>
          <BarSelect
            label={tr('Show')}
            value={action}
            onChange={setAction}
            testId="audit-action"
            options={[
              { value: '', label: tr('Everything') },
              ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label: tr(label) })),
            ]}
          />
        </FilterBar>
      </div>
      <Panel>
        <DataTable
          caption={tr('Audit log')}
          hideCaption
          columns={columns}
          rows={(items ?? []).map((i) => ({ ...i, id: String(i.id) }))}
          status={error && items === null ? 'error' : items === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={tr('Nothing recorded for this filter')}
        />
        {error && items !== null ? <p style={{ color: color.error.text, margin: 0 }}>{error}</p> : null}
        {next ? (
          <Button variant="secondary" busy={busy} testId="audit-older" onClick={() => void load(next)}>
            {tr('Show older')}
          </Button>
        ) : null}
      </Panel>
    </>
  );
}
