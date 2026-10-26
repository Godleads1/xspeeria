'use client';

/**
 * Figma "Dispute category Setup" (ADR-063, owner decision 2026-10-26: staff-managed list,
 * starting with the app's four). Add, rename, switch off or on. Categories are never deleted,
 * because old disputes keep pointing at them; a switched-off one is hidden from the app.
 * Changing the list needs `disputes.approve` (the server checks).
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type DisputeCategory } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color } from '../../theme';
import { Button, Notice, PageTitle } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { RowMenu } from '../RowMenu';
import { DataTable, type Column } from '../table/DataTable';

export function DisputeCategoriesScreen(): ReactElement {
  const { api, can } = useSession();
  const [rows, setRows] = useState<DisputeCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DisputeCategory | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const manage = can('disputes.approve');

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.disputeCategories());
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(c: DisputeCategory): Promise<void> {
    setNotice(null);
    try {
      await api.saveDisputeCategory(c.code, { name: c.name, description: c.description, active: !c.active });
      setNotice(c.active ? tr('{{name}} is switched off; the app no longer offers it.', { name: c.name }) : tr('{{name}} is switched on.', { name: c.name }));
      await load();
    } catch (e) {
      setError(messageFor(e));
    }
  }

  const columns: readonly Column<DisputeCategory>[] = [
    { key: 'name', header: tr('Dispute'), render: (c) => c.name },
    { key: 'description', header: tr('Description'), render: (c) => c.description || '—' },
    { key: 'status', header: tr('Status'), render: (c) => (c.active ? <StatusChip label={tr('Active')} tone="success" /> : <StatusChip label={tr('Switched off')} tone="neutral" />) },
    ...(manage
      ? [
          {
            key: 'actions',
            header: tr('Action'),
            render: (c: DisputeCategory) => (
              <RowMenu
                label={tr('Actions for {{name}}', { name: c.name })}
                testId={`menu-${c.code}`}
                actions={[
                  { label: tr('Edit'), testId: `edit-${c.code}`, onSelect: () => setEditing(c) },
                  c.active
                    ? { label: tr('Switch off'), danger: true, testId: `off-${c.code}`, onSelect: () => void toggle(c) }
                    : { label: tr('Switch on'), testId: `on-${c.code}`, onSelect: () => void toggle(c) },
                ]}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageTitle
        crumb={tr('Dispute category Setup')}
        action={
          manage ? (
            <Button testId="add-category" onClick={() => setEditing('new')}>
              {tr('Add Dispute')}
            </Button>
          ) : undefined
        }
      >
        {tr('Dispute category Setup')}
      </PageTitle>
      <Notice message={notice} />
      {error && rows ? <p role="alert" style={{ color: color.error.text, margin: 0 }}>{error}</p> : null}
      <Panel>
        <DataTable
          caption={tr('Dispute category Setup')}
          hideCaption
          columns={columns}
          rows={(rows ?? []).map((r) => ({ ...r, id: r.code }))}
          status={error && !rows ? 'error' : rows === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={tr('No categories yet')}
        />
      </Panel>
      {editing ? (
        <CategoryDialog
          start={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setNotice(tr('{{name}} is saved.', { name }));
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function CategoryDialog({
  start,
  onCancel,
  onSaved,
}: {
  start: DisputeCategory | null;
  onCancel: () => void;
  onSaved: (name: string) => void;
}): ReactElement {
  const { api } = useSession();
  const [name, setName] = useState(start?.name ?? '');
  const [description, setDescription] = useState(start?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = name.trim().length >= 2;
  const box = { display: 'block', width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15, padding: '6px 0 8px' } as const;

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.saveDisputeCategory(start?.code ?? null, { name: name.trim(), description: description.trim(), active: start?.active ?? true });
      onSaved(name.trim());
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-title"
        data-testid="category-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok && !busy) void save();
        }}
        style={{ width: 390, maxWidth: '100%', backgroundColor: color.bg.canvas, borderRadius: 6, padding: '28px 28px 0', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <h2 id="cat-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {start ? tr('Edit Dispute Category') : tr('Add a Dispute Category')}
        </h2>
        <fieldset style={{ margin: 0, padding: '0 12px', border: `1px solid ${color.border.strong}`, borderRadius: 4 }}>
          <legend style={{ padding: '0 4px', fontSize: 12 }}>
            <label htmlFor="cat-name">{tr('Dispute name')}</label>
          </legend>
          <input id="cat-name" data-testid="cat-name" maxLength={60} placeholder={tr('enter')} value={name} onChange={(e) => setName(e.target.value)} style={box} />
        </fieldset>
        <fieldset style={{ margin: 0, padding: '0 12px', border: `1px solid ${color.border.strong}`, borderRadius: 4 }}>
          <legend style={{ padding: '0 4px', fontSize: 12 }}>
            <label htmlFor="cat-desc">{tr('Description')}</label>
          </legend>
          <textarea id="cat-desc" data-testid="cat-desc" rows={3} maxLength={200} placeholder={tr('enter')} value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...box, resize: 'vertical' }} />
        </fieldset>
        <p style={{ margin: 0, fontSize: 12, color: color.text.secondary }}>{tr('Customers see the name as you write it here, in every language.')}</p>
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 14, padding: '16px 0', borderTop: `1px solid ${color.border.subtle}`, margin: '6px -28px 0', paddingInline: 16 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, height: 48, borderRadius: 10, border: `1px solid ${color.text.primary}`, background: color.bg.canvas, fontFamily: 'inherit', fontSize: 16, cursor: 'pointer' }}>
            {tr('Cancel')}
          </button>
          <button type="submit" data-testid="cat-save" disabled={!ok || busy} style={{ flex: 1, height: 48, borderRadius: 10, border: 'none', background: color.brand.fill, color: color.text.onFill, fontFamily: 'inherit', fontSize: 16, cursor: 'pointer', opacity: !ok || busy ? 0.55 : 1 }}>
            {tr('Save')}
          </button>
        </div>
      </form>
    </div>
  );
}
