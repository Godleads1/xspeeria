'use client';

/**
 * Audit log (ADR-060, FX-04): who did what in the console, newest first. Read-only — the
 * database refuses edits and deletes, and there is no control here that could change it.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type AdminApi, type AuditItem } from '../../lib/api';
import { ACTION_LABELS, actionLabel, roleLabel } from '../../lib/permissions';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { Button, PageTitle, Select } from '../forms';
import { Panel } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';

function describe(item: Pick<AuditItem, "detail">): string {
  const d = item.detail ?? {};
  const parts: string[] = [];
  const role = d.role as unknown;
  if (typeof role === 'string') parts.push(`role: ${roleLabel(role)}`);
  if (role && typeof role === 'object' && 'from' in role && 'to' in role) {
    const r = role as { from: unknown; to: unknown };
    parts.push(`role: ${roleLabel(String(r.from))} → ${roleLabel(String(r.to))}`);
  }
  const status = d.status as unknown;
  if (status && typeof status === 'object' && 'to' in status) {
    parts.push(`status → ${String((status as { to: unknown }).to)}`);
  }
  if (typeof d.name === 'string') parts.push(roleLabel(d.name));
  if (Array.isArray(d.added) && d.added.length) parts.push(`added ${d.added.join(', ')}`);
  if (Array.isArray(d.removed) && d.removed.length) parts.push(`removed ${d.removed.join(', ')}`);
  if (Array.isArray(d.permissions)) parts.push(`${d.permissions.length} permissions`);
  if (typeof d.reason === 'string') parts.push(d.reason.replace(/_/g, ' '));
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
    { key: 'at', header: 'When (Lagos)', render: (i) => when(i.at) },
    { key: 'who', header: 'Who', render: (i) => i.staff_email ?? 'Unknown email' },
    { key: 'action', header: 'What', render: (i) => actionLabel(i.action) },
    { key: 'detail', header: 'Details', render: (i) => describe(i) },
    { key: 'ip', header: 'Address', render: (i) => i.ip_address ?? '—' },
  ];

  return (
    <>
      <PageTitle sub="Every log-in and change in the console. Nothing here can be edited or deleted.">
        Audit log
      </PageTitle>
      <div style={{ maxWidth: 320 }}>
        <Select
          label="Show"
          value={action}
          onChange={setAction}
          testId="audit-action"
          options={[
            { value: '', label: 'Everything' },
            ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <Panel>
        <DataTable
          caption="Audit log"
          columns={columns}
          rows={(items ?? []).map((i) => ({ ...i, id: String(i.id) }))}
          status={error && items === null ? 'error' : items === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle="Nothing recorded for this filter"
        />
        {error && items !== null ? <p style={{ color: color.error.text, margin: 0 }}>{error}</p> : null}
        {next ? (
          <Button variant="secondary" busy={busy} testId="audit-older" onClick={() => void load(next)}>
            Show older
          </Button>
        ) : null}
      </Panel>
    </>
  );
}
