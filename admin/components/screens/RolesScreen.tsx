'use client';

/**
 * Roles (ADR-051 Create Role, ADR-060): each role is a set of permissions per area —
 * Read / Create / Update / Delete / Approve ("Full access" ticks all five).
 *
 * You can only tick permissions you hold yourself; Super Admin and your own role can't be
 * edited; built-in roles can't be deleted. The server enforces all of this again.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type AdminApi, type RoleView } from '../../lib/api';
import { ACTIONS, MODULES, roleLabel } from '../../lib/permissions';
import { useSession } from '../../lib/session';
import { color, space } from '../../theme';
import { Button, Form, FormError, Notice, PageTitle, TextInput } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { withinMine } from './common';

type Editing = { mode: 'new' } | { mode: 'edit'; role: RoleView } | null;

export function RolesScreen(): ReactElement {
  const { me, can, api } = useSession();
  const [roles, setRoles] = useState<RoleView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRoles(await api.listRoles());
    } catch (e) {
      setLoadError(messageFor(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = (r: RoleView) =>
    can('roles.update') && r.editable && r.id !== me.role_id && withinMine(r.permissions, can);
  const canDelete = (r: RoleView) => can('roles.delete') && !r.builtin && r.staff_count === 0;

  async function remove(r: RoleView): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      await api.deleteRole(r.id);
      setNotice(`Role “${roleLabel(r.name)}” deleted.`);
      await load();
    } catch (e) {
      setError(messageFor(e));
    }
  }

  const columns: readonly Column<RoleView>[] = [
    {
      key: 'name',
      header: 'Role',
      render: (r) => (
        <span>
          {roleLabel(r.name)} {r.builtin ? <StatusChip label="Built in" /> : null}
        </span>
      ),
    },
    { key: 'description', header: 'Description', render: (r) => r.description || '—' },
    { key: 'permissions', header: 'Permissions', numeric: true, render: (r) => r.permissions.length },
    { key: 'staff', header: 'Staff', numeric: true, render: (r) => r.staff_count },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit(r) ? (
            <Button variant="secondary" testId={`edit-${r.name}`} onClick={() => setEditing({ mode: 'edit', role: r })}>
              Edit
            </Button>
          ) : null}
          {canDelete(r) ? (
            <Button variant="danger" testId={`delete-${r.name}`} onClick={() => void remove(r)}>
              Delete
            </Button>
          ) : null}
          {!canEdit(r) && !canDelete(r) ? '—' : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        crumb="Setups"
        sub="What each role may do. You can only give permissions you have yourself."
        action={
          !editing && can('roles.create') ? (
            <Button testId="new-role" onClick={() => setEditing({ mode: 'new' })}>
              Create Role
            </Button>
          ) : undefined
        }
      >
        Role Setup
      </PageTitle>
      <FormError message={error} />
      <Notice message={notice} />
      <Panel>
        <DataTable
          caption="Roles"
          hideCaption
          columns={columns}
          rows={roles ?? []}
          status={loadError ? 'error' : roles === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
        />
      </Panel>
      {editing ? (
        <RoleEditor
          key={editing.mode === 'edit' ? editing.role.id : 'new'}
          api={api}
          role={editing.mode === 'edit' ? editing.role : null}
          can={can}
          onCancel={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNotice(msg);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function RoleEditor({
  api,
  role,
  can,
  onCancel,
  onSaved,
}: {
  api: AdminApi;
  role: RoleView | null;
  can: (p: string) => boolean;
  onCancel: () => void;
  onSaved: (message: string) => void;
}): ReactElement {
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [picked, setPicked] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (p: string) =>
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const fullAccess = (module: string, on: boolean) =>
    setPicked((old) => {
      const next = new Set(old);
      for (const a of ACTIONS) {
        const p = `${module}.${a.id}`;
        if (!can(p)) continue;
        if (on) next.add(p);
        else next.delete(p);
      }
      return next;
    });

  async function save(): Promise<void> {
    if (!role && !/^[a-z][a-z0-9_]{2,39}$/.test(name)) {
      setError('Name: 3–40 lower-case letters, numbers or _ (for example: finance_viewer).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const permissions = [...picked].sort();
      if (role) {
        await api.updateRole(role.id, { description, permissions });
        onSaved(`Role “${roleLabel(role.name)}” saved. People with it see the change on their next page.`);
      } else {
        await api.createRole(name, description, permissions);
        onSaved(`Role “${roleLabel(name)}” created.`);
      }
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h2 style={{ margin: 0, fontSize: 18 }}>{role ? `Edit ${roleLabel(role.name)}` : 'Create a role'}</h2>
      <Form label={role ? 'Edit role' : 'Create a role'} onSubmit={() => void save()}>
        {role ? null : (
          <TextInput
            label="Name"
            value={name}
            onChange={(v) => setName(v.toLowerCase())}
            hint="Lower-case letters, numbers and _ only, e.g. finance_viewer"
            testId="role-name"
          />
        )}
        <TextInput
          label="Description"
          value={description}
          onChange={setDescription}
          required={false}
          maxLength={200}
          testId="role-description"
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <caption style={{ textAlign: 'left', paddingBottom: 8, color: color.text.secondary }}>
              Permissions (greyed out: you don’t have it, so you can’t give it)
            </caption>
            <thead>
              <tr>
                <th scope="col" style={th}>Area</th>
                <th scope="col" style={th}>Full access</th>
                {ACTIONS.map((a) => (
                  <th key={a.id} scope="col" style={th}>
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => {
                const mine = ACTIONS.filter((a) => can(`${m.id}.${a.id}`));
                const allOn = mine.length > 0 && mine.every((a) => picked.has(`${m.id}.${a.id}`));
                return (
                  <tr key={m.id}>
                    <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>
                      {m.label}
                    </th>
                    <td style={td}>
                      <input
                        type="checkbox"
                        aria-label={`${m.label}: full access`}
                        checked={allOn}
                        disabled={mine.length === 0}
                        onChange={(e) => fullAccess(m.id, e.target.checked)}
                      />
                    </td>
                    {ACTIONS.map((a) => {
                      const p = `${m.id}.${a.id}`;
                      return (
                        <td key={a.id} style={td}>
                          <input
                            type="checkbox"
                            data-testid={`perm-${p}`}
                            aria-label={`${m.label}: ${a.label}`}
                            checked={picked.has(p)}
                            disabled={!can(p)}
                            onChange={() => toggle(p)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <FormError message={error} />
        <div style={{ display: 'flex', gap: space.xs }}>
          <Button type="submit" busy={busy} testId="role-save">
            {role ? 'Save role' : 'Create role'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Form>
    </Panel>
  );
}

const th = {
  padding: '6px 8px',
  borderBottom: `1px solid ${color.border.strong}`,
  fontSize: 13,
  textAlign: 'center',
} as const;
const td = { padding: '6px 8px', borderBottom: `1px solid ${color.border.subtle}`, textAlign: 'center' } as const;
