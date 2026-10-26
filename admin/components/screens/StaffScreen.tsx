'use client';

/**
 * Staff (ADR-060): everyone with a console account; invite, change role, disable.
 *
 * Buttons appear only where the server would allow the action (your own permissions cover
 * the role; never yourself; Super Admins only by a Super Admin). The server checks again.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { AdminApiError, messageFor, type AdminApi, type RoleView, type StaffView } from '../../lib/api';
import { roleLabel } from '../../lib/permissions';
import { useSession } from '../../lib/session';
import { color, space } from '../../theme';
import { Button, Form, FormError, Notice, PageTitle, Select, TextInput } from '../forms';
import { Panel } from '../primitives';
import { DataTable, type Column } from '../table/DataTable';
import { StaffStatus, when, withinMine } from './common';

export function StaffScreen({
  origin = typeof window === 'undefined' ? '' : window.location.origin,
}: {
  /** For the invite link shown after inviting. */
  origin?: string;
}): ReactElement {
  const { me, can, api } = useSession();
  const [staff, setStaff] = useState<StaffView[] | null>(null);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStaff(await api.listStaff());
    } catch (e) {
      setLoadError(messageFor(e));
    }
    try {
      setRoles(await api.listRoles());
    } catch (e) {
      // Without roles.read the role names still show; only inviting/changing roles is off.
      if (!(e instanceof AdminApiError && e.status === 403)) setLoadError(messageFor(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const isSuper = me.role === 'super_admin';
  const assignable = roles.filter((r) =>
    r.name === 'super_admin' ? isSuper : withinMine(r.permissions, can),
  );
  const roleOf = (id: string) => roles.find((r) => r.id === id);
  const canActOn = (s: StaffView): boolean => {
    if (s.id === me.id || !can('staff.update')) return false;
    if (s.role === 'super_admin') return isSuper;
    const r = roleOf(s.role_id);
    return r ? withinMine(r.permissions, can) : false;
  };

  async function update(s: StaffView, changes: { role_id?: string; status?: 'active' | 'disabled' }): Promise<void> {
    setRowError(null);
    setNotice(null);
    try {
      await api.updateStaff(s.id, changes);
      setNotice(
        changes.status === 'disabled'
          ? `${s.name} is disabled and was logged out.`
          : changes.status === 'active'
            ? `${s.name} can log in again.`
            : `${s.name}’s role is changed. They were logged out and see the new role when they log in.`,
      );
      await load();
    } catch (e) {
      setRowError(messageFor(e));
    }
  }

  const columns: readonly Column<StaffView>[] = [
    { key: 'name', header: 'Name', render: (s) => (s.id === me.id ? `${s.name} (you)` : s.name) },
    { key: 'email', header: 'Email', render: (s) => s.email },
    {
      key: 'role',
      header: 'Role',
      render: (s) =>
        canActOn(s) && assignable.length > 0 ? (
          <RolePicker staff={s} roles={assignable} onSave={(roleId) => void update(s, { role_id: roleId })} />
        ) : (
          roleLabel(s.role)
        ),
    },
    { key: 'status', header: 'Status', render: (s) => <StaffStatus status={s.status} passwordSet={s.password_set} /> },
    { key: 'last', header: 'Last log-in', render: (s) => when(s.last_login_at) },
    {
      key: 'actions',
      header: 'Actions',
      render: (s) =>
        canActOn(s) ? (
          s.status === 'active' ? (
            <Button variant="danger" testId={`disable-${s.id}`} onClick={() => void update(s, { status: 'disabled' })}>
              Disable
            </Button>
          ) : (
            <Button variant="secondary" testId={`enable-${s.id}`} onClick={() => void update(s, { status: 'active' })}>
              Enable
            </Button>
          )
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      <PageTitle sub="Times are Lagos time.">Staff</PageTitle>
      <FormError message={rowError} />
      <Notice message={notice} />
      <Panel>
        <DataTable
          caption="Staff"
          columns={columns}
          rows={staff ?? []}
          status={loadError ? 'error' : staff === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle="No staff yet"
        />
      </Panel>
      {can('staff.create') ? (
        <InviteForm
          api={api}
          roles={assignable}
          origin={origin}
          onInvited={() => void load()}
        />
      ) : null}
    </>
  );
}

function RolePicker({
  staff,
  roles,
  onSave,
}: {
  staff: StaffView;
  roles: RoleView[];
  onSave: (roleId: string) => void;
}): ReactElement {
  const [value, setValue] = useState(staff.role_id);
  const known = roles.some((r) => r.id === staff.role_id);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <Select
        label={`Role for ${staff.name}`}
        hideLabel
        value={value}
        onChange={setValue}
        testId={`role-${staff.id}`}
        options={[
          ...(known ? [] : [{ value: staff.role_id, label: roleLabel(staff.role), disabled: true }]),
          ...roles.map((r) => ({ value: r.id, label: roleLabel(r.name) })),
        ]}
      />
      {value !== staff.role_id ? (
        <Button variant="secondary" testId={`save-role-${staff.id}`} onClick={() => onSave(value)}>
          Save
        </Button>
      ) : null}
    </div>
  );
}

function InviteForm({
  api,
  roles,
  origin,
  onInvited,
}: {
  api: AdminApi;
  roles: RoleView[];
  origin: string;
  onInvited: () => void;
}): ReactElement {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function invite(): Promise<void> {
    setLink(null);
    if (!email.trim() || name.trim().length < 2 || !roleId) {
      setError('Enter their email and name, and choose a role.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.inviteStaff(email.trim(), name.trim(), roleId);
      setLink(`${origin}/set-password?id=${encodeURIComponent(r.invite_id)}`);
      setEmail('');
      setName('');
      setRoleId('');
      onInvited();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <h2 style={{ margin: 0, fontSize: 18 }}>Invite a staff member</h2>
      {roles.length === 0 ? (
        <p style={{ margin: 0, color: color.text.secondary }}>
          There is no role you can give (you can only give roles within your own permissions).
        </p>
      ) : (
        <Form label="Invite a staff member" onSubmit={() => void invite()}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: space.sm }}>
            <TextInput label="Email" type="email" value={email} onChange={setEmail} testId="invite-email" />
            <TextInput label="Name" value={name} onChange={setName} testId="invite-name" />
            <Select
              label="Role"
              value={roleId}
              onChange={setRoleId}
              testId="invite-role"
              options={[
                { value: '', label: 'Choose a role', disabled: true },
                ...roles.map((r) => ({ value: r.id, label: roleLabel(r.name) })),
              ]}
            />
          </div>
          <FormError message={error} />
          <Button type="submit" busy={busy} testId="invite-submit">
            Send invitation
          </Button>
        </Form>
      )}
      {link ? (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>Invitation sent.</strong>
          <span style={{ color: color.text.secondary }}>
            They got a 6-digit code by email. Send them this link to set their password with it (the
            link alone does nothing without the code):
          </span>
          <code data-testid="invite-link" style={{ wordBreak: 'break-all' }}>
            {link}
          </code>
        </div>
      ) : null}
    </Panel>
  );
}
