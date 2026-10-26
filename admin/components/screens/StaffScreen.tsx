'use client';

/**
 * Staff (ADR-060), after the Figma "Staff Creation" frames: the list with search, a status
 * filter and a ⋮ menu per row, and an "Add Staff" form.
 *
 * Actions appear only where the server would allow them (your own permissions cover the
 * role; never yourself; Super Admins only by a Super Admin). The server checks again.
 * Figma's photo, phone number and typed User ID are not here: staff IDs are made by the
 * server and no staff photo or phone is stored (ADR-051 design corrections).
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';

import { AdminApiError, messageFor, type AdminApi, type RoleView, type StaffView } from '../../lib/api';
import { roleLabel } from '../../lib/permissions';
import { useSession } from '../../lib/session';
import { color, space } from '../../theme';
import { BarSelect, FilterBar, SearchBox } from '../FilterBar';
import { Button, Form, FormError, Notice, PageTitle, Select, TextInput } from '../forms';
import { Panel } from '../primitives';
import { RowMenu, type RowAction } from '../RowMenu';
import { DataTable, type Column } from '../table/DataTable';
import { StaffStatus, when, withinMine } from './common';

type StatusFilter = '' | 'active' | 'invited' | 'disabled';

function statusOf(s: StaffView): Exclude<StatusFilter, ''> {
  if (s.status === 'disabled') return 'disabled';
  return s.password_set ? 'active' : 'invited';
}

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
  const [adding, setAdding] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<StaffView | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');

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
  const assignable = roles.filter((r) => (r.name === 'super_admin' ? isSuper : withinMine(r.permissions, can)));
  const canActOn = (s: StaffView): boolean => {
    if (s.id === me.id || !can('staff.update')) return false;
    if (s.role === 'super_admin') return isSuper;
    const r = roles.find((x) => x.id === s.role_id);
    return r ? withinMine(r.permissions, can) : false;
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (staff ?? []).filter(
      (s) =>
        (!q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)) &&
        (!status || statusOf(s) === status),
    );
  }, [staff, search, status]);

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
      setChangingRole(null);
      await load();
    } catch (e) {
      setRowError(messageFor(e));
    }
  }

  const actionsFor = (s: StaffView): RowAction[] => {
    if (!canActOn(s)) return [];
    const out: RowAction[] = [];
    if (assignable.length > 0) {
      out.push({ label: 'Change role', testId: `change-role-${s.id}`, onSelect: () => setChangingRole(s) });
    }
    out.push(
      s.status === 'active'
        ? { label: 'Disable', danger: true, testId: `disable-${s.id}`, onSelect: () => void update(s, { status: 'disabled' }) }
        : { label: 'Enable', testId: `enable-${s.id}`, onSelect: () => void update(s, { status: 'active' }) },
    );
    return out;
  };

  const columns: readonly Column<StaffView>[] = [
    { key: 'name', header: 'NAME', render: (s) => (s.id === me.id ? `${s.name} (you)` : s.name) },
    { key: 'email', header: 'E-MAIL ADDRESS', render: (s) => s.email },
    { key: 'role', header: 'Role', render: (s) => roleLabel(s.role) },
    { key: 'status', header: 'Status', render: (s) => <StaffStatus status={s.status} passwordSet={s.password_set} /> },
    { key: 'last', header: 'Last log-in', render: (s) => when(s.last_login_at) },
    {
      key: 'actions',
      header: 'ACTION',
      render: (s) => <RowMenu label={`Actions for ${s.name}`} actions={actionsFor(s)} testId={`menu-${s.id}`} />,
    },
  ];

  if (adding) {
    return (
      <>
        <PageTitle crumb="Staff">Add Staff</PageTitle>
        <AddStaffForm
          api={api}
          roles={assignable}
          onCancel={() => setAdding(false)}
          onInvited={(inviteId, name) => {
            setAdding(false);
            setNotice(`Invitation sent to ${name}.`);
            setInviteLink(`${origin}/set-password?id=${encodeURIComponent(inviteId)}`);
            void load();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        crumb="Staff"
        action={
          can('staff.create') ? (
            <Button testId="add-staff" onClick={() => { setInviteLink(null); setAdding(true); }}>
              Add Staff
            </Button>
          ) : undefined
        }
      >
        Staff
      </PageTitle>
      <FormError message={rowError} />
      <Notice message={notice} />
      {inviteLink ? (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', borderRadius: 8, backgroundColor: color.bg.canvas, border: `1px solid ${color.border.subtle}` }}>
          <span style={{ color: color.text.secondary }}>
            They got a 6-digit code by email. Send them this link to set their password with it (the link alone does nothing without the code):
          </span>
          <code data-testid="invite-link" style={{ wordBreak: 'break-all' }}>
            {inviteLink}
          </code>
        </div>
      ) : null}
      {changingRole ? (
        <ChangeRole
          staff={changingRole}
          roles={assignable}
          onCancel={() => setChangingRole(null)}
          onSave={(roleId) => void update(changingRole, { role_id: roleId })}
        />
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <SearchBox value={search} onChange={setSearch} placeholder="Search name or email" testId="staff-search" />
        <FilterBar onReset={search || status ? () => { setSearch(''); setStatus(''); } : undefined}>
          <BarSelect
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as StatusFilter)}
            testId="staff-status"
            options={[
              { value: '', label: 'Status' },
              { value: 'active', label: 'Active' },
              { value: 'invited', label: 'Invited' },
              { value: 'disabled', label: 'Disabled' },
            ]}
          />
        </FilterBar>
      </div>
      <Panel>
        <DataTable
          caption="Staff"
          hideCaption
          columns={columns}
          rows={shown}
          status={loadError ? 'error' : staff === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={search || status ? 'No staff match your search' : 'No staff yet'}
        />
      </Panel>
    </>
  );
}

function ChangeRole({
  staff,
  roles,
  onCancel,
  onSave,
}: {
  staff: StaffView;
  roles: RoleView[];
  onCancel: () => void;
  onSave: (roleId: string) => void;
}): ReactElement {
  const [value, setValue] = useState(staff.role_id);
  const known = roles.some((r) => r.id === staff.role_id);
  return (
    <Panel>
      <h2 style={{ margin: 0, fontSize: 16 }}>Change role for {staff.name}</h2>
      <div style={{ display: 'flex', gap: space.sm, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 260 }}>
          <Select
            label="Role"
            value={value}
            onChange={setValue}
            testId={`role-${staff.id}`}
            options={[
              ...(known ? [] : [{ value: staff.role_id, label: roleLabel(staff.role), disabled: true }]),
              ...roles.map((r) => ({ value: r.id, label: roleLabel(r.name) })),
            ]}
          />
        </div>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button testId={`save-role-${staff.id}`} disabled={value === staff.role_id} onClick={() => onSave(value)}>
          Save role
        </Button>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
        They are logged out and see the new role when they log in again.
      </p>
    </Panel>
  );
}

function AddStaffForm({
  api,
  roles,
  onCancel,
  onInvited,
}: {
  api: AdminApi;
  roles: RoleView[];
  onCancel: () => void;
  onInvited: (inviteId: string, name: string) => void;
}): ReactElement {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = first.trim() !== '' && last.trim() !== '' && email.trim() !== '' && roleId !== '';

  async function save(): Promise<void> {
    if (!ready) {
      setError('Enter their first name, last name and email, and choose a role.');
      return;
    }
    setBusy(true);
    setError(null);
    const name = `${first.trim()} ${last.trim()}`;
    try {
      const r = await api.inviteStaff(email.trim(), name, roleId);
      onInvited(r.invite_id, name);
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <Panel>
      {roles.length === 0 ? (
        <p style={{ margin: 0, color: color.text.secondary }}>
          There is no role you can give (you can only give roles within your own permissions).
        </p>
      ) : (
        <Form label="Add Staff" onSubmit={() => void save()}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${space.sm}px 40px`, maxWidth: 680, width: '100%', margin: '24px auto 0' }}>
            <TextInput label="First Name" placeholder="enter" value={first} onChange={setFirst} testId="invite-first" />
            <TextInput label="Last Name" placeholder="enter" value={last} onChange={setLast} testId="invite-last" />
            <TextInput label="Email address" type="email" placeholder="enter" value={email} onChange={setEmail} testId="invite-email" />
            <Select
              label="Role"
              value={roleId}
              onChange={setRoleId}
              testId="invite-role"
              options={[
                { value: '', label: 'Select', disabled: true },
                ...roles.map((r) => ({ value: r.id, label: roleLabel(r.name) })),
              ]}
            />
          </div>
          <p style={{ margin: '0 auto', maxWidth: 680, width: '100%', fontSize: 13, color: color.text.secondary }}>
            They get a 6-digit code by email and set their own password. Their staff ID is made automatically.
          </p>
          <div style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}>
            <FormError message={error} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space.sm, maxWidth: 680, width: '100%', margin: '16px auto 8px' }}>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" busy={busy} disabled={!ready} testId="invite-submit">
              Save Staff
            </Button>
          </div>
        </Form>
      )}
    </Panel>
  );
}
